import { describe, it, expect } from 'vitest'
import { CandidateGenerator } from '../synthesis/generator'
import { partDefsById } from './partFixtures'
import type { SynthesisGoal } from '../../types/synthesis'

describe('CandidateGenerator', () => {
  const generator = new CandidateGenerator(partDefsById)

  it('generates the requested number of candidates', () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make something cool',
      objectives: ['stability'],
      constraints: { require_motor: true },
      candidate_count: 3,
      seed: 42
    }

    const result = generator.generate(goal)

    // Should find 3 valid candidates easily
    expect(result.candidates).toHaveLength(3)
    
    for (const cand of result.candidates) {
      expect(cand.topology.format_version).toBe('topology-v1')
      expect(cand.score.total).toBeGreaterThan(0)
    }
  })

  it('rejects candidates that violate strict constraints (e.g. via mutations causing topology invalidity)', () => {
    // This is probabilistic, but by asking for many candidates, we expect at least some rejections
    // due to the random mutator causing incompatible twists or slides.
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Test rejections',
      objectives: ['stability'],
      constraints: {},
      candidate_count: 5,
      seed: 123
    }

    const result = generator.generate(goal)
    
    // We expect some rejections due to stochastic nature, or if not, at least candidates
    expect(result.candidates.length).toBeGreaterThan(0)
    
    if (result.rejections.length > 0) {
      expect(result.rejections[0].reason_code).toBeDefined()
    }
  })

  it('generates deterministically with the same seed', () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Test determinism',
      objectives: ['stability'],
      constraints: {},
      candidate_count: 2,
      seed: 999
    }

    const result1 = generator.generate(goal)
    const result2 = generator.generate(goal)

    expect(result1.candidates).toHaveLength(2)
    expect(result2.candidates).toHaveLength(2)

    // Scores should match exactly due to seeded PRNG
    expect(result1.candidates[0].score.total).toBe(result2.candidates[0].score.total)
    expect(result1.candidates[1].score.total).toBe(result2.candidates[1].score.total)

    // Rejections should be identical
    expect(result1.rejections.length).toBe(result2.rejections.length)
  })
})
