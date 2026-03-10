import type { SynthesisTemplate, TemplateParams } from '../templates'
import type { TopologyModel, TopologyPart, TopologyConnection } from '../../topologySolver'

export const motorChainTemplate: SynthesisTemplate = {
  id: 'motor-chain-v1',
  name: 'Motorized Chain',
  description: 'A linear chain of motorized connections transferring rotation.',
  generate: (params: TemplateParams): TopologyModel => {
    const chainLength = typeof params.chainLength === 'number' ? params.chainLength : 2
    const parts: TopologyPart[] = []
    const connections: TopologyConnection[] = []

    // 1. Base Mount
    parts.push({ instance_id: 'base_mount', part_id: 'connector-2way-orange-v1' })

    // 2. Motor
    parts.push({ instance_id: 'motor', part_id: 'motor-v1' })
    connections.push({
      from: 'motor.mount_1',
      to: 'base_mount.center',
      joint_type: 'fixed'
    })

    let previousAxle = 'motor.drive_axle'

    for (let i = 0; i < chainLength; i++) {
      const rodId = `chain_rod_${i}`
      const connId = `chain_conn_${i}`

      parts.push({ instance_id: rodId, part_id: 'rod-32-white-v1' })
      
      connections.push({
        from: previousAxle,
        to: `${rodId}.end1`,
        joint_type: i === 0 ? 'revolute' : 'fixed'
      })

      parts.push({ instance_id: connId, part_id: 'connector-2way-orange-v1' })
      connections.push({
        from: `${rodId}.end2`,
        to: `${connId}.center`,
        joint_type: 'fixed'
      })

      previousAxle = `${connId}.A`
    }

    return {
      format_version: 'topology-v1',
      parts,
      connections
    }
  }
}
