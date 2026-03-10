import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

export const spinnerTemplate: SynthesisTemplate = {
  id: 'spinner-v1',
  name: 'Motorized Spinner',
  description: 'A basic motorized spinning mechanism with a central rod and optional weighted arms.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Base Mount (Orange 2-way connector)
    parts.push({ instance_id: 'base_mount', part_id: 'connector-2way-orange-v1' })

    // 2. Motor or anchor
    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      // Connect base mount to motor mount_1
      connections.push({
        from: 'motor.mount_1',
        to: 'base_mount.center',
        joint_type: 'fixed'
      })
    }

    // 3. Central drive rod (Blue 54mm)
    parts.push({ instance_id: 'drive_rod', part_id: 'rod-54-blue-v1' })
    if (useMotor) {
      connections.push({
        from: 'motor.drive_axle',
        to: 'drive_rod.end1',
        joint_type: 'revolute'
      })
    } else {
      connections.push({
        from: 'base_mount.center',
        to: 'drive_rod.end1',
        joint_type: 'fixed'
      })
    }

    // 4. Spinner Tip (Yellow 5-way connector)
    parts.push({ instance_id: 'spinner_tip', part_id: 'connector-5way-yellow-v1' })
    connections.push({
      from: 'drive_rod.end2',
      to: 'spinner_tip.center',
      joint_type: 'fixed'
    })

    return {
      format_version: 'topology-v1',
      parts,
      connections
    }
  }
}
