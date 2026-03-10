import type { TopologyModel } from '../topologySolver'
import type { KnexPartDef } from '../../types/parts'

export interface TemplateParams {
  /** Optional deterministic seed for stochastic elements in the template */
  seed?: number
  /** Allowed bounding box in mm */
  maxEnvelopeMm?: [number, number, number]
  /** Whether the mechanism requires a motor */
  requireMotor?: boolean
  /** Any other template-specific params */
  [key: string]: unknown
}

export interface SynthesisTemplate {
  /** Unique identifier for the template */
  id: string
  /** Human-readable name */
  name: string
  /** Short description of the mechanism's behavior */
  description: string
  /** Function to instantiate a topology from the template */
  generate: (params: TemplateParams) => TopologyModel
}

/**
 * Ensures a generated template model only uses valid part IDs and port IDs
 * from the provided part library.
 */
export function validateTemplateOutput(
  model: TopologyModel,
  partDefsById: Map<string, KnexPartDef>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check format version
  if (model.format_version !== 'topology-v1') {
    errors.push(`Invalid format_version: ${model.format_version}`)
  }

  // Validate parts
  const instances = new Set<string>()
  for (const part of model.parts) {
    if (!partDefsById.has(part.part_id)) {
      errors.push(`Unknown part_id: ${part.part_id}`)
    }
    if (instances.has(part.instance_id)) {
      errors.push(`Duplicate instance_id: ${part.instance_id}`)
    }
    instances.add(part.instance_id)
  }

  // Validate connections
  for (const conn of model.connections) {
    const fromParts = conn.from.split('.')
    const toParts = conn.to.split('.')
    
    if (fromParts.length !== 2) {
      errors.push(`Invalid connection from ref: ${conn.from}`)
      continue
    }
    if (toParts.length !== 2) {
      errors.push(`Invalid connection to ref: ${conn.to}`)
      continue
    }

    const fromInstance = fromParts[0]
    const fromPort = fromParts[1]
    const toInstance = toParts[0]
    const toPort = toParts[1]

    const fromPart = model.parts.find(p => p.instance_id === fromInstance)
    const toPart = model.parts.find(p => p.instance_id === toInstance)

    if (!fromPart) {
      errors.push(`Unknown instance_id in connection: ${fromInstance}`)
    } else {
      const def = partDefsById.get(fromPart.part_id)
      if (def && !def.ports.some(p => p.id === fromPort)) {
        errors.push(`Unknown port_id in connection: ${fromPort} on part ${fromPart.part_id}`)
      }
    }

    if (!toPart) {
      errors.push(`Unknown instance_id in connection: ${toInstance}`)
    } else {
      const def = partDefsById.get(toPart.part_id)
      if (def && !def.ports.some(p => p.id === toPort)) {
        errors.push(`Unknown port_id in connection: ${toPort} on part ${toPart.part_id}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
