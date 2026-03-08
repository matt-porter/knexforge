import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { MathUtils, Quaternion, Vector3 } from 'three'
import type { KnexPartDef, PartInstance, Port } from '../types/parts'

const LEGACY_ROD_SIDE_PORT_ID = 'center_tangent'

function loadPartDef(partId: string): KnexPartDef {
  const filePath = path.resolve(__dirname, '../../../parts', `${partId}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnexPartDef
}

function arePortsCompatible(placingPort: Port, targetPort: Port): boolean {
  return (
    targetPort.accepts.includes(placingPort.mate_type) &&
    placingPort.accepts.includes(targetPort.mate_type)
  )
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

function computeGhostTransform(
  placingPort: Port,
  targetWorldPos: Vector3,
  targetWorldDir: Vector3,
  angleDeg: number,
): { position: Vector3; rotation: Quaternion } {
  const desiredDir = targetWorldDir.clone().normalize().negate()
  const placingLocalDir = new Vector3(...placingPort.direction).normalize()
  const baseQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)
  const twistQuat = new Quaternion().setFromAxisAngle(
    targetWorldDir.clone().normalize(),
    MathUtils.degToRad(angleDeg),
  )
  const ghostQuat = twistQuat.clone().multiply(baseQuat)
  const localPos = new Vector3(...placingPort.position)
  const ghostPos = targetWorldPos.clone().sub(localPos.clone().applyQuaternion(ghostQuat))
  return { position: ghostPos, rotation: ghostQuat }
}

function hasExplicitRodSidePorts(def: KnexPartDef): boolean {
  return def.ports.some(
    (port) => port.id.startsWith('center_tangent_') && port.id !== LEGACY_ROD_SIDE_PORT_ID,
  )
}

function normalizeRodSidePortId(portId: string): string {
  return portId === LEGACY_ROD_SIDE_PORT_ID ? 'center_tangent_y_pos' : portId
}

function sideSortRank(sideId: string): number {
  switch (sideId) {
    case 'center_tangent_y_pos':
      return 0
    case 'center_tangent_y_neg':
      return 1
    case 'center_tangent_z_pos':
      return 2
    case 'center_tangent_z_neg':
      return 3
    default:
      return 100
  }
}

describe('rod-side candidate grouping regressions', () => {
  it('groups side-clip variants into deterministic side buckets', () => {
    const placingDef = loadPartDef('connector-2way-orange-v1')
    const targetDef = loadPartDef('rod-54-blue-v1')
    const targetInstance: PartInstance = {
      instance_id: 'rod-1',
      part_id: targetDef.id,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    }

    const skipLegacyTargetSide = targetDef.category === 'rod' && hasExplicitRodSidePorts(targetDef)
    const variants: Array<{ placingPortId: string; sideId: string; targetPortId: string }> = []

    for (const targetPort of targetDef.ports) {
      if (skipLegacyTargetSide && targetPort.id === LEGACY_ROD_SIDE_PORT_ID) continue

      const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
        targetInstance,
        targetPort,
      )
      const posKey = `pos_${targetWorldPos.x.toFixed(2)}_${targetWorldPos.y.toFixed(2)}_${targetWorldPos.z.toFixed(2)}`
      if (posKey !== 'pos_27.00_0.00_0.00') continue

      for (const placingPort of placingDef.ports) {
        if (!arePortsCompatible(placingPort, targetPort)) continue

        const targetAngles = targetPort.allowed_angles_deg?.length ? targetPort.allowed_angles_deg : [0]
        const placingAngles = placingPort.allowed_angles_deg?.length ? placingPort.allowed_angles_deg : [0]
        const angles = placingAngles.length > targetAngles.length ? placingAngles : targetAngles

        for (const angle of angles) {
          computeGhostTransform(placingPort, targetWorldPos, targetWorldDir, angle)
          const sidePort =
            placingPort.mate_type === 'rod_side'
              ? placingPort
              : targetPort.mate_type === 'rod_side'
                ? targetPort
                : null
          variants.push({
            placingPortId: placingPort.id,
            sideId: sidePort ? normalizeRodSidePortId(sidePort.id) : '__default',
            targetPortId: targetPort.id,
          })
        }
      }
    }

    const groupA = variants.filter((v) => v.placingPortId === 'A')
    expect(groupA.length).toBeGreaterThan(0)

    const uniqueSides = [...new Set(groupA.map((v) => v.sideId))].sort((a, b) => {
      const rank = sideSortRank(a) - sideSortRank(b)
      if (rank !== 0) return rank
      return a.localeCompare(b)
    })

    expect(uniqueSides.slice(0, 4)).toEqual([
      'center_tangent_y_pos',
      'center_tangent_y_neg',
      'center_tangent_z_pos',
      'center_tangent_z_neg',
    ])
    expect(uniqueSides).toContain('__default')
  })
})
