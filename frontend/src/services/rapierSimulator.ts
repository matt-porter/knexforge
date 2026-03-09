/**
 * Client-side physics simulation using Rapier.js (WASM).
 *
 * Replaces the server-side PyBullet simulation for real-time motor animation.
 * Uses Rapier's native joint types (Fixed, Revolute) and built-in motor API,
 * avoiding the torque-vs-constraint force imbalance that plagued the PyBullet
 * multi-P2P-constraint approach (see Task 3.10).
 *
 * Tuning constants carried over from Task 3.10:
 * - Linear/angular damping: 0.3
 * - Zero gravity
 * - 4 sub-steps per frame at 60fps (timestep = 1/240)
 *
 * Coordinate convention: positions in mm, quaternions [x, y, z, w].
 */

import RAPIER from '@dimforge/rapier3d-compat'
import type { KnexPartDef, PartInstance, Connection, Port } from '../types/parts'
import { loadAllPartDefs } from '../hooks/usePartLibrary'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number]
type Quat = [number, number, number, number] // [x, y, z, w]
export type Transform = { position: Vec3; quaternion: Quat }

// ---------------------------------------------------------------------------
// Vector / quaternion helpers (pure math, no allocations)
// ---------------------------------------------------------------------------

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vecScale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/** Multiply two quaternions [x,y,z,w]. */
function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Conjugate (inverse for unit quaternions). */
function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

/** Rotate vector v by quaternion q. */
function quatApply(q: Quat, v: Vec3): Vec3 {
  const vq: Quat = [v[0], v[1], v[2], 0]
  const r = quatMul(quatMul(q, vq), quatConj(q))
  return [r[0], r[1], r[2]]
}

/** Convert our [x,y,z,w] to Rapier's {w,x,y,z}. */
function toRapierQuat(q: Quat): { w: number; x: number; y: number; z: number } {
  return { x: q[0], y: q[1], z: q[2], w: q[3] }
}

/** Convert Rapier's {w,x,y,z} back to our [x,y,z,w]. */
function fromRapierQuat(r: { w: number; x: number; y: number; z: number }): Quat {
  return [r.x, r.y, r.z, r.w]
}

// ---------------------------------------------------------------------------
// Joint type inference (mirrors Python src/core/snapping.py::infer_joint_type)
// ---------------------------------------------------------------------------

function physicsJointType(
  fromPort: Port, toPort: Port
): 'fixed' | 'revolute' | 'cylindrical' {
  if (fromPort.id.startsWith('center_axial') || toPort.id.startsWith('center_axial')) {
    return 'cylindrical'
  }
  const mateTypes = new Set([fromPort.mate_type, toPort.mate_type])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  return 'fixed'
}

// ---------------------------------------------------------------------------
// Collider sizing helpers
// ---------------------------------------------------------------------------

function getColliderHalfExtents(def: KnexPartDef): Vec3 {
  if (def.category === 'rod') {
    const end2 = def.ports.find((p) => p.id === 'end2')
    const length = end2 ? end2.position[0] : 54
    return [length / 2, 2, 2]
  }
  // Connectors/motors: compute from port positions with minimum padding
  let maxX = 5,
    maxY = 2.5,
    maxZ = 2.5
  for (const port of def.ports) {
    maxX = Math.max(maxX, Math.abs(port.position[0]) + 2)
    maxY = Math.max(maxY, Math.abs(port.position[1]) + 2)
    maxZ = Math.max(maxZ, Math.abs(port.position[2]) + 2)
  }
  return [maxX, maxY, maxZ]
}

function getColliderOffset(def: KnexPartDef): Vec3 {
  if (def.category === 'rod') {
    const end2 = def.ports.find((p) => p.id === 'end2')
    const length = end2 ? end2.position[0] : 54
    return [length / 2, 0, 0]
  }
  return [0, 0, 0]
}

// ---------------------------------------------------------------------------
// RapierSimulator
// ---------------------------------------------------------------------------

export class RapierSimulator {
  private world: RAPIER.World | null = null
  private bodies = new Map<string, RAPIER.RigidBody>()
  private motorJoints: RAPIER.RevoluteImpulseJoint[] = []
  private _initialized = false

  get initialized(): boolean {
    return this._initialized
  }

  /**
   * Initialize the simulator with build data.
   *
   * Loads part definitions, creates Rapier rigid bodies and joints,
   * and configures motor joints for motorized connections.
   */
  async init(
    parts: Record<string, PartInstance>,
    connections: Connection[],
    motorSpeed: number,
  ): Promise<void> {
    await RAPIER.init()

    const partDefs = await loadAllPartDefs()

    // Earth gravity in mm/s² (positions are in mm)
    this.world = new RAPIER.World({ x: 0, y: -9810, z: 0 })
    this.world.timestep = 1 / 240 // 4 sub-steps at 60fps

    // --- Create static ground plane at Y=0 ---
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
    const groundBody = this.world.createRigidBody(groundDesc)
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10000, 0.1, 10000)
    this.world.createCollider(groundColliderDesc, groundBody)

    // --- Create rigid bodies ---
    const motorIds: string[] = []

    for (const inst of Object.values(parts)) {
      const def = partDefs.get(inst.part_id)
      if (!def) {
        console.warn('[RAPIER] Unknown part_id:', inst.part_id)
        continue
      }

      const isMotor = inst.part_id.includes('motor')
      if (isMotor) motorIds.push(inst.instance_id)

      // Motor parts AND pinned parts are fixed in world space.
      const bodyDesc = (isMotor || inst.is_pinned)
        ? RAPIER.RigidBodyDesc.fixed()
        : RAPIER.RigidBodyDesc.dynamic()
            .setLinearDamping(0.5) // Increased for gravity stability
            .setAngularDamping(0.5)
            .setCanSleep(false)

      bodyDesc
        .setTranslation(inst.position[0], inst.position[1], inst.position[2])
        .setRotation(toRapierQuat(inst.rotation))

      const body = this.world.createRigidBody(bodyDesc)

      // Use real colliders so parts can rest on the ground.
      // We set collision groups to disable inter-part collisions while 
      // allowing part-to-ground collision.
      if (!isMotor) {
        const he = getColliderHalfExtents(def)
        const offset = getColliderOffset(def)
        const volume = 8 * he[0] * he[1] * he[2]
        const density = volume > 0 ? def.mass_grams / volume : 1

        const colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
          .setDensity(density)
          .setSensor(false) // Not a sensor anymore
          .setTranslation(offset[0], offset[1], offset[2])
          .setFriction(0.5)
          .setRestitution(0.1)
          // Collision groups: membership in group 0, filter group 1 (ground)
          // 0x00010002 -> Member of group 0 (bit 0), interacts with group 1 (bit 1)
          .setCollisionGroups(0x00010002)

        this.world.createCollider(colliderDesc, body)
      }

      this.bodies.set(inst.instance_id, body)
    }

    // Update ground collider to be in group 1 and interact with group 0
    // 0x00020001 -> Member of group 1, interacts with group 0
    const groundCollider = groundBody.collider(0)
    if (groundCollider) {
        groundCollider.setCollisionGroups(0x00020001)
    }

    // --- Create joints ---
    for (const conn of connections) {
      const fromBody = this.bodies.get(conn.from_instance)
      const toBody = this.bodies.get(conn.to_instance)
      if (!fromBody || !toBody) continue

      const fromInst = parts[conn.from_instance]
      const toInst = parts[conn.to_instance]
      if (!fromInst || !toInst) continue

      const fromDef = partDefs.get(fromInst.part_id)
      const toDef = partDefs.get(toInst.part_id)
      if (!fromDef || !toDef) continue

      const fromPort = fromDef.ports.find((p) => p.id === conn.from_port)
      const toPort = toDef.ports.find((p) => p.id === conn.to_port)
      if (!fromPort || !toPort) continue

      const physicsType = physicsJointType(fromPort, toPort)

      // Apply slide offset to the anchor position
      let offset1 = 0
      let offset2 = 0
      if (physicsType === 'fixed') {
          // If it's fixed (like center_tangent), the slide_offset determines the fixed position
          if (fromPort.id.startsWith('center_tangent')) offset1 = conn.slide_offset ?? 0
          if (toPort.id.startsWith('center_tangent')) offset2 = conn.slide_offset ?? 0
      } else if (physicsType === 'cylindrical') {
          // For cylindrical, slide_offset determines the initial prismatic offset
          if (fromPort.id.startsWith('center_axial')) offset1 = conn.slide_offset ?? 0
          if (toPort.id.startsWith('center_axial')) offset2 = conn.slide_offset ?? 0
      }
      
      const fromPos = [...fromPort.position] as Vec3
      const toPos = [...toPort.position] as Vec3
      fromPos[0] += offset1
      toPos[0] += offset2

      // Compute pivot in world space (midpoint of the two port positions)
      const fromPortWorld = vecAdd(
        fromInst.position,
        quatApply(fromInst.rotation, fromPos),
      )
      const toPortWorld = vecAdd(toInst.position, quatApply(toInst.rotation, toPos))
      const pivotWorld = vecScale(vecAdd(fromPortWorld, toPortWorld), 0.5)

      // Convert pivot to each body's local frame
      const anchor1 = quatApply(quatConj(fromInst.rotation), vecSub(pivotWorld, fromInst.position))
      const anchor2 = quatApply(quatConj(toInst.rotation), vecSub(pivotWorld, toInst.position))

      const a1 = { x: anchor1[0], y: anchor1[1], z: anchor1[2] }
      const a2 = { x: anchor2[0], y: anchor2[1], z: anchor2[2] }

      // Is this a motor-driven revolute connection?
      const isMotorConn =
        (motorIds.includes(conn.from_instance) || motorIds.includes(conn.to_instance)) &&
        (fromPort.mate_type === 'rotational_hole' || toPort.mate_type === 'rotational_hole')

      if (physicsType === 'cylindrical') {
        const isFromRod = fromDef.category === 'rod'
        const rodDef = isFromRod ? fromDef : toDef
        const rodBody = isFromRod ? fromBody : toBody
        const connBody = isFromRod ? toBody : fromBody
        
        const rodAnchor = isFromRod ? a1 : a2
        const connAnchor = isFromRod ? a2 : a1
        
        const rodLocalX = { x: 1, y: 0, z: 0 }
        
        // Compound joint for cylindrical:
        // 1. Create dummy body at connector's initial position
        const connInst = isFromRod ? toInst : fromInst
        const dummyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(connInst.position[0], connInst.position[1], connInst.position[2])
          .setRotation(toRapierQuat(connInst.rotation))
        const dummyBody = this.world.createRigidBody(dummyDesc)

        // 2. Prismatic: rod <-> dummy (axial slide)
        const prismaticParams = RAPIER.JointData.prismatic(rodAnchor, connAnchor, rodLocalX)
        const prismaticJoint = this.world.createImpulseJoint(prismaticParams, rodBody, dummyBody, true) as RAPIER.PrismaticImpulseJoint
        
        // Compute clearance and limits
        const rodHalfLength = rodDef.ports.find((p) => p.id === 'end2')?.position[0]! / 2
        const clearance = 7.5 // 15mm clearance / 2
        prismaticJoint.setLimits(-rodHalfLength + clearance, rodHalfLength - clearance)
        prismaticJoint.setContactsEnabled(false)

        // 3. Revolute: dummy <-> connector (spin around rod axis)
        const revoluteParams = RAPIER.JointData.revolute(connAnchor, connAnchor, rodLocalX)
        const revoluteJoint = this.world.createImpulseJoint(revoluteParams, dummyBody, connBody, true)
        revoluteJoint.setContactsEnabled(false)

        if (isMotorConn) {
          const revolute = revoluteJoint as RAPIER.RevoluteImpulseJoint
          revolute.configureMotorVelocity(motorSpeed, 50)
          this.motorJoints.push(revolute)
        }
      } else if (physicsType === 'revolute') {
        // Determine rotation axis from the rotational_hole port
        let axisPortDir: Vec3 = fromPort.direction
        let axisRot: Quat = fromInst.rotation
        if (
          fromPort.mate_type !== 'rotational_hole' &&
          toPort.mate_type === 'rotational_hole'
        ) {
          axisPortDir = toPort.direction
          axisRot = toInst.rotation
        }
        const axisWorld = quatApply(axisRot, axisPortDir)
        const axisLocalTo = quatApply(quatConj(toInst.rotation), axisWorld)

        // Rapier's JS bindings for RevoluteJoint lack frame1/frame2 parameters.
        // It forces body1 and body2 local frames to align exactly, causing violent
        // "axis flipping" if they start at an arbitrary relative orientation.
        // Workaround: insert a small dummy body aligned perfectly with toBody.
        const dummyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(toInst.position[0], toInst.position[1], toInst.position[2])
          .setRotation(toRapierQuat(toInst.rotation))
        const dummyBody = this.world.createRigidBody(dummyDesc)

        // Give the dummy body a mass and inertia comparable to the real part
        // so the solver can transmit forces without wobbling.
        const he = getColliderHalfExtents(toDef)
        const offset = getColliderOffset(toDef)
        const volume = 8 * he[0] * he[1] * he[2]
        const density = volume > 0 ? toDef.mass_grams / volume : 1

        const dummyCollider = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
          .setDensity(density)
          .setSensor(true)
          .setTranslation(offset[0], offset[1], offset[2])
        this.world.createCollider(dummyCollider, dummyBody)

        // 1. Fixed joint: fromBody -> dummyBody (preserves arbitrary relative rotation)
        const relativeRot = quatMul(quatConj(toInst.rotation), fromInst.rotation)
        const fixedParams = RAPIER.JointData.fixed(
          a1,
          { w: 1, x: 0, y: 0, z: 0 },
          a2, // anchor in dummyBody is same as toBody because they are co-located
          toRapierQuat(relativeRot),
        )
        const fixedJoint = this.world.createImpulseJoint(fixedParams, fromBody, dummyBody, true)
        fixedJoint.setContactsEnabled(false)

        // 2. Revolute joint: dummyBody -> toBody (frames are identical, so no flipping!)
        const revoluteParams = RAPIER.JointData.revolute(a2, a2, {
          x: axisLocalTo[0],
          y: axisLocalTo[1],
          z: axisLocalTo[2],
        })
        const revoluteJoint = this.world.createImpulseJoint(revoluteParams, dummyBody, toBody, true)
        revoluteJoint.setContactsEnabled(false)

        if (isMotorConn) {
          const revolute = revoluteJoint as RAPIER.RevoluteImpulseJoint
          revolute.configureMotorVelocity(motorSpeed, 50)
          this.motorJoints.push(revolute)
        }
      } else {
        // Fixed joint: lock all 6 DOF, preserving current relative orientation
        const relativeRot = quatMul(quatConj(toInst.rotation), fromInst.rotation)

        const params = RAPIER.JointData.fixed(
          a1,
          { w: 1, x: 0, y: 0, z: 0 },
          a2,
          toRapierQuat(relativeRot),
        )
        const joint = this.world.createImpulseJoint(params, fromBody, toBody, true)
        joint.setContactsEnabled(false)
      }
    }

    this._initialized = true
    console.log(
      '[RAPIER] Initialized: %d bodies, %d motor joints',
      this.bodies.size,
      this.motorJoints.length,
    )
  }

  /**
   * Run a rapid stability check by stepping the simulation forward.
   * If parts move more than a threshold, they are considered unstable.
   * Returns a stability score (0-100) and list of unstable part IDs.
   */
  async checkStability(steps: number = 120): Promise<{ score: number; unstableParts: string[] }> {
    if (!this.world || !this._initialized) return { score: 100, unstableParts: [] }

    // Record initial positions
    const initialPos = new Map<string, { x: number; y: number; z: number }>()
    for (const [id, body] of this.bodies) {
      initialPos.set(id, { ...body.translation() })
    }

    // Step the simulation
    for (let i = 0; i < steps; i++) {
      this.world.step()
    }

    // Check displacement
    const unstableParts: string[] = []
    const threshold = 15.0 // 15mm movement is considered a collapse
    
    for (const [id, body] of this.bodies) {
      const start = initialPos.get(id)
      if (!start) continue
      const end = body.translation()
      
      const dist = Math.sqrt(
        (end.x - start.x) ** 2 +
        (end.y - start.y) ** 2 +
        (end.z - start.z) ** 2
      )
      
      if (dist > threshold) {
        unstableParts.push(id)
      }
    }

    const score = Math.max(0, 100 - (unstableParts.length / this.bodies.size) * 100)
    return { score, unstableParts }
  }

  /**
   * Advance the simulation by one visual frame (4 sub-steps at 1/240s each).
   * Returns a transform map suitable for writing into simulationTransforms.
   */
  step(): Record<string, Transform> {
    if (!this.world || !this._initialized) return {}

    for (let i = 0; i < 4; i++) {
      this.world.step()
    }

    const transforms: Record<string, Transform> = {}
    for (const [instId, body] of this.bodies) {
      const pos = body.translation()
      const rot = body.rotation()
      transforms[instId] = {
        position: [pos.x, pos.y, pos.z],
        quaternion: fromRapierQuat(rot),
      }
    }
    return transforms
  }

  /** Update motor target velocity (rad/s). */
  setMotorSpeed(speed: number): void {
    for (const joint of this.motorJoints) {
      joint.configureMotorVelocity(speed, 2)
    }
  }

  /** Tear down the simulation, freeing WASM memory. */
  destroy(): void {
    if (this.world) {
      this.world.free()
      this.world = null
    }
    this.bodies.clear()
    this.motorJoints = []
    this._initialized = false
  }
}
