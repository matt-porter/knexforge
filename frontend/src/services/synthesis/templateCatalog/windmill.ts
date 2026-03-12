import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

/**
 * Windmill template: vertical mast with motor and radial blade arms.
 * Tree-structured for clean topology solving.
 * Generates ~18 parts depending on blade count.
 */
export const windmillTemplate: SynthesisTemplate = {
  id: 'windmill-v1',
  name: 'Windmill',
  description: 'A windmill with a vertical mast, motor at the top, and radial blade arms extending from a hub connector.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const bladeCount = typeof params.bladeCount === 'number' ? params.bladeCount : 4
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Base — stable tripod foot using 5-way connector
    parts.push({ instance_id: 'base_conn', part_id: 'connector-5way-yellow-v1' })

    // Base feet for stability (3 spreading rods)
    const basePorts = ['A', 'C', 'E'] as const
    for (let i = 0; i < 3; i++) {
      const footId = `foot_${i}`
      const footEndId = `foot_end_${i}`
      parts.push({ instance_id: footId, part_id: 'rod-54-blue-v1' })
      connections.push({
        from: `base_conn.${basePorts[i]}`,
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

    // 2. Vertical mast (grey 190mm)
    parts.push({ instance_id: 'mast', part_id: 'rod-190-grey-v1' })
    connections.push({
      from: 'base_conn.center',
      to: 'mast.end1',
      joint_type: 'fixed',
    })

    // 3. Mast top connector
    parts.push({ instance_id: 'mast_top', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'mast.end2',
      to: 'mast_top.center',
      joint_type: 'fixed',
    })

    // 4. Motor or passive hub at top
    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      parts.push({ instance_id: 'motor_mount_rod', part_id: 'rod-16-green-v1' })
      connections.push({
        from: 'mast_top.A',
        to: 'motor_mount_rod.end1',
        joint_type: 'fixed',
      })
      connections.push({
        from: 'motor_mount_rod.end2',
        to: 'motor.mount_1',
        joint_type: 'fixed',
      })

      // Hub for blades (driven by motor)
      parts.push({ instance_id: 'blade_hub', part_id: 'connector-5way-yellow-v1' })
      parts.push({ instance_id: 'drive_rod', part_id: 'rod-16-green-v1' })
      connections.push({
        from: 'motor.drive_axle',
        to: 'drive_rod.end1',
        joint_type: 'revolute',
      })
      connections.push({
        from: 'drive_rod.end2',
        to: 'blade_hub.center',
        joint_type: 'fixed',
      })
    } else {
      // Passive hub
      parts.push({ instance_id: 'blade_hub', part_id: 'connector-5way-yellow-v1' })
      connections.push({
        from: 'mast_top.A',
        to: 'blade_hub.center',
        joint_type: 'fixed',
      })
    }

    // 5. Blade arms — rods extending from hub
    const hubPorts = ['A', 'B', 'C', 'D', 'E']
    const actualBladeCount = Math.min(bladeCount, hubPorts.length)

    for (let i = 0; i < actualBladeCount; i++) {
      const bladeId = `blade_${i}`
      const bladeTipId = `blade_tip_${i}`

      // Blade rod (yellow 86mm)
      parts.push({ instance_id: bladeId, part_id: 'rod-86-yellow-v1' })
      connections.push({
        from: `blade_hub.${hubPorts[i]}`,
        to: `${bladeId}.end1`,
        joint_type: 'fixed',
      })

      // Blade tip connector
      parts.push({ instance_id: bladeTipId, part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: `${bladeId}.end2`,
        to: `${bladeTipId}.center`,
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
