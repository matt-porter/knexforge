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

// ======================================================================
// Compound Growth Mutations (Phase 16.2)
// Each adds 3+ parts in one operation for meaningful structural growth.
// ======================================================================

/**
 * Triangle Brace: pick a free connector port, add rod → connector → rod forming
 * a V-shape brace. Adds 3 parts (rod + connector + rod).
 */
export function mutateTriangleBrace(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  const freePorts = def.ports.filter(p => !occupied.has(`${connector.instance_id}.${p.id}`) && p.mate_type === 'rod_hole')
  if (freePorts.length === 0) return false

  const port = random.pick(freePorts)
  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  if (rodDefs.length === 0) return false

  const rid = random.nextInt(10000, 99999)
  const rod1Id = `brace_rod1_${rid}`
  const midConnId = `brace_mid_${rid}`
  const rod2Id = `brace_rod2_${rid}`

  // Rod 1: from free port
  const rod1Def = random.pick(rodDefs)
  model.parts.push({ instance_id: rod1Id, part_id: rod1Def.id })
  model.connections.push({
    from: `${connector.instance_id}.${port.id}`,
    to: `${rod1Id}.end1`,
    joint_type: 'fixed',
  })

  // Mid connector
  const connDefs = Array.from(partDefs.values()).filter(d => d.category === 'connector' && d.ports.length >= 3)
  if (connDefs.length === 0) return false
  const midDef = random.pick(connDefs)
  model.parts.push({ instance_id: midConnId, part_id: midDef.id })
  model.connections.push({
    from: `${rod1Id}.end2`,
    to: `${midConnId}.center`,
    joint_type: 'fixed',
  })

  // Rod 2: extending from mid connector
  const rod2Def = random.pick(rodDefs)
  const connPorts = midDef.ports.filter(p => p.id !== 'center' && p.mate_type === 'rod_hole')
  if (connPorts.length === 0) return false
  const midPort = random.pick(connPorts)
  model.parts.push({ instance_id: rod2Id, part_id: rod2Def.id })
  model.connections.push({
    from: `${midConnId}.${midPort.id}`,
    to: `${rod2Id}.end1`,
    joint_type: 'fixed',
  })

  return true
}

/**
 * Base Frame: add a row of 2 connectors linked by a rod, attached to a free port.
 * Creates a flat structural element. Adds 3 parts.
 */
export function mutateBaseFrame(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  const freePorts = def.ports.filter(p => !occupied.has(`${connector.instance_id}.${p.id}`) && p.mate_type === 'rod_hole')
  if (freePorts.length === 0) return false

  const port = random.pick(freePorts)
  const rid = random.nextInt(10000, 99999)

  // Bridge rod
  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  if (rodDefs.length === 0) return false
  const bridgeRodDef = random.pick(rodDefs)
  const bridgeRodId = `frame_rod_${rid}`
  model.parts.push({ instance_id: bridgeRodId, part_id: bridgeRodDef.id })
  model.connections.push({
    from: `${connector.instance_id}.${port.id}`,
    to: `${bridgeRodId}.end1`,
    joint_type: 'fixed',
  })

  // End connector
  const connDefs = Array.from(partDefs.values()).filter(d => d.category === 'connector')
  if (connDefs.length === 0) return false
  const endDef = random.pick(connDefs)
  const endConnId = `frame_end_${rid}`
  model.parts.push({ instance_id: endConnId, part_id: endDef.id })
  model.connections.push({
    from: `${bridgeRodId}.end2`,
    to: `${endConnId}.center`,
    joint_type: 'fixed',
  })

  // Leg rod hanging off end connector
  const legPort = endDef.ports.find(p => p.id !== 'center' && p.mate_type === 'rod_hole')
  if (!legPort) return true // still added 2 parts

  const legDef = random.pick(rodDefs)
  const legId = `frame_leg_${rid}`
  model.parts.push({ instance_id: legId, part_id: legDef.id })
  model.connections.push({
    from: `${endConnId}.${legPort.id}`,
    to: `${legId}.end1`,
    joint_type: 'fixed',
  })

  return true
}

/**
 * Chain Extension: add rod → connector → rod → connector in series.
 * Adds 4 parts, extending the structure linearly.
 */
export function mutateChainExtension(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  // Find a free rod end to extend from
  const rods = model.parts.filter(p => p.part_id.startsWith('rod-'))
  if (rods.length === 0) return false

  const rod = random.pick(rods)
  const occupied = getOccupiedPorts(model)
  const freeEnds = ['end1', 'end2'].filter(end => !occupied.has(`${rod.instance_id}.${end}`))
  if (freeEnds.length === 0) return false

  const end = random.pick(freeEnds)
  const rid = random.nextInt(10000, 99999)

  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  const connDefs = Array.from(partDefs.values()).filter(d => d.category === 'connector')
  if (rodDefs.length === 0 || connDefs.length === 0) return false

  // Connector 1
  const conn1Def = random.pick(connDefs)
  const conn1Id = `chain_c1_${rid}`
  model.parts.push({ instance_id: conn1Id, part_id: conn1Def.id })
  model.connections.push({
    from: `${rod.instance_id}.${end}`,
    to: `${conn1Id}.center`,
    joint_type: 'fixed',
  })

  // Rod 1
  const rod1Def = random.pick(rodDefs)
  const rod1Id = `chain_r1_${rid}`
  const c1Port = conn1Def.ports.find(p => p.id !== 'center' && p.mate_type === 'rod_hole')
  if (!c1Port) return true
  model.parts.push({ instance_id: rod1Id, part_id: rod1Def.id })
  model.connections.push({
    from: `${conn1Id}.${c1Port.id}`,
    to: `${rod1Id}.end1`,
    joint_type: 'fixed',
  })

  // Connector 2
  const conn2Def = random.pick(connDefs)
  const conn2Id = `chain_c2_${rid}`
  model.parts.push({ instance_id: conn2Id, part_id: conn2Def.id })
  model.connections.push({
    from: `${rod1Id}.end2`,
    to: `${conn2Id}.center`,
    joint_type: 'fixed',
  })

  // Rod 2
  const rod2Def = random.pick(rodDefs)
  const rod2Id = `chain_r2_${rid}`
  const c2Port = conn2Def.ports.find(p => p.id !== 'center' && p.mate_type === 'rod_hole')
  if (!c2Port) return true
  model.parts.push({ instance_id: rod2Id, part_id: rod2Def.id })
  model.connections.push({
    from: `${conn2Id}.${c2Port.id}`,
    to: `${rod2Id}.end1`,
    joint_type: 'fixed',
  })

  return true
}

/**
 * Symmetric Arms: pick a connector with 2+ free ports, add matching rods on both.
 * Adds 2+ parts, creating bilateral symmetry.
 */
export function mutateSymmetricArms(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  const freePorts = def.ports.filter(p => !occupied.has(`${connector.instance_id}.${p.id}`) && p.mate_type === 'rod_hole')
  if (freePorts.length < 2) return false

  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  if (rodDefs.length === 0) return false

  // Use the same rod type for symmetry
  const rodDef = random.pick(rodDefs)
  const rid = random.nextInt(10000, 99999)

  // Take up to 3 free ports for arms
  const armCount = Math.min(freePorts.length, random.nextInt(2, 3))
  for (let i = 0; i < armCount; i++) {
    const port = freePorts[i]
    const armId = `sym_arm_${rid}_${i}`
    model.parts.push({ instance_id: armId, part_id: rodDef.id })
    model.connections.push({
      from: `${connector.instance_id}.${port.id}`,
      to: `${armId}.end1`,
      joint_type: 'fixed',
    })
  }

  return true
}

/**
 * Star Pattern: pick a connector with 3+ free ports, add rods + tip connectors on all.
 * Adds 6+ parts for a star/fan shape.
 */
export function mutateStarPattern(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  const freePorts = def.ports.filter(p => !occupied.has(`${connector.instance_id}.${p.id}`) && p.mate_type === 'rod_hole')
  if (freePorts.length < 3) return false

  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  const tipConnDefs = Array.from(partDefs.values()).filter(d => d.category === 'connector')
  if (rodDefs.length === 0 || tipConnDefs.length === 0) return false

  const rodDef = random.pick(rodDefs)
  const tipDef = random.pick(tipConnDefs)
  const rid = random.nextInt(10000, 99999)

  const armCount = Math.min(freePorts.length, random.nextInt(3, 5))
  for (let i = 0; i < armCount; i++) {
    const port = freePorts[i]
    const armRodId = `star_rod_${rid}_${i}`
    const armTipId = `star_tip_${rid}_${i}`

    model.parts.push({ instance_id: armRodId, part_id: rodDef.id })
    model.connections.push({
      from: `${connector.instance_id}.${port.id}`,
      to: `${armRodId}.end1`,
      joint_type: 'fixed',
    })

    model.parts.push({ instance_id: armTipId, part_id: tipDef.id })
    model.connections.push({
      from: `${armRodId}.end2`,
      to: `${armTipId}.center`,
      joint_type: 'fixed',
    })
  }

  return true
}

/**
 * Wheel Assembly: add a rod through a connector center port, then cap both ends
 * with connectors (simulating an axle with hubs). Adds 3 parts.
 */
export function mutateWheelAssembly(model: TopologyModel, random: DeterministicRandom, partDefs: Map<string, KnexPartDef>): boolean {
  const connectors = model.parts.filter(p => !p.part_id.startsWith('rod-'))
  if (connectors.length === 0) return false

  const connector = random.pick(connectors)
  const def = partDefs.get(connector.part_id)
  if (!def) return false

  const occupied = getOccupiedPorts(model)
  // Need a free center port specifically
  const hasFreeCenter = def.ports.some(p => p.id === 'center' && !occupied.has(`${connector.instance_id}.center`))
  if (!hasFreeCenter) return false

  const rodDefs = Array.from(partDefs.values()).filter(d => d.id.startsWith('rod-'))
  const connDefs = Array.from(partDefs.values()).filter(d => d.category === 'connector')
  if (rodDefs.length === 0 || connDefs.length === 0) return false

  const rid = random.nextInt(10000, 99999)

  // Axle rod through center
  const axleDef = random.pick(rodDefs)
  const axleId = `axle_rod_${rid}`
  model.parts.push({ instance_id: axleId, part_id: axleDef.id })
  model.connections.push({
    from: `${connector.instance_id}.center`,
    to: `${axleId}.end1`,
    joint_type: 'fixed',
  })

  // Hub connector at the far end
  const hubDef = random.pick(connDefs)
  const hubId = `axle_hub_${rid}`
  model.parts.push({ instance_id: hubId, part_id: hubDef.id })
  model.connections.push({
    from: `${axleId}.end2`,
    to: `${hubId}.center`,
    joint_type: 'fixed',
  })

  return true
}

// All original mutations
export const basicMutations: MutationOp[] = [
  mutateRetwist,
  mutateSlideOffset,
  mutateAddRod,
  mutateAddConnector,
]

// Compound growth mutations (Phase 16.2)
export const compoundGrowthMutations: MutationOp[] = [
  mutateTriangleBrace,
  mutateBaseFrame,
  mutateChainExtension,
  mutateSymmetricArms,
  mutateStarPattern,
  mutateWheelAssembly,
]

// Combined — includes all 10 mutations
export const allMutations: MutationOp[] = [
  ...basicMutations,
  ...compoundGrowthMutations,
]

/**
 * Pick a mutation with a growth bias: 50% chance of compound growth,
 * 30% chance of basic growth (addRod/addConnector), 20% tweak (retwist/slide).
 */
export function pickWeightedMutation(random: DeterministicRandom): MutationOp {
  const roll = random.next()
  if (roll < 0.5) {
    // Compound growth (50%)
    return random.pick(compoundGrowthMutations)
  } else if (roll < 0.8) {
    // Basic growth (30%)
    return random.pick([mutateAddRod, mutateAddConnector])
  } else {
    // Tweaks (20%)
    return random.pick([mutateRetwist, mutateSlideOffset])
  }
}
