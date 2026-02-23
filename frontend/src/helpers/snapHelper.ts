/**
 * Client-side port proximity detection for snap-to-port preview.
 *
 * This finds the nearest compatible port on existing parts to a given
 * world position, enabling the ghost preview to snap into place.
 * The actual connection validation is done by the Python core.
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
  /** World position of the target port. */
  worldPosition: [number, number, number]
  /** World direction of the target port. */
  worldDirection: [number, number, number]
  /** Distance from the cursor to this port. */
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

  const worldPos = localPos.clone().applyQuaternion(q).add(
    new Vector3(instance.position[0], instance.position[1], instance.position[2]),
  )
  const worldDir = localDir.clone().applyQuaternion(q)

  return { position: worldPos, direction: worldDir }
}

/**
 * Check if two port types are compatible for snapping.
 * rod_end ↔ rod_hole is the primary compatible pair.
 */
function arePortsCompatible(
  placingPort: Port,
  targetPort: Port,
): boolean {
  return (
    targetPort.accepts.includes(placingPort.mate_type) ||
    placingPort.accepts.includes(targetPort.mate_type)
  )
}

/**
 * Find the nearest compatible snap target for a part being placed.
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
  let bestDistance = snapRadius

  // For each existing part, check each port
  for (const instance of Object.values(existingParts)) {
    const targetDef = partDefs.get(instance.part_id)
    if (!targetDef) continue

    for (const targetPort of targetDef.ports) {
      // Check if any port on the placing part is compatible
      const hasCompatiblePort = placingPartDef.ports.some((p) =>
        arePortsCompatible(p, targetPort),
      )
      if (!hasCompatiblePort) continue

      const { position: worldPos } = getPortWorldPose(instance, targetPort)
      const dist = cursor.distanceTo(worldPos)

      if (dist < bestDistance) {
        bestDistance = dist
        bestCandidate = {
          instanceId: instance.instance_id,
          portId: targetPort.id,
          worldPosition: [worldPos.x, worldPos.y, worldPos.z],
          worldDirection: [0, 0, 0], // filled below
          distance: dist,
        }

        const { direction: worldDir } = getPortWorldPose(instance, targetPort)
        bestCandidate.worldDirection = [worldDir.x, worldDir.y, worldDir.z]
      }
    }
  }

  if (!bestCandidate) {
    return { candidate: null, ghostPosition: null, ghostRotation: null }
  }

  // Compute the snapped ghost position and rotation.
  // Find the first compatible port on the placing part.
  const placingPort = placingPartDef.ports.find((p) => {
    const targetDef = partDefs.get(existingParts[bestCandidate!.instanceId].part_id)
    if (!targetDef) return false
    const targetPort = targetDef.ports.find((tp) => tp.id === bestCandidate!.portId)
    if (!targetPort) return false
    return arePortsCompatible(p, targetPort)
  })

  if (!placingPort) {
    return { candidate: bestCandidate, ghostPosition: null, ghostRotation: null }
  }

  // Compute rotation: align placing port direction to oppose target port direction
  const targetDir = new Vector3(
    bestCandidate.worldDirection[0],
    bestCandidate.worldDirection[1],
    bestCandidate.worldDirection[2],
  )
  const desiredDir = targetDir.clone().negate() // rod inserts opposite to hole

  const placingLocalDir = new Vector3(
    placingPort.direction[0],
    placingPort.direction[1],
    placingPort.direction[2],
  )

  // Compute rotation from placing port local direction to desired world direction
  const ghostQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)

  // Compute position: target port world pos minus rotated placing port local pos
  const placingLocalPos = new Vector3(
    placingPort.position[0],
    placingPort.position[1],
    placingPort.position[2],
  )
  const rotatedLocalPos = placingLocalPos.clone().applyQuaternion(ghostQuat)
  const ghostPos = new Vector3(
    bestCandidate.worldPosition[0],
    bestCandidate.worldPosition[1],
    bestCandidate.worldPosition[2],
  ).sub(rotatedLocalPos)

  return {
    candidate: bestCandidate,
    ghostPosition: [ghostPos.x, ghostPos.y, ghostPos.z],
    ghostRotation: [ghostQuat.x, ghostQuat.y, ghostQuat.z, ghostQuat.w],
  }
}
