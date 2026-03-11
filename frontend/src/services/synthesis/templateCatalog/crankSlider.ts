import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

export const crankSliderTemplate: SynthesisTemplate = {
  id: 'crank-slider-v1',
  name: 'Crank and Slider',
  description: 'Converts rotational motion from a motor into linear or oscillating motion using a crank and connecting rod.',
  generate: (params: TemplateParams): TopologyModel => {
    const useMotor = params.requireMotor ?? true
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // Base structure
    parts.push({ instance_id: 'base_rod', part_id: 'rod-128-red-v1' })
    
    if (useMotor) {
      parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
      // Attach motor to base rod
      connections.push({
        from: 'base_rod.end1',
        to: 'motor.mount_1',
        joint_type: 'fixed'
      })
    } else {
      parts.push({ instance_id: 'crank_base', part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: 'base_rod.end1',
        to: 'crank_base.center',
        joint_type: 'fixed'
      })
    }

    // Crank rod (short)
    parts.push({ instance_id: 'crank_rod', part_id: 'rod-16-green-v1' })
    if (useMotor) {
      connections.push({
        from: 'motor.drive_axle',
        to: 'crank_rod.end1',
        joint_type: 'revolute'
      })
    } else {
      connections.push({
        from: 'crank_base.A',
        to: 'crank_rod.end1',
        joint_type: 'revolute'
      })
    }

    // Crank pivot
    parts.push({ instance_id: 'crank_pivot', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'crank_rod.end2',
      to: 'crank_pivot.center',
      joint_type: 'fixed'
    })

    // Connecting rod
    parts.push({ instance_id: 'connecting_rod', part_id: 'rod-86-yellow-v1' })
    connections.push({
      from: 'crank_pivot.A', // A is valid on orange connector
      to: 'connecting_rod.end1',
      joint_type: 'revolute'
    })

    // Slider base
    parts.push({ instance_id: 'slider_connector', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'connecting_rod.end2',
      to: 'slider_connector.A',
      joint_type: 'revolute'
    })

    connections.push({
      from: 'slider_connector.center',
      to: 'base_rod.end2',
      joint_type: 'fixed',
      slide_offset: 20 // uses the new slide offset
    })

    return {
      format_version: 'topology-v1',
      parts,
      connections
    }
  }
}
