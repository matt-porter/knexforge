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
  
  // Connectors/motors: compute bounding box from all port positions
  let minX = -2, minY = -2, minZ = -2
  let maxX = 2, maxY = 2, maxZ = 2
  
  for (const port of def.ports) {
    minX = Math.min(minX, port.position[0] - 5)
    maxX = Math.max(maxX, port.position[0] + 5)
    minY = Math.min(minY, port.position[1] - 5)
    maxY = Math.max(maxY, port.position[1] + 5)
    minZ = Math.min(minZ, port.position[2] - 5)
    maxZ = Math.max(maxZ, port.position[2] + 5)
  }
  
  return [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2]
}

function getColliderOffset(def: KnexPartDef): Vec3 {
  if (def.category === 'rod') {
    const end2 = def.ports.find((p) => p.id === 'end2')
    const length = end2 ? end2.position[0] : 54
    return [length / 2, 0, 0]
  }

  // Connectors: offset to the center of the port-based bounding box
  let minX = -2, minY = -2, minZ = -2
  let maxX = 2, maxY = 2, maxZ = 2
  
  for (const port of def.ports) {
    minX = Math.min(minX, port.position[0] - 5)
    maxX = Math.max(maxX, port.position[0] + 5)
    minY = Math.min(minY, port.position[1] - 5)
    maxY = Math.max(maxY, port.position[1] + 5)
    minZ = Math.min(minZ, port.position[2] - 5)
    maxZ = Math.max(maxZ, port.position[2] + 5)
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
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
    
    // Increase solver iterations for stiffer, more stable constraints/collisions
    this.world.integrationParameters.numSolverIterations = 12
    this.world.integrationParameters.prediction = 0.5 // Higher prediction for small-scale stability

    // --- Create static ground plane (thicker to prevent tunneling) ---
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -50, 0)
    const groundBody = this.world.createRigidBody(groundDesc)
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10000, 50, 10000)
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
          // Collision groups: membership in group 0 (0x0001), 
          // filter group 0 and 1 (0x0003). 
          // This allows parts to collide with each other (0-0) and ground (0-1).
          .setCollisionGroups(0x00010003)

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

    // --- Pre-calculate rod occupancy for prismatic limits ---
    const rodOccupancy = new Map<string, number>()
    
    // Initialize with rod ends for all rods in the build
    for (const inst of Object.values(parts)) {
      const def = partDefs.get(inst.part_id)
      if (def?.category === 'rod') {
        const end2 = def.ports.find(p => p.id === 'end2')
        const length = end2 ? end2.position[0] : 54
        rodOccupancy.set(inst.instance_id, length)
      }
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
        const rodInst = isFromRod ? fromInst : toInst
        const connDef = isFromRod ? toDef : fromDef
        const connInst = isFromRod ? toInst : fromInst
        const rodBody = isFromRod ? fromBody : toBody
        const connBody = isFromRod ? toBody : fromBody
        
        const rodAnchor = isFromRod ? a1 : a2
        const connAnchor = isFromRod ? a2 : a1
        
        // --- 1. dummyP: Prismatic dummy co-aligned with the ROD ---
        // This dummy handles the sliding and follows the rod's rotation perfectly.
        const dummyPDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(pivotWorld[0], pivotWorld[1], pivotWorld[2])
          .setRotation(toRapierQuat(rodInst.rotation))
          .setLinearDamping(0.5)
          .setAngularDamping(0.5)
          .setGravityScale(0) // Don't let the dummy pull the joint down
        const dummyP = this.world.createRigidBody(dummyPDesc)

        // Give dummies enough mass to be stable
        const dummyPCollider = RAPIER.ColliderDesc.cuboid(2, 2, 2)
          .setDensity(0.1)
          .setSensor(true)
        this.world.createCollider(dummyPCollider, dummyP)

        // Prismatic: rod <-> dummyP (both rod-aligned)
        const prismaticParams = RAPIER.JointData.prismatic(rodAnchor, {x:0, y:0, z:0}, {x:1, y:0, z:0})
        const prismaticJoint = this.world.createImpulseJoint(prismaticParams, rodBody, dummyP, true) as RAPIER.PrismaticImpulseJoint
        
        // --- Calculate prismatic boundaries (rod ends only) ---
        const rodId = isFromRod ? conn.from_instance : conn.to_instance
        const rodPort = isFromRod ? fromPort : toPort
        const x_current = rodPort.position[0] + (conn.slide_offset ?? 0)
        const rodLength = rodOccupancy.get(rodId) ?? 54
        
        const halfWidth = 7.5
        const limit_min = halfWidth - x_current
        const limit_max = (rodLength - halfWidth) - x_current
        
        prismaticJoint.setLimits(Math.min(limit_min, 0), Math.max(limit_max, 0))
        prismaticJoint.setContactsEnabled(false)

        // --- 2. dummyR: Revolute dummy co-aligned with the CONNECTOR ---
        // This dummy handles the arbitrary relative orientation between rod and connector.
        const dummyRDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(pivotWorld[0], pivotWorld[1], pivotWorld[2])
          .setRotation(toRapierQuat(connInst.rotation))
          .setLinearDamping(0.5)
          .setAngularDamping(0.5)
          .setGravityScale(0) // No gravity for rotation dummy
        const dummyR = this.world.createRigidBody(dummyRDesc)

        const dummyRCollider = RAPIER.ColliderDesc.cuboid(2, 2, 2)
          .setDensity(0.1)
          .setSensor(true)
        this.world.createCollider(dummyRCollider, dummyR)

        // Fixed: dummyP <<->> dummyR (locks relative orientation)
        // We want: dummyP.rotation * identity = dummyR.rotation * frame2
        // Initially: rodInst.rotation = connInst.rotation * frame2
        // So: frame2 = connInst.rotation^-1 * rodInst.rotation
        const frame2 = quatMul(quatConj(connInst.rotation), rodInst.rotation)
        const fixedParams = RAPIER.JointData.fixed(
          {x:0, y:0, z:0}, {w:1, x:0, y:0, z:0},
          {x:0, y:0, z:0}, toRapierQuat(frame2)
        )
        const fixedJoint = this.world.createImpulseJoint(fixedParams, dummyP, dummyR, true)
        fixedJoint.setContactsEnabled(false)

        // --- 3. dummyR <-> Connector (Revolute) ---
        // Both are co-aligned with the connector, so we spin around the rod's axis 
        // as expressed in the connector's local frame.
        const rodWorldX = quatApply(rodInst.rotation, [1, 0, 0])
        const rodXInConn = quatApply(quatConj(connInst.rotation), rodWorldX)
        const mag = Math.sqrt(rodXInConn[0]**2 + rodXInConn[1]**2 + rodXInConn[2]**2)
        const axis = mag > 1e-6 ? { x: rodXInConn[0]/mag, y: rodXInConn[1]/mag, z: rodXInConn[2]/mag } : { x: 1, y: 0, z: 0 }
        
        const revoluteParams = RAPIER.JointData.revolute({x:0, y:0, z:0}, connAnchor, axis)
        const revoluteJoint = this.world.createImpulseJoint(revoluteParams, dummyR, connBody, true)
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
          .setGravityScale(0)
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
