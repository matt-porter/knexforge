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
  const rawIndicators: Map<string, { worldPos: Vector3; variants: { targetPortId: string; placingPortId: string; ghostPos: Vector3; ghostQuat: Quaternion }[] }> = new Map()

  for (const targetPort of targetDef.ports) {
    if (occupiedPorts.has(targetPort.id)) continue

    const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
      targetInstance,
      targetPort,
    )

    const posKey = `pos_${targetWorldPos.x.toFixed(2)}_${targetWorldPos.y.toFixed(2)}_${targetWorldPos.z.toFixed(2)}`
    if (!rawIndicators.has(posKey)) {
      rawIndicators.set(posKey, { worldPos: targetWorldPos, variants: [] })
    }
    const indData = rawIndicators.get(posKey)!

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

        // --- Visual Deduplication (matches real PortIndicators code) ---
        // Only dedup within the SAME placing port
        const isDuplicate = indData.variants.some((v) => {
          if (v.ghostPos.distanceToSquared(ghostPos) > 0.01) return false
          if (v.placingPortId !== placingPort.id) return false

          if (placingDef.category === 'rod') {
            const vWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(v.ghostQuat)
            const currentWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
            return Math.abs(vWorldMainAxis.dot(currentWorldMainAxis)) > 0.99
          } else {
            return Math.abs(v.ghostQuat.angleTo(ghostQuat)) < 0.05
          }
        })

        if (!isDuplicate) {
          indData.variants.push({
            targetPortId: targetPort.id,
            placingPortId: placingPort.id,
            ghostPos,
            ghostQuat,
          })
        }
      }
    }
  }

  // Convert to port-grouped format (matches real PortIndicators)
  const result: {
    positionKey: string
    worldPos: Vector3
    portGroups: {
      placingPortId: string
      variants: { targetPortId: string; placingPortId: string; ghostPos: Vector3; ghostQuat: Quaternion }[]
    }[]
  }[] = []

  for (const [posKey, data] of rawIndicators) {
    if (data.variants.length === 0) continue

    const groupMap = new Map<string, typeof data.variants>()
    for (const v of data.variants) {
      if (!groupMap.has(v.placingPortId)) groupMap.set(v.placingPortId, [])
      groupMap.get(v.placingPortId)!.push(v)
    }

    const portGroups = Array.from(groupMap.entries()).map(([pid, variants]) => ({
      placingPortId: pid,
      variants,
    }))
    portGroups.sort((a, b) => a.placingPortId.localeCompare(b.placingPortId))

    result.push({ positionKey: posKey, worldPos: data.worldPos, portGroups })
  }

  return result
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

/** Helper: collect all variants from all port groups into a flat array */
function allVariants(ind: ReturnType<typeof computeIndicators>[0]) {
  return ind.portGroups.flatMap(g => g.variants)
}

/** Helper: get all unique placing port IDs from an indicator */
function portIds(ind: ReturnType<typeof computeIndicators>[0]) {
  return new Set(ind.portGroups.map(g => g.placingPortId))
}

describe('PortIndicators: placing 4-way connector onto rod', () => {
  it('generates indicators at rod center, end1, and end2', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const posKeys = indicators.map((ind) => ind.positionKey)

    expect(indicators.length).toBeGreaterThanOrEqual(3)
    expect(posKeys).toContain('pos_0.00_0.00_0.00')   // end1
    expect(posKeys).toContain('pos_54.00_0.00_0.00')   // end2
    expect(posKeys).toContain('pos_27.00_0.00_0.00')   // center
  })

  it('center indicator has through-hole port group (center)', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    const centerGroup = centerInd.portGroups.find(g => g.placingPortId === 'center')
    expect(centerGroup).toBeDefined()
    expect(centerGroup!.variants.length).toBeGreaterThan(0)
  })

  it('center indicator has side-clip port groups (A, B, C, D)', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    const edgeGroups = centerInd.portGroups.filter(g => ['A', 'B', 'C', 'D'].includes(g.placingPortId))
    expect(edgeGroups.length).toBeGreaterThan(0)
  })

  it('end1 indicator has port groups for all edge ports AND center', () => {
    const indicators = computeIndicators(connector4way, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    const pids = portIds(end1Ind)
    console.log(`Green 4-way end1 port groups: ${[...pids].join(', ')}`)
    expect(pids.has('A')).toBe(true)
    expect(pids.has('B')).toBe(true)
    expect(pids.has('C')).toBe(true)
    expect(pids.has('D')).toBe(true)
    expect(pids.has('center')).toBe(true)
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

describe('PortIndicators: placing 3-way red connector onto rod', () => {
  it('end1 indicator has port groups for ALL ports: A, B, C, center', () => {
    const indicators = computeIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    const pids = portIds(end1Ind)
    console.log(`Red 3-way end1 port groups: ${[...pids].join(', ')}`)
    for (const g of end1Ind.portGroups) {
      console.log(`  Port ${g.placingPortId}: ${g.variants.length} angle variants`)
    }

    // All three edge ports AND center must have their own port group
    expect(pids.has('A')).toBe(true)
    expect(pids.has('B')).toBe(true)
    expect(pids.has('C')).toBe(true)
    expect(pids.has('center')).toBe(true)
    expect(end1Ind.portGroups.length).toBe(4)
  })

  it('port B has angle variants (not deduped away)', () => {
    const indicators = computeIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    const bGroup = end1Ind.portGroups.find(g => g.placingPortId === 'B')
    expect(bGroup).toBeDefined()
    expect(bGroup!.variants.length).toBeGreaterThan(0)
    console.log(`Port B variants: ${bGroup!.variants.length}`)
  })

  it('center port has angle variants', () => {
    const indicators = computeIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    const centerGroup = end1Ind.portGroups.find(g => g.placingPortId === 'center')
    expect(centerGroup).toBeDefined()
    expect(centerGroup!.variants.length).toBeGreaterThan(0)
    console.log(`Center port variants: ${centerGroup!.variants.length}`)
  })
})

describe('PortIndicators: placing purple connector onto blue connector (slot-to-slot)', () => {
  it('produces slot port group with variants', () => {
    const indicators = computeIndicators(connector4way3dPurple, connector7wayBlue, blueConnectorInstance)

    console.log(`Purple on Blue: ${indicators.length} indicators`)
    for (const ind of indicators) {
      const pids = portIds(ind)
      console.log(`  Position ${ind.positionKey}: ports = ${[...pids].join(', ')}`)
    }

    // Find indicator with slot port group
    const slotInd = indicators.find(ind =>
      ind.portGroups.some(g => g.placingPortId === 'slot')
    )
    expect(slotInd).toBeDefined()

    const slotGroup = slotInd!.portGroups.find(g => g.placingPortId === 'slot')!
    expect(slotGroup.variants.length).toBeGreaterThan(0)

    // All slot variants must target the blue slot
    for (const v of slotGroup.variants) {
      expect(v.targetPortId).toBe('slot')
    }
  })
})
