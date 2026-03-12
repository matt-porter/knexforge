import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

/**
 * Crane template: base platform, vertical tower, horizontal boom with motor.
 * Tree-structured (no closed diagonal loops) for clean topology solving.
 * Generates ~18 parts.
 */
export const craneTemplate: SynthesisTemplate = {
  id: 'crane-v1',
  name: 'Crane',
  description: 'A construction crane with a stable base, vertical tower, horizontal boom arm, and a motor at the boom pivot.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Base platform — spreading feet from a central hub
    parts.push({ instance_id: 'base_hub', part_id: 'connector-5way-yellow-v1' })

    // Three stability feet
    const footPorts = ['A', 'C', 'E'] as const
    for (let i = 0; i < 3; i++) {
      const footId = `foot_${i}`
      const footEndId = `foot_end_${i}`
      parts.push({ instance_id: footId, part_id: 'rod-54-blue-v1' })
      connections.push({
        from: `base_hub.${footPorts[i]}`,
        to: `${footId}.end1`,
        joint_type: 'fixed',
      })
      parts.push({ instance_id: footEndId, part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: `${footId}.end2`,
        to: `${footEndId}.center`,
        joint_type: 'fixed',
      })
    }

    // 2. Tower — vertical rod from base center
    parts.push({ instance_id: 'tower_rod', part_id: 'rod-190-grey-v1' })
    connections.push({
      from: 'base_hub.center',
      to: 'tower_rod.end1',
      joint_type: 'fixed',
    })

    // Tower top connector
    parts.push({ instance_id: 'tower_top', part_id: 'connector-5way-yellow-v1' })
    connections.push({
      from: 'tower_rod.end2',
      to: 'tower_top.center',
      joint_type: 'fixed',
    })

    // 3. Boom arm (horizontal from tower top)
    parts.push({ instance_id: 'boom_rod', part_id: 'rod-190-grey-v1' })

    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      parts.push({ instance_id: 'motor_mount_rod', part_id: 'rod-16-green-v1' })
      connections.push({
        from: 'tower_top.A',
        to: 'motor_mount_rod.end1',
        joint_type: 'fixed',
      })
      connections.push({
        from: 'motor_mount_rod.end2',
        to: 'motor.mount_1',
        joint_type: 'fixed',
      })
      connections.push({
        from: 'motor.drive_axle',
        to: 'boom_rod.end1',
        joint_type: 'revolute',
      })
    } else {
      connections.push({
        from: 'tower_top.A',
        to: 'boom_rod.end1',
        joint_type: 'revolute',
      })
    }

    // Boom tip connector
    parts.push({ instance_id: 'boom_tip', part_id: 'connector-4way-green-v1' })
    connections.push({
      from: 'boom_rod.end2',
      to: 'boom_tip.center',
      joint_type: 'fixed',
    })

    // Boom tip hanging hook (dangling rod + connector)
    parts.push({ instance_id: 'hook_rod', part_id: 'rod-32-white-v1' })
    connections.push({
      from: 'boom_tip.A',
      to: 'hook_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'hook_end', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'hook_rod.end2',
      to: 'hook_end.center',
      joint_type: 'fixed',
    })

    // 4. Counterweight arm on opposite side of tower top
    parts.push({ instance_id: 'counter_rod', part_id: 'rod-86-yellow-v1' })
    connections.push({
      from: 'tower_top.E',
      to: 'counter_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'counter_weight', part_id: 'connector-4way-green-v1' })
    connections.push({
      from: 'counter_rod.end2',
      to: 'counter_weight.center',
      joint_type: 'fixed',
    })

    return {
      format_version: 'topology-v1',
      parts,
      connections,
    }
  },
}
