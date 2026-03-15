/**
 * Lightweight Rapier.js fitness evaluator for synthesis candidates.
 *
 * Unlike the interactive RapierSimulator, this module creates a minimal
 * physics world purely for stability validation. No motor control, no
 * dummy body chains — just rigid bodies, joints, gravity, and measurement.
 *
 * Used by EvolutionaryGenerator to validate top survivors.
 */

import RAPIER from '@dimforge/rapier3d-compat'
import type { SolvedTopologyBuild } from '../topologySolver'
import type { KnexPartDef } from '../../types/parts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RapierFitnessResult {
  /** 0–1, based on final COM height vs initial. 1 = stayed upright. */
  stabilityScore: number
  /** 0–1, based on max joint displacement. 1 = joints held. */
  jointIntegrity: number
  /** true if stabilityScore > 0.5 && jointIntegrity > 0.3 */
  isStable: boolean
  /** Wall-clock time in ms for the simulation */
  simTimeMs: number
}

export interface RapierFitnessOptions {
  /** Simulation duration in seconds (default: 2.0) */
  simDurationSec?: number
  /** Physics timestep in seconds (default: 1/240) */
  timestep?: number
}

// ---------------------------------------------------------------------------
// Vector / quaternion helpers
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number]
type Quat = [number, number, number, number] // [x, y, z, w]

function toRapierQuat(q: Quat): { w: number; x: number; y: number; z: number } {
  return { x: q[0], y: q[1], z: q[2], w: q[3] }
}

function vecDist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
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

// ---------------------------------------------------------------------------
// Joint type inference (mirrors physicsJointType in rapierSimulator.ts)
// ---------------------------------------------------------------------------

function inferJointType(
  fromPortId: string,
  toPortId: string,
  fromMateType: string | undefined,
  toMateType: string | undefined,
): 'fixed' | 'revolute' {
  // Center axial ports are cylindrical, but for fitness eval we treat as revolute
  // (the roll freedom doesn't affect stability measurement)
  if (fromPortId.startsWith('center_axial') || toPortId.startsWith('center_axial')) {
    return 'revolute'
  }
  const mateTypes = new Set([fromMateType, toMateType])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  return 'fixed'
}

// ---------------------------------------------------------------------------
// Collider sizing from part definition
// ---------------------------------------------------------------------------

const PORT_COLLIDER_PADDING = 5

function computeColliderSize(def: KnexPartDef): { halfExtents: Vec3; offset: Vec3 } {
  if (def.category === 'rod') {
    const end2 = def.ports.find((p) => p.id === 'end2')
    const length = end2 ? end2.position[0] : 54
    return {
      halfExtents: [length / 2, 2, 2],
      offset: [length / 2, 0, 0],
    }
  }

  // For connectors/motors: bounding box of ports
  let minX = -2, minY = -2, minZ = -2
  let maxX = 2, maxY = 2, maxZ = 2
  for (const port of def.ports) {
    minX = Math.min(minX, port.position[0] - PORT_COLLIDER_PADDING)
    maxX = Math.max(maxX, port.position[0] + PORT_COLLIDER_PADDING)
    minY = Math.min(minY, port.position[1] - PORT_COLLIDER_PADDING)
    maxY = Math.max(maxY, port.position[1] + PORT_COLLIDER_PADDING)
    minZ = Math.min(minZ, port.position[2] - PORT_COLLIDER_PADDING)
    maxZ = Math.max(maxZ, port.position[2] + PORT_COLLIDER_PADDING)
  }
  return {
    halfExtents: [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2],
    offset: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a synthesis candidate's physical stability using Rapier.js.
 *
 * Creates a fresh physics world, places the model 10mm above ground,
 * runs a short gravity simulation, and measures:
 * - How well the model stays upright (COM height preservation)
 * - How well joints hold together (displacement measurement)
 *
 * @param build - The solved topology build with parts and connections
 * @param partDefsById - Map of part ID to part definition (for mass/geometry)
 * @param options - Simulation parameters
 * @returns Fitness result with stability and joint integrity scores
 */
export async function evaluateRapierFitness(
  build: SolvedTopologyBuild,
  partDefsById: Map<string, KnexPartDef>,
  options: RapierFitnessOptions = {},
): Promise<RapierFitnessResult> {
  const startTime = performance.now()

  const simDurationSec = options.simDurationSec ?? 2.0
  const timestep = options.timestep ?? 1 / 240
  const totalSteps = Math.floor(simDurationSec / timestep)

  await RAPIER.init()

  // Create world with gravity
  const world = new RAPIER.World({ x: 0, y: -9810, z: 0 }) // mm/s²
  world.timestep = timestep
  world.integrationParameters.numSolverIterations = 12

  // Create ground plane
  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -50, 0)
  const groundBody = world.createRigidBody(groundDesc)
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10000, 50, 10000)
    .setCollisionGroups(0x00020001) // Member of group 1, interacts with group 0
  world.createCollider(groundColliderDesc, groundBody)

  // Track initial positions and joint anchors for scoring
  const initialPositions = new Map<string, { x: number; y: number; z: number }>()
  const initialJointAnchors: Array<{
    bodyA: RAPIER.RigidBody
    bodyB: RAPIER.RigidBody
    anchorLocalA: { x: number; y: number; z: number }
    anchorLocalB: { x: number; y: number; z: number }
  }> = []

  // Create rigid bodies for each part
  const bodies = new Map<string, RAPIER.RigidBody>()
  let totalMass = 0
  let initialCOM = { x: 0, y: 0, z: 0 }

  for (const part of build.parts) {
    const def = partDefsById.get(part.part_id)
    const mass = def?.mass_grams ?? 1.0
    totalMass += mass

    // Lift model 10mm above ground to ensure clearance
    const liftedY = part.position[1] + 10

    // Accumulate COM
    initialCOM.x += part.position[0] * mass
    initialCOM.y += liftedY * mass
    initialCOM.z += part.position[2] * mass

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(0.5)
      .setAngularDamping(0.5)
      .setCanSleep(false)
      .setTranslation(part.position[0], liftedY, part.position[2])
      .setRotation(toRapierQuat(part.rotation))

    const body = world.createRigidBody(bodyDesc)

    // Add collider for mass/inertia and ground contact
    if (def) {
      const { halfExtents, offset } = computeColliderSize(def)
      const volume = 8 * halfExtents[0] * halfExtents[1] * halfExtents[2]
      const density = volume > 0 ? mass / volume : 1

      const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2])
        .setDensity(density)
        .setSensor(false) // Real collision for ground contact
        .setTranslation(offset[0], offset[1], offset[2])
        .setFriction(0.5)
        .setRestitution(0.1)
        // Collision groups: membership in group 0, filter groups 0 and 1 (ground)
        // This disables inter-part collisions but allows ground contact
        .setCollisionGroups(0x00010003)

      world.createCollider(colliderDesc, body)
    }

    bodies.set(part.instance_id, body)
    initialPositions.set(part.instance_id, { x: part.position[0], y: liftedY, z: part.position[2] })
  }

  // Normalize COM
  if (totalMass > 0) {
    initialCOM.x /= totalMass
    initialCOM.y /= totalMass
    initialCOM.z /= totalMass
  }

  // Create joints for each connection
  for (const conn of build.connections) {
    const fromBody = bodies.get(conn.from_instance)
    const toBody = bodies.get(conn.to_instance)
    if (!fromBody || !toBody) continue

    const fromPart = build.parts.find((p) => p.instance_id === conn.from_instance)
    const toPart = build.parts.find((p) => p.instance_id === conn.to_instance)
    if (!fromPart || !toPart) continue

    const fromDef = partDefsById.get(fromPart.part_id)
    const toDef = partDefsById.get(toPart.part_id)
    if (!fromDef || !toDef) continue

    const fromPort = fromDef.ports.find((p) => p.id === conn.from_port)
    const toPort = toDef.ports.find((p) => p.id === conn.to_port)
    if (!fromPort || !toPort) continue

    // Compute world-space port positions, accounting for part rotation
    const fromPortLocal: Vec3 = [fromPort.position[0], fromPort.position[1], fromPort.position[2]]
    const toPortLocal: Vec3 = [toPort.position[0], toPort.position[1], toPort.position[2]]
    
    const fromPortRotated = quatApply(fromPart.rotation, fromPortLocal)
    const toPortRotated = quatApply(toPart.rotation, toPortLocal)
    
    const fromPortWorld = {
      x: fromPart.position[0] + fromPortRotated[0],
      y: (fromPart.position[1] + 10) + fromPortRotated[1], // Lifted
      z: fromPart.position[2] + fromPortRotated[2],
    }
    const toPortWorld = {
      x: toPart.position[0] + toPortRotated[0],
      y: (toPart.position[1] + 10) + toPortRotated[1], // Lifted
      z: toPart.position[2] + toPortRotated[2],
    }
    
    // Pivot is midpoint of the two port positions in world space
    const pivotWorld = {
      x: (fromPortWorld.x + toPortWorld.x) / 2,
      y: (fromPortWorld.y + toPortWorld.y) / 2,
      z: (fromPortWorld.z + toPortWorld.z) / 2,
    }

    // Convert pivot to each body's local frame (inverse transform)
    const fromBodyPos = { x: fromPart.position[0], y: fromPart.position[1] + 10, z: fromPart.position[2] }
    const toBodyPos = { x: toPart.position[0], y: toPart.position[1] + 10, z: toPart.position[2] }
    
    const anchorA = quatApply(quatConj(fromPart.rotation), [
      pivotWorld.x - fromBodyPos.x,
      pivotWorld.y - fromBodyPos.y,
      pivotWorld.z - fromBodyPos.z,
    ])
    const anchorB = quatApply(quatConj(toPart.rotation), [
      pivotWorld.x - toBodyPos.x,
      pivotWorld.y - toBodyPos.y,
      pivotWorld.z - toBodyPos.z,
    ])

    const jointType = inferJointType(
      fromPort.id,
      toPort.id,
      fromPort.mate_type,
      toPort.mate_type,
    )

    // Convert Vec3 arrays to objects for Rapier API
    const anchorAObj = { x: anchorA[0], y: anchorA[1], z: anchorA[2] }
    const anchorBObj = { x: anchorB[0], y: anchorB[1], z: anchorB[2] }

    if (jointType === 'revolute') {
      // Revolute joint: allows rotation around axis
      const axisWorld = { x: 1, y: 0, z: 0 } // Simplified: assume X-axis rotation
      const params = RAPIER.JointData.revolute(anchorAObj, anchorBObj, axisWorld)
      const joint = world.createImpulseJoint(params, fromBody, toBody, true)
      joint.setContactsEnabled(false)
    } else {
      // Fixed joint: lock all DOF
      const params = RAPIER.JointData.fixed(
        anchorAObj,
        { w: 1, x: 0, y: 0, z: 0 },
        anchorBObj,
        { w: 1, x: 0, y: 0, z: 0 },
      )
      const joint = world.createImpulseJoint(params, fromBody, toBody, true)
      joint.setContactsEnabled(false)
    }

    initialJointAnchors.push({
      bodyA: fromBody,
      bodyB: toBody,
      anchorLocalA: anchorAObj,
      anchorLocalB: anchorBObj,
    })
  }

  // Run simulation
  for (let i = 0; i < totalSteps; i++) {
    world.step()
  }

  // Calculate final COM
  let finalCOM = { x: 0, y: 0, z: 0 }
  for (const part of build.parts) {
    const body = bodies.get(part.instance_id)
    if (!body) continue
    const def = partDefsById.get(part.part_id)
    const mass = def?.mass_grams ?? 1.0
    const pos = body.translation()
    finalCOM.x += pos.x * mass
    finalCOM.y += pos.y * mass
    finalCOM.z += pos.z * mass
  }
  if (totalMass > 0) {
    finalCOM.x /= totalMass
    finalCOM.y /= totalMass
    finalCOM.z /= totalMass
  }

  // Score: COM height preservation
  // If model maintained height (±20%), score = 1.0. If COM dropped to ground, score ≈ 0.
  const initialHeight = initialCOM.y
  const finalHeight = finalCOM.y
  const heightRatio = initialHeight > 0 ? finalHeight / initialHeight : 1
  const stabilityScore = Math.max(0, Math.min(1, 1.0 - Math.abs(1.0 - heightRatio) * 2))

  // Score: Joint integrity
  // Measure largest joint displacement. If joints held within tolerance, score = 1.0.
  // If joints separated by > 50mm, score = 0 (explosion).
  let maxJointDisplacement = 0
  for (const anchor of initialJointAnchors) {
    const posA = anchor.bodyA.translation()
    const rotA = anchor.bodyA.rotation()
    const posB = anchor.bodyB.translation()
    const rotB = anchor.bodyB.rotation()

    // Rotate local anchors by body rotation, then add body position
    const rotAQuat: Quat = [rotA.x, rotA.y, rotA.z, rotA.w]
    const rotBQuat: Quat = [rotB.x, rotB.y, rotB.z, rotB.w]
    const localA: Vec3 = [anchor.anchorLocalA.x, anchor.anchorLocalA.y, anchor.anchorLocalA.z]
    const localB: Vec3 = [anchor.anchorLocalB.x, anchor.anchorLocalB.y, anchor.anchorLocalB.z]
    
    const rotatedA = quatApply(rotAQuat, localA)
    const rotatedB = quatApply(rotBQuat, localB)

    const worldAnchorA = {
      x: posA.x + rotatedA[0],
      y: posA.y + rotatedA[1],
      z: posA.z + rotatedA[2],
    }
    const worldAnchorB = {
      x: posB.x + rotatedB[0],
      y: posB.y + rotatedB[1],
      z: posB.z + rotatedB[2],
    }

    const displacement = vecDist(worldAnchorA, worldAnchorB)
    maxJointDisplacement = Math.max(maxJointDisplacement, displacement)
  }

  const JOINT_TOLERANCE_MM = 50
  const jointIntegrity = Math.max(0, 1.0 - maxJointDisplacement / JOINT_TOLERANCE_MM)

  // Determine stability
  const isStable = stabilityScore > 0.5 && jointIntegrity > 0.3

  // Cleanup
  world.free()

  const simTimeMs = performance.now() - startTime

  return {
    stabilityScore,
    jointIntegrity,
    isStable,
    simTimeMs,
  }
}
