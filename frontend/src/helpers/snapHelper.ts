/**
 * Client-side port proximity detection for snap-to-port preview.
 *
 * Evaluates ALL compatible (placing_port, target_port) pairs across all
 * existing parts, computing the full ghost transform for each, and picks
 * the pair whose resulting ghost position is closest to the cursor.
 *
 * This ensures rods snap end-on correctly regardless of which end is
 * nearest to the target connector.
 */

import { Quaternion, Vector3, MathUtils } from 'three'
import type { KnexPartDef, PartInstance, Port } from '../types/parts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapCandidate {
  /** Instance ID of the existing part with the matching port. */
  instanceId: string
  /** Port ID on the existing part. */
  portId: string
  /** Port ID on the placing part that would connect. */
  placingPortId: string
  /** World position of the target port. */
  worldPosition: [number, number, number]
  /** World direction of the target port. */
  worldDirection: [number, number, number]
  /** Distance from the cursor to the resulting ghost center. */
  distance: number
  /** Inferred physics joint type for the connection. */
  joint_type: 'fixed' | 'revolute' | 'prismatic'
  /** The manual twist angle applied by the user. */
  twist_deg: number
  /** Whether the roll is fixed (manual building always fixes it). */
  fixed_roll: boolean
}

export interface SnapResult {
  /** The best snap candidate, or null if nothing is close enough. */
  candidate: SnapCandidate | null
  /** Position where the ghost part should be placed (snapped). */
  ghostPosition: [number, number, number] | null
  /** Rotation for the ghost part (aligned to the port). */
  ghostRotation: [number, number, number, number] | null
}

// ---------------------------------------------------------------------------
// Joint inference
// ---------------------------------------------------------------------------

/** Infer the physics joint type from two mating ports. */
export function inferJointType(
  placingPort: Port,
  targetPort: Port,
): 'fixed' | 'revolute' | 'prismatic' {
  const mateTypes = new Set([placingPort.mate_type, targetPort.mate_type])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  if (mateTypes.has('slider_hole')) return 'prismatic'
  return 'fixed'
}

// ---------------------------------------------------------------------------
// Port math
// ---------------------------------------------------------------------------

/**
 * Compute the world position and direction of a port on a part instance.
 */
export function getPortWorldPose(
  instance: PartInstance,
  port: Port,
): { position: Vector3; direction: Vector3 } {
  const q = new Quaternion(
    instance.rotation[0],
    instance.rotation[1],
    instance.rotation[2],
    instance.rotation[3],
  )

  const localPos = new Vector3(port.position[0], port.position[1], port.position[2])
  const localDir = new Vector3(port.direction[0], port.direction[1], port.direction[2])

  const worldPos = localPos
    .clone()
    .applyQuaternion(q)
    .add(new Vector3(instance.position[0], instance.position[1], instance.position[2]))
  const worldDir = localDir.clone().applyQuaternion(q)

  return { position: worldPos, direction: worldDir }
}

/** Checks if two ports can physically mate. */
function arePortsCompatible(placingPort: Port, targetPort: Port): boolean {
  return (
    targetPort.accepts.includes(placingPort.mate_type) &&
    placingPort.accepts.includes(targetPort.mate_type)
  )
}

/**
 * Compute the ghost position and rotation if a specific placing port
 * were to connect to a specific target port.
 *
 * Implements a deterministic orientation for `rod_side` mates by aligning the
 * connector's local Z-axis with the rod's local X-axis (the main axis).
 */
export function computeGhostTransform(
  placingPort: Port,
  targetPort: Port,
  targetWorldPos: Vector3,
  targetWorldDir: Vector3,
  angleDeg: number = 0,
  targetInstance?: PartInstance,
  placingDef?: KnexPartDef,
  targetDef?: KnexPartDef,
  isPlacingRod?: boolean,
): { position: Vector3; rotation: Quaternion } {
  const desiredDir = targetWorldDir.clone().normalize().negate()
  const placingLocalDir = new Vector3(
    placingPort.direction[0],
    placingPort.direction[1],
    placingPort.direction[2],
  ).normalize()

  // 1. Base Alignment: align placingPort.direction -> -targetPort.direction
  const rotAxis = new Vector3().crossVectors(placingLocalDir, desiredDir)
  const rotAngle = Math.acos(Math.max(-1, Math.min(1, placingLocalDir.dot(desiredDir))))

  let baseQuat: Quaternion
  if (rotAngle < 0.001) {
    baseQuat = new Quaternion(0, 0, 0, 1)
  } else if (rotAngle > Math.PI - 0.001) {
    const perpAxis = new Vector3(0, 1, 0)
    if (Math.abs(placingLocalDir.dot(perpAxis)) > 0.9) {
      perpAxis.set(1, 0, 0)
    }
    baseQuat = new Quaternion().setFromAxisAngle(perpAxis, Math.PI)
  } else {
    rotAxis.normalize()
    baseQuat = new Quaternion().setFromAxisAngle(rotAxis, rotAngle)
  }

  // 2. Deterministic "Up" Orientation:
  const isRodConnectorSide =
    placingDef &&
    targetDef &&
    ((isPlacingRod && placingPort.mate_type === 'rod_side') ||
      (!isPlacingRod && targetPort.mate_type === 'rod_side'))

  if (isRodConnectorSide && targetInstance) {
    const targetQuat = new Quaternion(
      targetInstance.rotation[0],
      targetInstance.rotation[1],
      targetInstance.rotation[2],
      targetInstance.rotation[3],
    )

    // Determine if we're dealing with a flat connector edge
    const connectorPort = isPlacingRod ? targetPort : placingPort
    const isFlatEdge = Math.abs(connectorPort.direction[2]) < 0.1

    if (!isPlacingRod) {
      // Connector being placed onto Rod.
      // For flat edge: Connector's local Y should align with Rod's world X (rod is flat in plane)
      // For 3D edge: Connector's local Z (normal) should align with Rod's world X (rod is vertical)
      const rodWorldX = new Vector3(1, 0, 0).applyQuaternion(targetQuat).normalize()
      const sourceVec = new Vector3(0, isFlatEdge ? 1 : 0, isFlatEdge ? 0 : 1).applyQuaternion(baseQuat)
      
      const correctionAxis = desiredDir.clone().normalize()
      const projSrc = sourceVec.clone().projectOnPlane(correctionAxis).normalize()
      const projRodX = rodWorldX.clone().projectOnPlane(correctionAxis).normalize()

      if (projSrc.lengthSq() > 0.001 && projRodX.lengthSq() > 0.001) {
        const dot = Math.max(-1, Math.min(1, projSrc.dot(projRodX)))
        const cross = new Vector3().crossVectors(projSrc, projRodX)
        let angle = Math.acos(dot)
        if (cross.dot(correctionAxis) < 0) angle = -angle
        
        const correctionQuat = new Quaternion().setFromAxisAngle(correctionAxis, angle)
        baseQuat.premultiply(correctionQuat)
      }
    } else {
      // Rod being placed onto Connector.
      // For flat edge: Rod's local X should align with Connector's world Y (rod is flat in plane)
      // For 3D edge: Rod's local X should align with Connector's world Z (rod is vertical)
      const targetVec = new Vector3(0, isFlatEdge ? 1 : 0, isFlatEdge ? 0 : 1).applyQuaternion(targetQuat).normalize()
      const rodX = new Vector3(1, 0, 0).applyQuaternion(baseQuat)

      const correctionAxis = desiredDir.clone().normalize()
      const projRodX = rodX.clone().projectOnPlane(correctionAxis).normalize()
      const projTarget = targetVec.clone().projectOnPlane(correctionAxis).normalize()

      if (projRodX.lengthSq() > 0.001 && projTarget.lengthSq() > 0.001) {
        const dot = Math.max(-1, Math.min(1, projRodX.dot(projTarget)))
        const cross = new Vector3().crossVectors(projRodX, projTarget)
        let angle = Math.acos(dot)
        if (cross.dot(correctionAxis) < 0) angle = -angle

        const correctionQuat = new Quaternion().setFromAxisAngle(correctionAxis, angle)
        baseQuat.premultiply(correctionQuat)
      }
    }
  }

  // 3. User Twist
  const twistQuat = new Quaternion().setFromAxisAngle(
    targetWorldDir.clone().normalize(),
    MathUtils.degToRad(angleDeg),
  )
  const ghostQuat = twistQuat.clone().multiply(baseQuat).normalize()

  const placingLocalPos = new Vector3(
    placingPort.position[0],
    placingPort.position[1],
    placingPort.position[2],
  )
  const rotatedLocalPos = placingLocalPos.clone().applyQuaternion(ghostQuat)
  const ghostPos = targetWorldPos.clone().sub(rotatedLocalPos)

  return { position: ghostPos, rotation: ghostQuat }
}

/**
 * Find the best snap by evaluating ALL compatible (placing_port, target_port)
 * pairs and picking the one whose resulting ghost center is closest to cursor.
 *
 * @param cursorWorldPos - Current cursor position in world space
 * @param placingPartDef - Definition of the part being placed
 * @param existingParts - All parts currently in the build
 * @param partDefs - Map of part ID → definition
 * @param snapRadius - Maximum distance (mm) to consider for snapping
 * @returns SnapResult with the best candidate and computed ghost transform
 */
export function findNearestSnap(
  cursorWorldPos: [number, number, number],
  placingPartDef: KnexPartDef,
  existingParts: Record<string, PartInstance>,
  partDefs: Map<string, KnexPartDef>,
  twistAngle: number = 0,
  snapRadius: number = 30,
): SnapResult {
  const cursor = new Vector3(cursorWorldPos[0], cursorWorldPos[1], cursorWorldPos[2])

  let bestCandidate: SnapCandidate | null = null
  let bestGhostPos: Vector3 | null = null
  let bestGhostQuat: Quaternion | null = null
  let bestDistance = snapRadius

  // For each existing part instance
  for (const instance of Object.values(existingParts)) {
    const targetDef = partDefs.get(instance.part_id)
    if (!targetDef) continue

    // For each target port on the existing part
    for (const targetPort of targetDef.ports) {
      const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
        instance,
        targetPort,
      )

      // For each port on the part being placed
      for (const placingPort of placingPartDef.ports) {
        if (!arePortsCompatible(placingPort, targetPort)) continue

        const isPlacingRod = placingPartDef.category === 'rod'
        const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
          placingPort,
          targetPort,
          targetWorldPos,
          targetWorldDir,
          0,
          instance,
          placingPartDef,
          targetDef,
          isPlacingRod
        )

        // Compute distance from cursor to the ghost's center position
        // (this naturally selects the rod end that's closest to where
        // the user is pointing)
        const dist = cursor.distanceTo(ghostPos)

        if (dist < bestDistance) {
          bestDistance = dist
          bestGhostPos = ghostPos
          bestGhostQuat = ghostQuat
          bestCandidate = {
            instanceId: instance.instance_id,
            portId: targetPort.id,
            placingPortId: placingPort.id,
            worldPosition: [targetWorldPos.x, targetWorldPos.y, targetWorldPos.z],
            worldDirection: [targetWorldDir.x, targetWorldDir.y, targetWorldDir.z],
            distance: dist,
            joint_type: inferJointType(placingPort, targetPort),
            twist_deg: twistAngle,
            fixed_roll: true,
          }
        }
      }
    }
  }

  if (!bestCandidate || !bestGhostPos || !bestGhostQuat) {
    return { candidate: null, ghostPosition: null, ghostRotation: null }
  }

  return {
    candidate: bestCandidate,
    ghostPosition: [bestGhostPos.x, bestGhostPos.y, bestGhostPos.z],
    ghostRotation: [bestGhostQuat.x, bestGhostQuat.y, bestGhostQuat.z, bestGhostQuat.w],
  }
}

/**
 * Return [min_offset, max_offset] in mm for a slidable port on a rod,
 * or null if the port is not slidable or the part isn't a valid rod.
 */
export function getSlideRange(part: KnexPartDef, portId: string): [number, number] | null {
  if (!portId.startsWith('center_axial') && !portId.startsWith('center_tangent')) {
    return null
  }

  const port = part.ports.find((p) => p.id === portId)
  if (!port) return null

  const end1 = part.ports.find((p) => p.id === 'end1')
  const end2 = part.ports.find((p) => p.id === 'end2')

  if (!end1 || !end2) return null

  const clearance = (port.slide_clearance_mm ?? 15.0) / 2.0

  const minX = Math.min(end1.position[0], end2.position[0]) + clearance
  const maxX = Math.max(end1.position[0], end2.position[0]) - clearance

  if (minX > maxX) return [0, 0]

  const centerX = port.position[0]

  return [minX - centerX, maxX - centerX]
}
