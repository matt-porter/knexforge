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

import { Quaternion, Vector3 } from 'three'
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

/**
 * Check if two port types are compatible for snapping.
 * rod_end ↔ rod_hole is the primary compatible pair.
 */
function arePortsCompatible(placingPort: Port, targetPort: Port): boolean {
  return (
    targetPort.accepts.includes(placingPort.mate_type) ||
    placingPort.accepts.includes(targetPort.mate_type)
  )
}

/**
 * Compute the ghost position and rotation if a specific placing port
 * were to connect to a specific target port.
 */
function computeGhostTransform(
  placingPort: Port,
  targetWorldPos: Vector3,
  targetWorldDir: Vector3,
): { position: Vector3; rotation: Quaternion } {
  // Rod inserts opposite to hole direction
  const desiredDir = targetWorldDir.clone().negate()

  const placingLocalDir = new Vector3(
    placingPort.direction[0],
    placingPort.direction[1],
    placingPort.direction[2],
  )

  // Rotation to align placing port direction → desired world direction
  const ghostQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)

  // Position: target port pos minus rotated placing port local pos
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

        // Compute where the ghost would end up if this pair connected
        const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
          placingPort,
          targetWorldPos,
          targetWorldDir,
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
