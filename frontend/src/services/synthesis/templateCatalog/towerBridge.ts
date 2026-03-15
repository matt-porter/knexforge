import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

/**
 * Tower/Bridge template: vertical truss built as a branching tree.
 * Each panel has two vertical columns with cross-arms, but no diagonal loops.
 * Generates ~20 parts depending on panel count.
 */
export const towerBridgeTemplate: SynthesisTemplate = {
  id: 'tower-bridge-v1',
  name: 'Tower / Bridge',
  description: 'A vertical truss structure with paired columns, horizontal cross-arms, and branching struts.',
  generate: (params: TemplateParams): TopologyModel => {
    const panelCount = typeof params.panelCount === 'number' ? params.panelCount : 3
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // Base — wide connector with stability feet
    parts.push({ instance_id: 'base', part_id: 'connector-5way-yellow-v1' })

    // Base stability feet
    parts.push({ instance_id: 'foot_1', part_id: 'rod-54-blue-v1' })
    parts.push({ instance_id: 'foot_2', part_id: 'rod-54-blue-v1' })
    connections.push({
      from: 'base.B',
      to: 'foot_1.end1',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'base.D',
      to: 'foot_2.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'foot_end_1', part_id: 'connector-2way-orange-v1' })
    parts.push({ instance_id: 'foot_end_2', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'foot_1.end2',
      to: 'foot_end_1.center',
      joint_type: 'fixed',
    })
    connections.push({
      from: 'foot_2.end2',
      to: 'foot_end_2.center',
      joint_type: 'fixed',
    })

    // Main column — central vertical stack
    let prevConnId = 'base'
    let prevPort = 'center'

    for (let i = 0; i < panelCount; i++) {
      // Vertical rod
      const vertId = `vert_${i}`
      parts.push({ instance_id: vertId, part_id: 'rod-128-red-v1' })
      connections.push({
        from: `${prevConnId}.${prevPort}`,
        to: `${vertId}.end1`,
        joint_type: 'fixed',
      })

      // Node connector at top of vertical
      const nodeId = `node_${i}`
      parts.push({ instance_id: nodeId, part_id: 'connector-5way-yellow-v1' })
      connections.push({
        from: `${vertId}.end2`,
        to: `${nodeId}.center`,
        joint_type: 'fixed',
      })

      // Cross-arms branching left and right
      const armLeftId = `arm_left_${i}`
      const armRightId = `arm_right_${i}`
      parts.push({ instance_id: armLeftId, part_id: 'rod-32-white-v1' })
      parts.push({ instance_id: armRightId, part_id: 'rod-32-white-v1' })
      connections.push({
        from: `${nodeId}.B`,
        to: `${armLeftId}.end1`,
        joint_type: 'fixed',
      })
      connections.push({
        from: `${nodeId}.D`,
        to: `${armRightId}.end1`,
        joint_type: 'fixed',
      })

      // Arm tip connectors (free ports for mutation growth)
      const tipLeftId = `tip_left_${i}`
      const tipRightId = `tip_right_${i}`
      parts.push({ instance_id: tipLeftId, part_id: 'connector-2way-orange-v1' })
      parts.push({ instance_id: tipRightId, part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: `${armLeftId}.end2`,
        to: `${tipLeftId}.center`,
        joint_type: 'fixed',
      })
      connections.push({
        from: `${armRightId}.end2`,
        to: `${tipRightId}.center`,
        joint_type: 'fixed',
      })

      prevConnId = nodeId
      prevPort = 'A'
    }

    // Top cap — antenna/spire
    parts.push({ instance_id: 'spire_rod', part_id: 'rod-86-yellow-v1' })
    connections.push({
      from: `${prevConnId}.${prevPort}`,
      to: 'spire_rod.end1',
      joint_type: 'fixed',
    })
    parts.push({ instance_id: 'spire_tip', part_id: 'connector-2way-orange-v1' })
    connections.push({
      from: 'spire_rod.end2',
      to: 'spire_tip.center',
      joint_type: 'fixed',
    })

    return {
      format_version: 'topology-v1',
      parts,
      connections,
    }
  },
}
