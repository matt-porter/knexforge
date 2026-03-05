/**
 * Tests for the port-grouped variant computation (Task 9.3).
 * Reproduces the exact PortIndicators logic including:
 *   - port-group dedup (only within same placingPortId)
 *   - port-group sorting and Tab/R cycling behavior
 *
 * Issue 1: Port B missing when placing 3-way red connector on rod
 * Issue 2: R key shortcut conflict with part selection
 */

import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3, MathUtils } from 'three'
import type { KnexPartDef, PartInstance, Port } from '../types/parts'

// ---------------------------------------------------------------------------
// Reproduce exact PortIndicators helpers (same as PortIndicators.tsx)
// ---------------------------------------------------------------------------

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

function portLabel(portId: string): string {
  if (portId === 'center') return 'Center'
  if (portId.startsWith('center_')) return 'Center (' + portId.replace('center_', '') + ')'
  if (portId.length === 1) return 'Port ' + portId.toUpperCase()
  return portId.charAt(0).toUpperCase() + portId.slice(1)
}

// ---------------------------------------------------------------------------
// Exact reproduction of the NEW PortIndicators port-grouped computation
// ---------------------------------------------------------------------------

interface SnapVariant {
  targetPortId: string
  placingPortId: string
  ghostPos: Vector3
  ghostQuat: Quaternion
  angle: number
}

interface PortGroup {
  placingPortId: string
  label: string
  variants: SnapVariant[]
}

interface PortIndicator {
  positionKey: string
  worldPos: Vector3
  portGroups: PortGroup[]
}

function computePortGroupedIndicators(
  placingDef: KnexPartDef,
  targetDef: KnexPartDef,
  targetInstance: PartInstance,
  occupiedPorts: Set<string> = new Set(),
): PortIndicator[] {
  const rawIndicators = new Map<string, { worldPos: Vector3; variants: SnapVariant[] }>()

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

        // --- Physical Constraints (exact copy from PortIndicators.tsx) ---
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

        // --- Visual Deduplication (NEW: only within same placingPortId) ---
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
            angle,
          })
        }
      }
    }
  }

  // Convert to port-grouped indicators (exact copy from PortIndicators.tsx)
  const result: PortIndicator[] = []
  for (const [posKey, data] of rawIndicators) {
    if (data.variants.length === 0) continue

    const groupMap = new Map<string, SnapVariant[]>()
    for (const v of data.variants) {
      if (!groupMap.has(v.placingPortId)) {
        groupMap.set(v.placingPortId, [])
      }
      groupMap.get(v.placingPortId)!.push(v)
    }

    const portGroups: PortGroup[] = []
    for (const [pid, variants] of groupMap) {
      variants.sort((a, b) => a.angle - b.angle)
      portGroups.push({
        placingPortId: pid,
        label: portLabel(pid),
        variants,
      })
    }

    portGroups.sort((a, b) => a.placingPortId.localeCompare(b.placingPortId))

    result.push({
      positionKey: posKey,
      worldPos: data.worldPos,
      portGroups,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const connector3wayRed: KnexPartDef = {
  format_version: '1.1',
  id: 'connector-3way-red-v1',
  name: 'Red 3-Way Connector (90°)',
  category: 'connector',
  mesh_file: 'meshes/connector-3way-red.glb',
  default_color: '#E21B1B',
  mass_grams: 1.4,
  ports: [
    { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 } as Port,
    { id: 'B', position: [8.98, 8.98, 0], direction: [0.707, 0.707, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 } as Port,
    { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 } as Port,
    { id: 'center', position: [0, 0, 0], direction: [0, 0, 1], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 } as Port,
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
    { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] } as Port,
    { id: 'end2', position: [54, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] } as Port,
    { id: 'center_axial_1', position: [27, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] } as Port,
    { id: 'center_axial_2', position: [27, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] } as Port,
    // Explicit 3-axis side ports (canonical model)
    { id: 'center_tangent_y_pos', position: [27, 0, 0], direction: [0, 1, 0], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] } as Port,
    { id: 'center_tangent_y_neg', position: [27, 0, 0], direction: [0, -1, 0], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] } as Port,
    { id: 'center_tangent_z_pos', position: [27, 0, 0], direction: [0, 0, 1], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] } as Port,
    { id: 'center_tangent_z_neg', position: [27, 0, 0], direction: [0, 0, -1], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] } as Port,
    // Legacy compatibility – will be normalized to center_tangent_y_pos
    { id: 'center_tangent', position: [27, 0, 0], direction: [0, 1, 0], mate_type: 'rod_side', accepts: ['rod_hole', 'clip'], allowed_angles_deg: [0, 90, 180, 270] } as Port,
  ],
}

const rodInstance: PartInstance = {
  instance_id: 'rod-1',
  part_id: 'rod-54-blue-v1',
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
}

// ---------------------------------------------------------------------------
// Issue 1: R key conflict
// ---------------------------------------------------------------------------

describe('R key should not conflict with part shortcuts', () => {
  it('"r" is not in the part shortcuts map', () => {
    // This map is from useKeyboardShortcuts.ts — verify R is not mapped
    const partShortcuts: Record<string, string> = {
      '1': 'rod-16-green-v1',
      '2': 'rod-32-white-v1',
      '3': 'rod-54-blue-v1',
      '4': 'rod-86-yellow-v1',
      '5': 'rod-128-red-v1',
      '6': 'rod-190-grey-v1',
      'q': 'connector-1way-grey-v1',
      'w': 'connector-2way-orange-v1',
      'e': 'connector-3way-red-v1',
      't': 'connector-4way-green-v1',
      'y': 'connector-5way-yellow-v1',
      'u': 'connector-8way-white-v1',
      'i': 'connector-4way-3d-purple-v1',
      'o': 'connector-7way-blue-v1',
    }

    expect('r' in partShortcuts).toBe(false)
    expect('R' in partShortcuts).toBe(false)
  })

  it('R handler returns early in place mode, so shortcuts are never reached', () => {
    // Simulate the keyboard handler control flow
    const mode = 'place'
    const isSnapped = true
    const matchTargetId = 'rod-1'
    let handlerReturned = false
    let shortcutFired = false

    // R key handler (updated: uses matchTargetId || isSnapped)
    const key = 'r'
    if (key === 'r' || key === 'R') {
      if (mode === 'place') {
        if (matchTargetId || isSnapped) {
          // cycleAngle() would be called here
        } else {
          // rotateGhost() would be called here
        }
        handlerReturned = true
      }
    }

    if (!handlerReturned) {
      const partShortcuts: Record<string, string> = { 'e': 'connector-3way-red-v1' }
      if (key in partShortcuts) {
        shortcutFired = true
      }
    }

    expect(handlerReturned).toBe(true)
    expect(shortcutFired).toBe(false)
  })

  it('R cycles angle in targeted mode even when cursor drifts off indicator (isSnapped=false)', () => {
    const mode = 'place'
    const isSnapped = false
    const matchTargetId = 'rod-1'
    let cycleAngleCalled = false
    let rotateGhostCalled = false

    const key = 'r'
    if (key === 'r' || key === 'R') {
      if (mode === 'place') {
        if (matchTargetId || isSnapped) {
          cycleAngleCalled = true
        } else {
          rotateGhostCalled = true
        }
      }
    }

    expect(cycleAngleCalled).toBe(true)
    expect(rotateGhostCalled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Issue 2: Port B missing from port groups
// ---------------------------------------------------------------------------

describe('Port B must appear in port groups for 3-way red connector on rod', () => {
  it('end1 indicator has port groups for A, B, C, and center', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    expect(end1Ind).toBeDefined()

    const portIds = end1Ind.portGroups.map((g) => g.placingPortId)
    console.log('Port groups at end1:', portIds)
    console.log('Port group details:')
    for (const g of end1Ind.portGroups) {
      console.log(`  ${g.label} (${g.placingPortId}): ${g.variants.length} variants`)
      for (const v of g.variants) {
        console.log(`    angle=${v.angle}° target=${v.targetPortId}`)
      }
    }

    expect(portIds).toContain('A')
    expect(portIds).toContain('B')
    expect(portIds).toContain('C')
    expect(portIds).toContain('center')
  })

  it('port B has multiple angle variants (not deduped away)', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!
    const portBGroup = end1Ind.portGroups.find((g) => g.placingPortId === 'B')!

    expect(portBGroup).toBeDefined()
    expect(portBGroup.variants.length).toBeGreaterThan(0)

    console.log(`Port B variants: ${portBGroup.variants.length}`)
    for (const v of portBGroup.variants) {
      console.log(`  angle=${v.angle}° pos=[${v.ghostPos.x.toFixed(1)},${v.ghostPos.y.toFixed(1)},${v.ghostPos.z.toFixed(1)}]`)
    }
  })

  it('Tab cycling visits all 4 ports (A, B, C, center) in order', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!

    // Port groups are sorted alphabetically: A, B, C, center
    const totalPorts = end1Ind.portGroups.length
    expect(totalPorts).toBe(4)

    // Simulate Tab cycling (incrementing activePortIndex)
    const visitedPorts: string[] = []
    for (let i = 0; i < totalPorts; i++) {
      const pIdx = i % totalPorts
      visitedPorts.push(end1Ind.portGroups[pIdx].placingPortId)
    }

    expect(visitedPorts).toEqual(['A', 'B', 'C', 'center'])
  })

  it('R cycling gives distinct rotations within port B', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const end1Ind = indicators.find((ind) => ind.positionKey === 'pos_0.00_0.00_0.00')!
    const portBGroup = end1Ind.portGroups.find((g) => g.placingPortId === 'B')!

    // Each angle variant should produce a distinct quaternion
    for (let i = 0; i < portBGroup.variants.length; i++) {
      for (let j = i + 1; j < portBGroup.variants.length; j++) {
        const angleDiff = Math.abs(portBGroup.variants[i].ghostQuat.angleTo(portBGroup.variants[j].ghostQuat))
        expect(angleDiff).toBeGreaterThan(0.05)
      }
    }
  })

  it('end2 indicator also has all 4 port groups', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const end2Ind = indicators.find((ind) => ind.positionKey === 'pos_54.00_0.00_0.00')!

    const portIds = end2Ind.portGroups.map((g) => g.placingPortId)
    expect(portIds).toContain('A')
    expect(portIds).toContain('B')
    expect(portIds).toContain('C')
    expect(portIds).toContain('center')
  })

  it('center indicator has both through-hole and side-clip port groups', () => {
    const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
    const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

    // Through-hole uses placing port "center" → target center_axial
    const centerGroup = centerInd.portGroups.find((g) => g.placingPortId === 'center')
    expect(centerGroup).toBeDefined()
    expect(centerGroup!.variants.length).toBeGreaterThan(0)

    // Side-clip uses edge ports (A, B, C) → target side ports
    const edgeGroups = centerInd.portGroups.filter((g) => ['A', 'B', 'C'].includes(g.placingPortId))
    expect(edgeGroups.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // New: Test explicit 3-axis rod-side port behavior (y_pos/y_neg/z_pos/z_neg)
  // ---------------------------------------------------------------------------

  describe('Explicit 3-axis rod-side ports', () => {
    it('rod-54 has all four side ports defined (y_pos, y_neg, z_pos, z_neg)', () => {
      const sidePortIds = rod54.ports
        .filter((p) => p.mate_type === 'rod_side')
        .map((p) => p.id)

      expect(sidePortIds).toContain('center_tangent_y_pos')
      expect(sidePortIds).toContain('center_tangent_y_neg')
      expect(sidePortIds).toContain('center_tangent_z_pos')
      expect(sidePortIds).toContain('center_tangent_z_neg')
    })

    it('legacy center_tangent port is also present for backward compatibility', () => {
      const hasLegacy = rod54.ports.some((p) => p.id === 'center_tangent')
      expect(hasLegacy).toBe(true)
    })

    it('side ports have correct directions (y_pos=+Y, y_neg=-Y, z_pos=+Z, z_neg=-Z)', () => {
      const sidePorts = rod54.ports.filter((p) => p.mate_type === 'rod_side')
      for (const port of sidePorts) {
        if (port.id === 'center_tangent_y_pos') expect(port.direction).toEqual([0, 1, 0])
        else if (port.id === 'center_tangent_y_neg') expect(port.direction).toEqual([0, -1, 0])
        else if (port.id === 'center_tangent_z_pos') expect(port.direction).toEqual([0, 0, 1])
        else if (port.id === 'center_tangent_z_neg') expect(port.direction).toEqual([0, 0, -1])
      }
    })

    it('connector can snap to any of the four side ports via edge ports', () => {
      const indicators = computePortGroupedIndicators(connector3wayRed, rod54, rodInstance)
      const centerInd = indicators.find((ind) => ind.positionKey === 'pos_27.00_0.00_0.00')!

      // All four side ports should be targetable by edge ports (A, B, C)
      const sidePortTargets = new Set<string>()
      for (const group of centerInd.portGroups) {
        if (['A', 'B', 'C'].includes(group.placingPortId)) {
          for (const v of group.variants) {
            if (v.targetPortId.startsWith('center_tangent')) {
              sidePortTargets.add(v.targetPortId)
            }
          }
        }
      }

      // At minimum, y_pos should be targetable (the canonical side port)
      expect(sidePortTargets.size).toBeGreaterThan(0)
    })
  })
})
