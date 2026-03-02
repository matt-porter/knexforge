/**
 * Comprehensive test: simulates PortIndicators variant generation
 * for placing a connector onto a rod. Verifies side-clip variants
 * appear alongside through-hole variants at the rod center indicator.
 */

import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3, MathUtils } from 'three'
import type { KnexPartDef, PartInstance, Port } from '../types/parts'

// ---- Reproduce exact PortIndicators logic ----

function arePortsCompatible(placingPort: Port, targetPort: Port): boolean {
  return (
    targetPort.accepts.includes(placingPort.mate_type) &&
    placingPort.accepts.includes(targetPort.mate_type)
  )
}

function computeGhostTransform(
  placingPort: Port,
  targetWorldPos: Vector3,
  targetWorldDir: Vector3,
  angleDeg: number = 0,
): { position: Vector3; rotation: Quaternion } {
  const desiredDir = targetWorldDir.clone().negate()
  const placingLocalDir = new Vector3(...placingPort.direction)
  const baseQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)
  const twistQuat = new Quaternion().setFromAxisAngle(
    targetWorldDir,
    MathUtils.degToRad(angleDeg),
  )
  const ghostQuat = twistQuat.clone().multiply(baseQuat)
  const placingLocalPos = new Vector3(...placingPort.position)
  const rotatedLocalPos = placingLocalPos.clone().applyQuaternion(ghostQuat)
  const ghostPos = targetWorldPos.clone().sub(rotatedLocalPos)
  return { position: ghostPos, rotation: ghostQuat }
}

function getPortWorldPose(
  instance: PartInstance,
  port: Port,
): { position: Vector3; direction: Vector3 } {
  const q = new Quaternion(...instance.rotation)
  const localPos = new Vector3(...port.position)
  const localDir = new Vector3(...port.direction)
  const worldPos = localPos.clone().applyQuaternion(q).add(new Vector3(...instance.position))
  const worldDir = localDir.clone().applyQuaternion(q)
  return { position: worldPos, direction: worldDir }
}

/** Full reproduction of the PortIndicators constraint + dedup + grouping logic */
function computeIndicators(
  placingDef: KnexPartDef,
  targetDef: KnexPartDef,
  targetInstance: PartInstance,
  occupiedPorts: Set<string> = new Set(),
) {
  const indicators: {
    positionKey: string
    worldPos: Vector3
    variants: {
      targetPortId: string
      placingPortId: string
      ghostPos: Vector3
      ghostQuat: Quaternion
    }[]
  }[] = []

  for (const targetPort of targetDef.ports) {
    if (occupiedPorts.has(targetPort.id)) continue

    const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
      targetInstance,
      targetPort,
    )

    const posKey = `pos_${targetWorldPos.x.toFixed(2)}_${targetWorldPos.y.toFixed(2)}_${targetWorldPos.z.toFixed(2)}`
    let existingInd = indicators.find((ind) => ind.positionKey === posKey)
    if (!existingInd) {
      existingInd = { positionKey: posKey, worldPos: targetWorldPos, variants: [] }
      indicators.push(existingInd)
    }

    for (const placingPort of placingDef.ports) {
      if (!arePortsCompatible(placingPort, targetPort)) continue

      const targetAngles = targetPort.allowed_angles_deg?.length > 0 ? targetPort.allowed_angles_deg : [0]
      const placingAngles = placingPort.allowed_angles_deg?.length > 0 ? placingPort.allowed_angles_deg : [0]
      const angles = placingAngles.length > targetAngles.length ? placingAngles : targetAngles

      for (const angle of angles) {
        const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
          placingPort,
          targetWorldPos,
          targetWorldDir,
          angle,
        )

        // --- Physical Constraints (exact copy from PortIndicators) ---
        let isValid = true

        if (
          (placingDef.category === 'rod' && targetDef.category === 'connector') ||
          (placingDef.category === 'connector' && targetDef.category === 'rod')
        ) {
          const isPlacingRod = placingDef.category === 'rod'

          const rodWorldMainAxis = isPlacingRod
            ? new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
            : new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...targetInstance.rotation))

          const connectorWorldZ = isPlacingRod
            ? new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...targetInstance.rotation))
            : new Vector3(0, 0, 1).applyQuaternion(ghostQuat)

          const connectorDir = isPlacingRod ? targetPort.direction : placingPort.direction
          const rodMateType = isPlacingRod ? placingPort.mate_type : targetPort.mate_type
          const rodPortId = isPlacingRod ? placingPort.id : targetPort.id
          const connectorPortId = isPlacingRod ? targetPort.id : placingPort.id

          const isFlatConnectorEdge = Math.abs(connectorDir[2]) < 0.1
          const is3DConnectorEdge = Math.abs(connectorDir[2]) > 0.9

          if (rodMateType === 'rod_side') {
            if (isFlatConnectorEdge) {
              if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
            } else if (is3DConnectorEdge) {
              if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
            }
          }

          if (rodPortId.startsWith('center_axial')) {
            if (connectorPortId !== 'center') {
              isValid = false
            }
            if (connectorPortId === 'center') {
              if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
            }
          }

          if (rodMateType === 'rod_end' && !rodPortId.startsWith('center_axial')) {
            if (connectorPortId !== 'center') {
              if (isFlatConnectorEdge) {
                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
              }
            } else {
              if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
            }
          }
        }

        if (!isValid) continue

        // --- Visual Deduplication (exact copy from PortIndicators) ---
        const isDuplicate = existingInd.variants.some((v) => {
          if (v.ghostPos.distanceToSquared(ghostPos) > 0.01) return false

          if (placingDef.category === 'rod') {
            const vWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(v.ghostQuat)
            const currentWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
            return Math.abs(vWorldMainAxis.dot(currentWorldMainAxis)) > 0.99
          } else {
            return Math.abs(v.ghostQuat.angleTo(ghostQuat)) < 0.05
          }
        })

        if (!isDuplicate) {
          existingInd.variants.push({
            targetPortId: targetPort.id,
            placingPortId: placingPort.id,
            ghostPos,
            ghostQuat,
          })
        }
      }
    }
  }

  return indicators.filter((ind) => ind.variants.length > 0)
}

// ---- Test data (real part defs) ----

const connector4way: KnexPartDef = {
  format_version: '1.1',
  id: 'connector-4way-green-v1',
  name: 'Green 4-Way Connector (135°)',
  category: 'connector',
  mesh_file: 'meshes/connector-4way-green.glb',
  default_color: '#00B050',
  mass_grams: 1.5,
  ports: [
    { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'B', position: [8.98, 8.98, 0], direction: [0.707, 0.707, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'D', position: [-8.98, 8.98, 0], direction: [-0.707, 0.707, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'center', position: [0, 0, 0], direction: [0, 0, 1], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0, 90, 180, 270] },
  ],
}

const rod54: KnexPartDef = {
  format_version: '1.1',
  id: 'rod-54-blue-v1',
  name: 'Blue Rod (54 mm)',
  category: 'rod',
  mesh_file: 'meshes/rod-54-blue.glb',
  default_color: '#0070C0',
  mass_grams: 1.2,
  ports: [
    { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
    { id: 'end2', position: [54, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
    { id: 'center_axial_1', position: [27, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
    { id: 'center_axial_2', position: [27, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
    { id: 'center_tangent', position: [27, 0, 0], direction: [0, 1, 0], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] },
  ],
}

const rodInstance: PartInstance = {
  instance_id: 'rod-1',
  part_id: 'rod-54-blue-v1',
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
}

// ---- Tests ----

describe('PortIndicators: placing 4-way connector onto rod', () => {
  it('generates indicators at rod center, end1, and end2', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const posKeys = indicators.map((ind) => ind.positionKey)

    // Should have indicators at 3 distinct positions: end1 [0,0,0], end2 [54,0,0], center [27,0,0]
    expect(indicators.length).toBeGreaterThanOrEqual(3)
    expect(posKeys).toContain('pos_0.00_0.00_0.00')   // end1
    expect(posKeys).toContain('pos_54.00_0.00_0.00')   // end2
    expect(posKeys).toContain('pos_27.00_0.00_0.00')   // center
  })

  it('center indicator has through-hole variants (from center_axial)', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    const throughHole = centerInd.variants.filter(
      (v) => v.targetPortId === 'center_axial_1' || v.targetPortId === 'center_axial_2',
    )
    expect(throughHole.length).toBeGreaterThan(0)

    // Through-hole must use the connector's center port
    for (const v of throughHole) {
      expect(v.placingPortId).toBe('center')
    }
  })

  it('center indicator has side-clip variants (from center_tangent)', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    const sideClip = centerInd.variants.filter((v) => v.targetPortId === 'center_tangent')
    expect(sideClip.length).toBeGreaterThan(0)

    // Side-clip must use a connector edge port (A, B, C, or D), NOT center
    for (const v of sideClip) {
      expect(['A', 'B', 'C', 'D']).toContain(v.placingPortId)
    }
  })

  it('Tab cycles through both through-hole AND side-clip at the center indicator', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    const throughHole = centerInd.variants.filter(
      (v) => v.targetPortId === 'center_axial_1' || v.targetPortId === 'center_axial_2',
    )
    const sideClip = centerInd.variants.filter((v) => v.targetPortId === 'center_tangent')

    console.log(`Center indicator variants: ${centerInd.variants.length} total`)
    console.log(`  Through-hole: ${throughHole.length}`)
    console.log(`  Side-clip: ${sideClip.length}`)
    for (const v of centerInd.variants) {
      console.log(`  - target=${v.targetPortId} placing=${v.placingPortId} pos=[${v.ghostPos.x.toFixed(1)},${v.ghostPos.y.toFixed(1)},${v.ghostPos.z.toFixed(1)}]`)
    }

    // CRITICAL: both types must be present
    expect(throughHole.length).toBeGreaterThan(0)
    expect(sideClip.length).toBeGreaterThan(0)
    expect(centerInd.variants.length).toBe(throughHole.length + sideClip.length)
  })

  it('end indicator has multiple connector orientations from placing port angles', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!
    const end2Ind = indicators.find((ind) => ind.positionKey === 'pos_54.00_0.00_0.00')!

    // Rod end ports have allowed_angles_deg: [0], but connector edge ports have [0, 90, 180, 270].
    // The fix picks the longer angle list (placingAngles) so we get 4 angles per compatible pair.
    // Without the fix, only angle=0 would be tried, severely limiting orientations.
    expect(end1Ind.variants.length).toBeGreaterThan(1)
    expect(end2Ind.variants.length).toBeGreaterThan(1)

    console.log(`End1 indicator variants: ${end1Ind.variants.length}`)
    for (const v of end1Ind.variants) {
      console.log(`  - target=${v.targetPortId} placing=${v.placingPortId} pos=[${v.ghostPos.x.toFixed(1)},${v.ghostPos.y.toFixed(1)},${v.ghostPos.z.toFixed(1)}]`)
    }
  })

  it('end indicator uses connector edge ports, not center', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    // End-on snapping into edge clips (A, B, C, D) should work.
    // Center port connects rod_end, but requires rod to be perpendicular to connector plane,
    // which is a different orientation than the edge clips.
    const edgeVariants = end1Ind.variants.filter(v => ['A', 'B', 'C', 'D'].includes(v.placingPortId))
    const centerVariants = end1Ind.variants.filter(v => v.placingPortId === 'center')

    // Edge clips should be present (rod lying in the connector plane)
    expect(edgeVariants.length).toBeGreaterThan(0)

    // Center through-hole also valid (rod perpendicular through center)
    expect(centerVariants.length).toBeGreaterThan(0)

    // Both types accessible via Tab cycling
    expect(end1Ind.variants.length).toBe(edgeVariants.length + centerVariants.length)
  })
})

// ---- Additional part definitions for regression tests ----

const connector3wayRed: KnexPartDef = {
  format_version: '1.1',
  id: 'connector-3way-red-v1',
  name: 'Red 3-Way Connector (90°)',
  category: 'connector',
  mesh_file: 'meshes/connector-3way-red.glb',
  default_color: '#FF0000',
  mass_grams: 1.3,
  ports: [
    { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'B', position: [8.98, 8.98, 0], direction: [0.707, 0.707, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'center', position: [0, 0, 0], direction: [0, 0, 1], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0, 90, 180, 270] },
  ],
}

const connector4way3dPurple: KnexPartDef = {
  format_version: '1.1',
  id: 'connector-4way-3d-purple-v1',
  name: 'Purple 4-Way 3D Connector',
  category: 'connector',
  mesh_file: 'meshes/connector-4way-3d-purple.glb',
  default_color: '#800080',
  mass_grams: 1.8,
  ports: [
    { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'B', position: [8.98, 8.98, 0], direction: [0.7071, 0.7071, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'D', position: [-8.98, 8.98, 0], direction: [-0.7071, 0.7071, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'slot', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'connector_slot', accepts: ['connector_slot'], allowed_angles_deg: [90, 270] },
    { id: 'center', position: [0, 0, 0], direction: [0, 0, 1], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0, 90, 180, 270] },
  ],
}

const connector7wayBlue: KnexPartDef = {
  format_version: '1.1',
  id: 'connector-7way-blue-v1',
  name: 'Blue 7-Way Connector',
  category: 'connector',
  mesh_file: 'meshes/connector-7way-blue.glb',
  default_color: '#0000FF',
  mass_grams: 2.0,
  ports: [
    { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'B', position: [8.98, 8.98, 0], direction: [0.7071, 0.7071, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'D', position: [-8.98, 8.98, 0], direction: [-0.7071, 0.7071, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'E', position: [-12.7, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'F', position: [-8.98, -8.98, 0], direction: [-0.7071, -0.7071, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'G', position: [0, -12.7, 0], direction: [0, -1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
    { id: 'slot', position: [0, 0, 0], direction: [0.7071, -0.7071, 0], mate_type: 'connector_slot', accepts: ['connector_slot'], allowed_angles_deg: [90, 270] },
    { id: 'center', position: [0, 0, 0], direction: [0, 0, 1], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0, 90, 180, 270] },
  ],
}

const blueConnectorInstance: PartInstance = {
  instance_id: 'blue-conn-1',
  part_id: 'connector-7way-blue-v1',
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
}

describe('PortIndicators: placing 3-way red connector onto rod (middle port B)', () => {
  it('end1 indicator includes port B variants', () => {
    const indicators = computeIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    const portIds = new Set(end1Ind.variants.map(v => v.placingPortId))
    console.log(`Red connector on rod end1: ports used = ${[...portIds].join(', ')}`)
    console.log(`  Total variants: ${end1Ind.variants.length}`)
    for (const v of end1Ind.variants) {
      console.log(`  - placing=${v.placingPortId} target=${v.targetPortId}`)
    }

    // All three edge ports (A, B, C) and center must be reachable
    expect(portIds.has('A')).toBe(true)
    expect(portIds.has('B')).toBe(true)
    expect(portIds.has('C')).toBe(true)
    expect(portIds.has('center')).toBe(true)
  })
})

describe('PortIndicators: placing purple connector onto blue connector (slot-to-slot)', () => {
  it('produces at least one indicator with slot variants', () => {
    const indicators = computeIndicators(connector4way3dPurple, connector7wayBlue, blueConnectorInstance)

    console.log(`Purple on Blue: ${indicators.length} indicators`)
    for (const ind of indicators) {
      console.log(`  Position ${ind.positionKey}: ${ind.variants.length} variants`)
      for (const v of ind.variants) {
        console.log(`    - placing=${v.placingPortId} target=${v.targetPortId}`)
      }
    }

    // The slot ports are compatible (connector_slot ↔ connector_slot)
    const slotIndicators = indicators.filter(ind =>
      ind.variants.some(v => v.placingPortId === 'slot' || v.targetPortId === 'slot')
    )
    expect(slotIndicators.length).toBeGreaterThan(0)

    // Should have variants using both slot ports
    const allSlotVariants = slotIndicators.flatMap(ind =>
      ind.variants.filter(v => v.placingPortId === 'slot' && v.targetPortId === 'slot')
    )
    expect(allSlotVariants.length).toBeGreaterThan(0)
  })
})
