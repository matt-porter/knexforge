import type { TopologyModel } from '../topologySolver'
import type { KnexPartDef } from '../../types/parts'

// Simple deterministic PRNG (Linear Congruential Generator)
export class DeterministicRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed === 0 ? 1 : seed
  }

  public next(): number {
    // LCG parameters
    const a = 1664525
    const c = 1013904223
    const m = 4294967296 // 2^32
    this.seed = (a * this.seed + c) % m
    return this.seed / m
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  public pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)]
  }

  public chance(probability: number): boolean {
    return this.next() < probability
  }
}

export type MutationOp = (model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>) => boolean

// Mutation: Retwist a random revolute or fixed joint
export function mutateRetwist(model: TopologyModel, random: DeterministicRandom): boolean {
  if (model.connections.length === 0) return false

  const conn = random.pick(model.connections)
  // Simple twist by 90 degrees
  conn.twist_deg = ((conn.twist_deg ?? 0) + 90) % 360

  return true
}

// Mutation: Adjust slide offset
export function mutateSlideOffset(model: TopologyModel, random: DeterministicRandom): boolean {
  if (model.connections.length === 0) return false

  const conn = random.pick(model.connections)
  // Adjust offset by -10, 0, or +10
  const delta = random.pick([-10, 10])
  conn.slide_offset = ((conn.slide_offset ?? 0) + delta)

  // Clamp arbitrarily to keep it sane for mutation purposes
  if (conn.slide_offset > 100) conn.slide_offset = 100
  if (conn.slide_offset < -100) conn.slide_offset = -100

  return true
}

// Helper: Get all occupied ports in the model
function getOccupiedPorts(model: TopologyModel): Set<string> {
  const occupied = new Set<string>()
  for (const conn of model.connections) {
    occupied.add(conn.from)
    occupied.add(conn.to)
  }
  return occupied
}

// Growth: Add a random rod to an open connector port
export function mutateAddRod(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  const freePorts = def.ports.filter(p => !occupied.has(`${connector.instance_id}.${p.id}`))
  if (freePorts.length === 0) return false

  const port = random.pick(freePorts)
  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  if (rodDefs.length === 0) return false

  const rodDef = random.pick(rodDefs)
  const rodId = `rod_${random.nextInt(10000, 99999)}`

  model.parts.push({
    instance_id: rodId,
    part_id: rodDef.id
  })

  model.connections.push({
    from: `${connector.instance_id}.${port.id}`,
    to: `${rodId}.end1`,
    joint_type: 'fixed'
  })

  return true
  }

  // Growth: Add a random connector to an open rod end
  export function mutateAddConnector(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const rods = model.parts.filter(p => p.part_id.startsWith('rod-'))
  if (rods.length === 0) return false

  const rod = random.pick(rods)
  const occupied = getOccupiedPorts(model)

  const freeEnds = ['end1', 'end2'].filter(end => !occupied.has(`${rod.instance_id}.${end}`))
  if (freeEnds.length === 0) return false

  const end = random.pick(freeEnds)
  const connDefs = Array.from(partDefs.values()).filter(d => !d.id.startsWith('rod-') && d.id !== 'motor-v1')
  if (connDefs.length === 0) return false

  const connDef = random.pick(connDefs)
  const connId = `conn_${random.nextInt(10000, 99999)}`

  model.parts.push({
    instance_id: connId,
    part_id: connDef.id
  })

  model.connections.push({
    from: `${rod.instance_id}.${end}`,
    to: `${connId}.center`, // Most connectors have a 'center' port
    joint_type: 'fixed'
  })
  return true
}

export const allMutations: MutationOp[] = [
  mutateRetwist,
  mutateSlideOffset,
  mutateAddRod,
  mutateAddConnector
]

