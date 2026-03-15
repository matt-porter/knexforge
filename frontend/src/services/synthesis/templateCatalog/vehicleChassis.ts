import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

/**
 * Vehicle Chassis template: linear frame with branching axle stubs and optional motor.
 * Tree-structured (no closed frame loops) for clean topology solving.
 * Generates ~20 parts.
 */
export const vehicleChassisTemplate: SynthesisTemplate = {
  id: 'vehicle-chassis-v1',
  name: 'Vehicle Chassis',
  description: 'A vehicle frame with a central spine, branching axle stubs, and optional rear-motor drive.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Central spine — a chain of connectors and rods forming the backbone
    // Front connector
    parts.push({ instance_id: 'spine_front', part_id: 'connector-5way-yellow-v1' })
    // Front-mid connector
    parts.push({ instance_id: 'spine_front_rod', part_id: 'rod-86-yellow-v1' })
    connections.push({
      from: 'spine_front.center',
      to: 'spine_front_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'spine_mid', part_id: 'connector-5way-yellow-v1' })
    connections.push({
      from: 'spine_front_rod.end2',
      to: 'spine_mid.center',
      joint_type: 'fixed',
    })
    // Mid-rear connector
    parts.push({ instance_id: 'spine_rear_rod', part_id: 'rod-86-yellow-v1' })
    connections.push({
      from: 'spine_mid.A',
      to: 'spine_rear_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'spine_rear', part_id: 'connector-5way-yellow-v1' })
    connections.push({
      from: 'spine_rear_rod.end2',
      to: 'spine_rear.center',
      joint_type: 'fixed',
    })

    // 2. Front axle stubs (left and right)
    parts.push({ instance_id: 'axle_fl', part_id: 'rod-32-white-v1' })
    parts.push({ instance_id: 'axle_fr', part_id: 'rod-32-white-v1' })
    connections.push({
      from: 'spine_front.B',
      to: 'axle_fl.end1',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'spine_front.D',
      to: 'axle_fr.end1',
      joint_type: 'fixed',
    })

    // Front wheel connectors
    parts.push({ instance_id: 'wheel_fl', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'wheel_fr', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'axle_fl.end2',
      to: 'wheel_fl.center',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'axle_fr.end2',
      to: 'wheel_fr.center',
      joint_type: 'fixed',
    })

    // 3. Rear axle stubs
    parts.push({ instance_id: 'axle_rl', part_id: 'rod-32-white-v1' })
    parts.push({ instance_id: 'axle_rr', part_id: 'rod-32-white-v1' })
    connections.push({
      from: 'spine_rear.B',
      to: 'axle_rl.end1',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'spine_rear.D',
      to: 'axle_rr.end1',
      joint_type: 'fixed',
    })

    // Rear wheel connectors
    parts.push({ instance_id: 'wheel_rl', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'wheel_rr', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'axle_rl.end2',
      to: 'wheel_rl.center',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'axle_rr.end2',
      to: 'wheel_rr.center',
      joint_type: 'fixed',
    })

    // 4. Mid-section cross arms (bumpers / aesthetics from mid connector)
    parts.push({ instance_id: 'mid_arm_l', part_id: 'rod-16-green-v1' })
    parts.push({ instance_id: 'mid_arm_r', part_id: 'rod-16-green-v1' })
    connections.push({
      from: 'spine_mid.B',
      to: 'mid_arm_l.end1',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'spine_mid.D',
      to: 'mid_arm_r.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'mid_arm_l_end', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'mid_arm_r_end', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'mid_arm_l.end2',
      to: 'mid_arm_l_end.center',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'mid_arm_r.end2',
      to: 'mid_arm_r_end.center',
      joint_type: 'fixed',
    })

    // 5. Motor (optional, at rear)
    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      parts.push({ instance_id: 'motor_mount', part_id: 'rod-16-green-v1' })
      connections.push({
        from: 'spine_rear.A',
        to: 'motor_mount.end1',
        joint_type: 'fixed',
      })
      connections.push({
        from: 'motor_mount.end2',
        to: 'motor.mount_1',
        joint_type: 'fixed',
      })

      // Drive axle
      parts.push({ instance_id: 'drive_rod', part_id: 'rod-32-white-v1' })
      connections.push({
        from: 'motor.drive_axle',
        to: 'drive_rod.end1',
        joint_type: 'revolute',
      })
      parts.push({ instance_id: 'drive_tip', part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: 'drive_rod.end2',
        to: 'drive_tip.center',
        joint_type: 'fixed',
      })
    }

    // 6. Front bumper
    parts.push({ instance_id: 'bumper_rod', part_id: 'rod-54-blue-v1' })
    connections.push({
      from: 'spine_front.E',
      to: 'bumper_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'bumper_tip', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'bumper_rod.end2',
      to: 'bumper_tip.center',
      joint_type: 'fixed',
    })

    return {
      format_version: 'topology-v1',
      parts,
      connections,
    }
  },
}
