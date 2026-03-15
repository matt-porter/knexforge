import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

/**
 * Ferris Wheel template: central hub with radial spokes ending in rim connectors.
 * Tree-structured (no rim ring loops) so topology solver handles it cleanly.
 * Generates ~22 parts depending on spoke count.
 */
export const ferrisWheelTemplate: SynthesisTemplate = {
  id: 'ferris-wheel-v1',
  name: 'Ferris Wheel',
  description: 'A large wheel structure with a central hub, radial spokes, and rim connectors. Optionally motor-driven.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const spokeCount = typeof params.spokeCount === 'number' ? params.spokeCount : 6
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Central Hub — 8-way white connector
    parts.push({ instance_id: 'hub', part_id: 'connector-8way-white-v1' })

    // 2. Axle rod through the hub center
    parts.push({ instance_id: 'axle_rod', part_id: 'rod-128-red-v1' })
    connections.push({
      from: 'hub.center',
      to: 'axle_rod.end1',
      joint_type: 'fixed',
    })

    // 3. Axle support stand
    parts.push({ instance_id: 'axle_stand', part_id: 'connector-4way-green-v1' })
    connections.push({
      from: 'axle_rod.end2',
      to: 'axle_stand.center',
      joint_type: 'fixed',
    })

    // Stand legs for stability
    parts.push({ instance_id: 'stand_leg_1', part_id: 'rod-54-blue-v1' })
    parts.push({ instance_id: 'stand_leg_2', part_id: 'rod-54-blue-v1' })
    connections.push({
      from: 'axle_stand.A',
      to: 'stand_leg_1.end1',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'axle_stand.C',
      to: 'stand_leg_2.end1',
      joint_type: 'fixed',
    })

    parts.push({ instance_id: 'stand_foot_1', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'stand_foot_2', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'stand_leg_1.end2',
      to: 'stand_foot_1.center',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'stand_leg_2.end2',
      to: 'stand_foot_2.center',
      joint_type: 'fixed',
    })

    // 4. Motor or passive mount
    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      parts.push({ instance_id: 'motor_mount_rod', part_id: 'rod-16-green-v1' })
      connections.push({
        from: 'axle_stand.D',
        to: 'motor_mount_rod.end1',
        joint_type: 'fixed',
      })
      connections.push({
        from: 'motor_mount_rod.end2',
        to: 'motor.mount_1',
        joint_type: 'fixed',
      })
      // Motor drives a rod (no loop back into hub)
      parts.push({ instance_id: 'drive_output', part_id: 'rod-32-white-v1' })
      connections.push({
        from: 'motor.drive_axle',
        to: 'drive_output.end1',
        joint_type: 'revolute',
      })
      parts.push({ instance_id: 'drive_tip', part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: 'drive_output.end2',
        to: 'drive_tip.center',
        joint_type: 'fixed',
      })
    }

    // 5. Radial spokes from hub to rim connectors (tree — no rim connections)
    const hubPorts = useMotor
      ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W']
      : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const actualSpokeCount = Math.min(spokeCount, hubPorts.length)

    for (let i = 0; i < actualSpokeCount; i++) {
      const port = hubPorts[i]
      const spokeId = `spoke_${i}`
      const rimConnId = `rim_conn_${i}`

      // Spoke rod (blue 54mm)
      parts.push({ instance_id: spokeId, part_id: 'rod-54-blue-v1' })
      connections.push({
        from: `hub.${port}`,
        to: `${spokeId}.end1`,
        joint_type: 'fixed',
      })

      // Rim connector (5-way yellow) at spoke tip
      parts.push({ instance_id: rimConnId, part_id: 'connector-5way-yellow-v1' })
      connections.push({
        from: `${spokeId}.end2`,
        to: `${rimConnId}.center`,
        joint_type: 'fixed',
      })
    }

    return {
      format_version: 'topology-v1',
      parts,
      connections,
    }
  },
}
