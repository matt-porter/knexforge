import type { TopologyModel, TopologyPart, TopologyConnection } from '../topologySolver'

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

export type MutationOp = (model: TopologyModel, random: DeterministicRandom) => boolean

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

export const allMutations: MutationOp[] = [
  mutateRetwist,
  mutateSlideOffset
]
