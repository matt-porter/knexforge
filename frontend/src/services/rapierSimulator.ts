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

function inferJointType(fromPort: Port, toPort: Port): string {
  const mateTypes = new Set([fromPort.mate_type, toPort.mate_type])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  if (mateTypes.has('slider_hole')) return 'prismatic'
  if (fromPort.id.startsWith('center_axial') || toPort.id.startsWith('center_axial'))
    return 'revolute'
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

    // Zero gravity — matching PyBullet simulation
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    this.world.timestep = 1 / 240 // 4 sub-steps at 60fps

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

      const bodyDesc = isMotor
        ? RAPIER.RigidBodyDesc.fixed()
        : RAPIER.RigidBodyDesc.dynamic()
            .setLinearDamping(0.3) // Task 3.10 tuning
            .setAngularDamping(0.3)
            .setCanSleep(false)

      bodyDesc
        .setTranslation(inst.position[0], inst.position[1], inst.position[2])
        .setRotation(toRapierQuat(inst.rotation))

      const body = this.world.createRigidBody(bodyDesc)

      // Sensor collider for mass/inertia only — no contact forces.
      if (!isMotor) {
        const he = getColliderHalfExtents(def)
        const offset = getColliderOffset(def)
        const volume = 8 * he[0] * he[1] * he[2]
        const density = volume > 0 ? def.mass_grams / volume : 1

        const colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
          .setDensity(density)
          .setSensor(true)
          .setTranslation(offset[0], offset[1], offset[2])

        this.world.createCollider(colliderDesc, body)
      }

      this.bodies.set(inst.instance_id, body)
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

      const jointType = inferJointType(fromPort, toPort)

      // Compute pivot in world space (midpoint of the two port positions)
      const fromPortWorld = vecAdd(
        fromInst.position,
        quatApply(fromInst.rotation, fromPort.position),
      )
      const toPortWorld = vecAdd(toInst.position, quatApply(toInst.rotation, toPort.position))
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

      if (jointType === 'revolute') {
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
        // Rapier revolute axis is in body1's local frame
        const axisLocal = quatApply(quatConj(fromInst.rotation), axisWorld)

        const params = RAPIER.JointData.revolute(a1, a2, {
          x: axisLocal[0],
          y: axisLocal[1],
          z: axisLocal[2],
        })
        const joint = this.world.createImpulseJoint(params, fromBody, toBody, true)
        joint.setContactsEnabled(false)

        if (isMotorConn) {
          const revolute = joint as RAPIER.RevoluteImpulseJoint
          revolute.configureMotorVelocity(motorSpeed, 0.5)
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
      joint.configureMotorVelocity(speed, 0.5)
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
