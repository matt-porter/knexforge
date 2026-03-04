import {
  canonicalizeTopology,
  type TopologyConnection,
  type TopologyModel,
  type TopologyPart,
} from './topologySolver'

const JOINT_OPERATOR_TO_TYPE = {
  '--': 'fixed',
  '~~': 'revolute',
  '=>': 'prismatic',
} as const

const JOINT_TYPE_TO_OPERATOR: Record<string, string> = {
  fixed: '--',
  revolute: '~~',
  prismatic: '=>',
}

const ALIAS_TO_PART_ID: Record<string, string> = {
  gc1: 'connector-1way-grey-v1',
  gc2: 'connector-2way-grey-v1',
  oc2: 'connector-2way-orange-v1',
  rc3: 'connector-3way-red-v1',
  gc4: 'connector-4way-green-v1',
  pc4: 'connector-4way-3d-purple-v1',
  yc5: 'connector-5way-yellow-v1',
  bc7: 'connector-7way-blue-v1',
  wc8: 'connector-8way-white-v1',
  gr: 'rod-190-grey-v1',
  rr: 'rod-128-red-v1',
  wr: 'rod-32-white-v1',
  br: 'rod-54-blue-v1',
  yr: 'rod-86-yellow-v1',
  gsr: 'rod-16-green-v1',
  motor: 'motor-v1',
}

export function tryInferPartFromInstance(instanceId: string): string | null {
  const direct = ALIAS_TO_PART_ID[instanceId.toLowerCase()]
  if (direct) return direct

  const underscoreIdx = instanceId.lastIndexOf('_')
  if (underscoreIdx > 0) {
    const prefix = instanceId.slice(0, underscoreIdx).toLowerCase()
    const inferred = ALIAS_TO_PART_ID[prefix]
    if (inferred) return inferred
  }

  return null
}

function parseEndpoint(value: string): { instance_id: string; port_id: string } {
  const firstDot = value.indexOf('.')
  if (firstDot <= 0 || firstDot === value.length - 1) {
    throw new Error(`Invalid endpoint '${value}'. Expected format instance.port`)
  }

  return {
    instance_id: value.slice(0, firstDot),
    port_id: value.slice(firstDot + 1),
  }
}

function inferPartFromInstance(instanceId: string): string {
  const inferred = tryInferPartFromInstance(instanceId)
  if (inferred) return inferred

  throw new Error(
    `Cannot infer part_id for instance '${instanceId}'. Add an explicit part declaration line: 'part ${instanceId} <part_id>'`,
  )
}

function stripComments(line: string): string {
  const idx = line.indexOf('#')
  return idx >= 0 ? line.slice(0, idx).trim() : line.trim()
}

export function parseCompactTopology(text: string): TopologyModel {
  const explicitParts = new Map<string, string>()
  const discoveredInstances = new Set<string>()
  const connections: TopologyConnection[] = []

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = stripComments(raw)
    if (!line) return

    const partMatch = line.match(/^part\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9._-]+)$/i)
    if (partMatch) {
      const [, instanceId, partId] = partMatch
      explicitParts.set(instanceId, partId)
      discoveredInstances.add(instanceId)
      return
    }

    const aliasPartMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*([A-Za-z0-9._-]+)$/)
    if (aliasPartMatch) {
      const [, instanceId, partId] = aliasPartMatch
      explicitParts.set(instanceId, partId)
      discoveredInstances.add(instanceId)
      return
    }

    const edgeMatch = line.match(/^([A-Za-z0-9_.-]+)\s*(--|~~|=>)\s*([A-Za-z0-9_.-]+)$/)
    if (!edgeMatch) {
      throw new Error(`Line ${index + 1}: invalid compact syntax '${raw.trim()}'`)
    }

    const [, fromRef, operator, toRef] = edgeMatch
    const from = parseEndpoint(fromRef)
    const to = parseEndpoint(toRef)
    discoveredInstances.add(from.instance_id)
    discoveredInstances.add(to.instance_id)

    connections.push({
      from: `${from.instance_id}.${from.port_id}`,
      to: `${to.instance_id}.${to.port_id}`,
      joint_type: JOINT_OPERATOR_TO_TYPE[operator as keyof typeof JOINT_OPERATOR_TO_TYPE],
    })
  })

  const parts: TopologyPart[] = [...discoveredInstances]
    .sort((a, b) => a.localeCompare(b))
    .map((instanceId) => ({
      instance_id: instanceId,
      part_id: explicitParts.get(instanceId) ?? inferPartFromInstance(instanceId),
    }))

  return canonicalizeTopology({
    format_version: 'topology-v1',
    parts,
    connections,
  })
}

export function stringifyCompactTopology(model: TopologyModel): string {
  const canonical = canonicalizeTopology(model)
  const lines: string[] = []
  lines.push('# compact topology format')
  lines.push('# part <instance_id> <part_id>')
  lines.push('')

  for (const part of canonical.parts) {
    lines.push(`part ${part.instance_id} ${part.part_id}`)
  }

  if (canonical.connections.length > 0) {
    lines.push('')
  }

  for (const connection of canonical.connections) {
    const operator = JOINT_TYPE_TO_OPERATOR[connection.joint_type ?? 'fixed'] ?? '--'
    lines.push(`${connection.from} ${operator} ${connection.to}`)
  }

  return lines.join('\n')
}
