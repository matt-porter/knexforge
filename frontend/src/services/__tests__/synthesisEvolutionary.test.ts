import { describe, expect, it, vi } from 'vitest'

import type { SynthesisGoal } from '../../types/synthesis'

vi.mock('../synthesis/promptMatcher', () => ({
  selectTemplateByPrompt: vi.fn(() => ({
    id: 'mock-template',
    name: 'Mock Template',
    description: 'Mock template used for deterministic evolutionary tests.',
    generate: ({ seed }: { seed?: number }) => ({
      format_version: 'topology-v1',
      parts: [{ instance_id: 'p1', part_id: 'mock-part' }],
      connections: [],
      metadata: { seed: seed ?? 0, mutation_count: 0 },
    }),
  })),
}))

vi.mock('../synthesis/mutations', async () => {
  const actual = await vi.importActual<typeof import('../synthesis/mutations')>('../synthesis/mutations')
  return {
    DeterministicRandom: actual.DeterministicRandom,
    pickWeightedMutation: vi.fn(() => (model: any) => {
      const metadata = (model.metadata ??= {}) as Record<string, unknown>
      const prior = typeof metadata.mutation_count === 'number' ? metadata.mutation_count : 0
      metadata.mutation_count = Number(prior) + 1
      return true
    }),
  }
})

vi.mock('../synthesis/topologyOracle', () => ({
  TopologyOracle: class {
    private readonly defs: Map<string, unknown>

    constructor(partDefsById: Map<string, unknown>) {
      this.defs = partDefsById
    }

    evaluate(model: any) {
      if (this.defs.size === 0) {
        return {
          isValid: false,
          reasonCode: 'topology_validation_failed',
          reasonMessage: 'No part definitions available.',
          diagnostics: [],
        }
      }

      return {
        isValid: true,
        canonicalTopology: model,
        solvedBuild: {
          format_version: 'build-v1',
          parts: model.parts.map((part: any) => ({
            instance_id: part.instance_id,
            part_id: part.part_id,
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            color: '#999999',
          })),
          connections: [],
        },
      }
    }
  },
}))

vi.mock('../synthesis/scoring', () => ({
  evaluateCandidateScore: vi.fn((topology: any) => {
    const mutationCount = Number(topology.metadata?.mutation_count ?? 0)
    const total = Math.max(0.1, 0.5 + mutationCount * 0.01)
    return {
      score: {
        total,
        objective_fit: total,
        stability: total,
        stress_resilience: total,
        part_efficiency: total,
        structural_simplicity: total,
        penalties: [],
      },
      dimensionsMm: { x: 10, y: 10, z: 10 },
    }
  }),
}))

import { EvolutionaryGenerator } from '../synthesis/evolutionaryGenerator'

function makeGoal(overrides: Partial<SynthesisGoal> = {}): SynthesisGoal {
  return {
    format_version: 'synthesis-goal-v1',
    prompt: 'mock prompt',
    objectives: ['stability'],
    constraints: {
      population_size: 4,
      survivor_count: 2,
      children_per_survivor: 2,
      generation_count: 3,
    },
    candidate_count: 2,
    seed: 42,
    ...overrides,
  }
}

describe('EvolutionaryGenerator', () => {
  it('evaluates additional candidates across generations and reports progress', () => {
    const generator = new EvolutionaryGenerator(new Map([['mock-part', {}]]))
    const evaluatedByGeneration: number[] = []

    const result = generator.generate(makeGoal(), {
      onProgress: (progress) => {
        evaluatedByGeneration.push(progress.evaluatedCandidates)
      },
    })

    expect(evaluatedByGeneration).toHaveLength(3)
    expect(evaluatedByGeneration[1]).toBeGreaterThan(evaluatedByGeneration[0])
    expect(evaluatedByGeneration[2]).toBeGreaterThan(evaluatedByGeneration[1])
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  it('keeps best score non-decreasing across generations', () => {
    const generator = new EvolutionaryGenerator(new Map([['mock-part', {}]]))
    const bestScores: number[] = []

    generator.generate(makeGoal(), {
      onProgress: (progress) => {
        bestScores.push(progress.bestScore)
      },
    })

    expect(bestScores).toHaveLength(3)
    expect(bestScores[2]).toBeGreaterThanOrEqual(bestScores[0])
  })

  it('respects candidate_count in final output', () => {
    const generator = new EvolutionaryGenerator(new Map([['mock-part', {}]]))
    const result = generator.generate(makeGoal({ candidate_count: 1 }))

    expect(result.candidates.length).toBeLessThanOrEqual(1)
  })

  it('is deterministic with the same seed', () => {
    const generator = new EvolutionaryGenerator(new Map([['mock-part', {}]]))
    const goal = makeGoal({ candidate_count: 2, seed: 999 })

    const resultA = generator.generate(goal)
    const resultB = generator.generate(goal)

    expect(
      resultA.candidates.map((candidate) => ({
        summary: candidate.summary,
        score: candidate.score.total,
        partCount: candidate.metrics.part_count,
      })),
    ).toEqual(
      resultB.candidates.map((candidate) => ({
        summary: candidate.summary,
        score: candidate.score.total,
        partCount: candidate.metrics.part_count,
      })),
    )
    expect(resultA.rejections.length).toBe(resultB.rejections.length)
  })

  it('fires progress callback exactly once per generation', () => {
    const generator = new EvolutionaryGenerator(new Map([['mock-part', {}]]))
    const events: number[] = []

    generator.generate(makeGoal({
      constraints: { ...makeGoal().constraints, generation_count: 4 },
    }), {
      onProgress: (progress) => {
        events.push(progress.generation)
      },
    })

    expect(events).toEqual([1, 2, 3, 4])
  })

  it('handles zero-valid-candidate scenarios gracefully', () => {
    const generator = new EvolutionaryGenerator(new Map())
    const events: number[] = []

    const result = generator.generate(makeGoal(), {
      onProgress: (progress) => {
        events.push(progress.generation)
      },
    })

    expect(events).toHaveLength(3)
    expect(result.candidates).toHaveLength(0)
    expect(result.rejections.length).toBeGreaterThan(0)
  })
})
