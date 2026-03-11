import type { TopologyModel, TopologyPart, TopologyConnection, SolvedTopologyBuild } from '../topologySolver'
import { TopologyOracle } from './topologyOracle'
import type { KnexPartDef } from '../../types/parts'

export interface AutocompleteSuggestion {
  instance_id: string
  part_id: string
  from_port: string
  to_port: string
  shorthand_line: string
  topology: TopologyModel
  solved_build: SolvedTopologyBuild
}

export interface AutocompleteResponse {
  current_solved_build: SolvedTopologyBuild | null
  suggestions: AutocompleteSuggestion[]
}

const COMMON_RODS = [
  'rod-16-green-v1',
  'rod-32-white-v1',
  'rod-54-blue-v1',
  'rod-86-yellow-v1',
  'rod-128-red-v1',
  'rod-190-grey-v1',
]

const COMMON_CONNECTORS = [
  'connector-2way-orange-v1',
  'connector-3way-red-v1',
  'connector-5way-yellow-v1',
  'connector-8way-white-v1',
]

/**
 * Service to suggest valid next steps for building a K'Nex model.
 */
export class TopologyAutocompleteService {
  private oracle: TopologyOracle

  private partDefsById: Map<string, KnexPartDef>

  constructor(partDefsById: Map<string, KnexPartDef>) {
    this.partDefsById = partDefsById
    this.oracle = new TopologyOracle(partDefsById)
  }

  /**
   * Generates a list of valid parts that can be attached to the current model.
   */
  public getSuggestions(model: TopologyModel): AutocompleteResponse {
    const oracleResult = this.oracle.evaluate(model)
    const currentSolvedBuild = oracleResult.isValid ? oracleResult.solvedBuild : null
    
    const suggestions: AutocompleteSuggestion[] = []
    const occupiedPorts = new Set<string>()
    for (const conn of model.connections) {
      occupiedPorts.add(conn.from)
      occupiedPorts.add(conn.to)
    }

    // Identify all open ports
    for (const part of model.parts) {
      const def = this.partDefsById.get(part.part_id)
      if (!def) continue

      for (const port of def.ports) {
        const portFullId = `${part.instance_id}.${port.id}`
        if (occupiedPorts.has(portFullId)) continue

        // This is an open port. Try attaching various parts.
        this.generateStepSuggestions(model, part, port.id, suggestions)
      }
    }

    return {
      current_solved_build: currentSolvedBuild,
      suggestions: suggestions.slice(0, 50), // Limit results for performance/UI
    }
  }

  private generateStepSuggestions(
    baseModel: TopologyModel,
    basePart: TopologyPart,
    basePortId: string,
    out: AutocompleteSuggestion[]
  ): void {
    // 1. Try adding a rod
    for (const rodId of COMMON_RODS) {
      this.tryAttach(baseModel, basePart, basePortId, rodId, 'end1', out)
    }

    // 2. Try adding a connector
    for (const connId of COMMON_CONNECTORS) {
      this.tryAttach(baseModel, basePart, basePortId, connId, 'center', out)
    }
  }

  private tryAttach(
    baseModel: TopologyModel,
    basePart: TopologyPart,
    basePortId: string,
    newPartId: string,
    newPartPortId: string,
    out: AutocompleteSuggestion[]
  ): void {
    // Generate unique ID for the new part
    const nextId = this.findNextId(baseModel, newPartId)
    
    const newPart: TopologyPart = {
      instance_id: nextId,
      part_id: newPartId
    }

    const newConnection: TopologyConnection = {
      from: `${basePart.instance_id}.${basePortId}`,
      to: `${nextId}.${newPartPortId}`,
      joint_type: 'fixed',
      twist_deg: 0,
      fixed_roll: false
    }

    const candidateModel: TopologyModel = {
      ...baseModel,
      parts: [...baseModel.parts, newPart],
      connections: [...baseModel.connections, newConnection]
    }

    const result = this.oracle.evaluate(candidateModel)
    if (result.isValid) {
      out.push({
        instance_id: nextId,
        part_id: newPartId,
        from_port: basePortId,
        to_port: newPartPortId,
        shorthand_line: `${nextId}.${newPartPortId} -- ${basePart.instance_id}.${basePortId}`,
        topology: result.canonicalTopology,
        solved_build: result.solvedBuild
      })
    }
  }

  private findNextId(model: TopologyModel, partId: string): string {
    const prefix = partId.split('-')[1] || 'part'
    let counter = 1
    while (model.parts.some(p => p.instance_id === `${prefix}_${counter}`)) {
      counter++
    }
    return `${prefix}_${counter}`
  }
}
