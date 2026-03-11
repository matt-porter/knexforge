import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

export const linkageLoopTemplate: SynthesisTemplate = {
  id: 'linkage-loop-v1',
  name: 'Four-Bar Linkage',
  description: 'A classic 4-bar linkage mechanism forming a closed loop.',
  generate: (_params: TemplateParams): TopologyModel => {
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // Base rod
    parts.push({ instance_id: 'base_rod', part_id: 'rod-128-red-v1' })

    // Base connectors
    parts.push({ instance_id: 'base_conn_1', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'base_conn_2', part_id: 'connector-2way-orange-v1' })

    connections.push({ from: 'base_rod.end1', to: 'base_conn_1.center', joint_type: 'fixed' })
    connections.push({ from: 'base_rod.end2', to: 'base_conn_2.center', joint_type: 'fixed' })

    // Side rods
    parts.push({ instance_id: 'side_rod_1', part_id: 'rod-54-blue-v1' })
    parts.push({ instance_id: 'side_rod_2', part_id: 'rod-54-blue-v1' })

    connections.push({ from: 'base_conn_1.A', to: 'side_rod_1.end1', joint_type: 'revolute' })
    connections.push({ from: 'base_conn_2.A', to: 'side_rod_2.end1', joint_type: 'revolute' })

    // Top connectors
    parts.push({ instance_id: 'top_conn_1', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'top_conn_2', part_id: 'connector-2way-orange-v1' })

    connections.push({ from: 'side_rod_1.end2', to: 'top_conn_1.center', joint_type: 'fixed' })
    connections.push({ from: 'side_rod_2.end2', to: 'top_conn_2.center', joint_type: 'fixed' })

    // Top rod
    parts.push({ instance_id: 'top_rod', part_id: 'rod-128-red-v1' })

    connections.push({ from: 'top_conn_1.A', to: 'top_rod.end1', joint_type: 'revolute' })
    connections.push({ from: 'top_conn_2.A', to: 'top_rod.end2', joint_type: 'revolute' })

    return {
      format_version: 'topology-v1',
      parts,
      connections
    }
  }
}
