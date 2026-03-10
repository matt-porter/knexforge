import { describe, it, expect } from 'vitest'
import { evaluateCandidateScore } from '../synthesis/scoring'
import { evaluatePhysics } from '../synthesis/physicsEval'
import { partDefsById } from './partFixtures'
import type { TopologyModel, SolvedTopologyBuild } from '../topologySolver'
import type { SynthesisGoal } from '../../types/synthesis'
import { spinnerTemplate } from '../synthesis/templateCatalog/spinner'
import { TopologyOracle } from '../synthesis/topologyOracle'

describe('Physics Evaluation & Scoring', () => {
  const oracle = new TopologyOracle(partDefsById)
  const validModel = spinnerTemplate.generate({ requireMotor: true })
  const result = oracle.evaluate(validModel)
  
  if (!result.isValid) {
    throw new Error('Test setup failed: could not solve spinner template')
  }

  const solvedBuild = result.solvedBuild

  it('evaluatePhysics computes reasonable bounds and metrics', () => {
    const physics = evaluatePhysics(solvedBuild, partDefsById)
    
    expect(physics.massGrams).toBeGreaterThan(0)
    expect(physics.dimensionsMm.x).toBeGreaterThan(0)
    expect(physics.dimensionsMm.y).toBeGreaterThanOrEqual(0)
    expect(physics.dimensionsMm.z).toBeGreaterThanOrEqual(0)
    
    // Stability score should be within 0-1
    expect(physics.estimatedStabilityScore).toBeGreaterThanOrEqual(0)
    expect(physics.estimatedStabilityScore).toBeLessThanOrEqual(1)
    
    // Stress score should be within 0-1
    expect(physics.estimatedStressScore).toBeGreaterThanOrEqual(0)
    expect(physics.estimatedStressScore).toBeLessThanOrEqual(1)
  })

  it('evaluateCandidateScore penalizes for exceeding max parts', () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make it spin',
      objectives: ['stability'],
      constraints: { max_parts: 2 } // spinner takes >2 parts
    }

    const score = evaluateCandidateScore(validModel, solvedBuild, goal, partDefsById)
    
    expect(score.penalties).toContainEqual(
      expect.objectContaining({
        code: 'max_parts_exceeded'
      })
    )
    expect(score.part_efficiency).toBeLessThan(1.0)
  })

  it('evaluateCandidateScore rewards structural simplicity for simple builds', () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make it spin',
      objectives: ['structural_simplicity'],
      constraints: {}
    }

    const score = evaluateCandidateScore(validModel, solvedBuild, goal, partDefsById)
    // Spinner is a tree, connection count = part count - 1
    expect(score.structural_simplicity).toBe(1.0)
  })

  it('evaluateCandidateScore penalizes for exceeding max envelope', () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make it small',
      objectives: ['compactness'],
      constraints: {
        max_envelope_mm: [10, 10, 10] // unrealistically small
      }
    }

    const score = evaluateCandidateScore(validModel, solvedBuild, goal, partDefsById)
    
    expect(score.penalties).toContainEqual(
      expect.objectContaining({
        code: 'max_envelope_exceeded'
      })
    )
    // Score should be reduced due to penalty
    expect(score.total).toBeLessThan(1.0)
  })

  it('evaluateCandidateScore computes weights based on stability priority', () => {
    const goalWithoutStability: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Test',
      objectives: ['compactness'],
      constraints: {}
    }

    const goalWithStability: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Test',
      objectives: ['stability'],
      constraints: {}
    }

    const score1 = evaluateCandidateScore(validModel, solvedBuild, goalWithoutStability, partDefsById)
    const score2 = evaluateCandidateScore(validModel, solvedBuild, goalWithStability, partDefsById)

    // With different objective priorities, the overall scores should vary (unless physics is completely neutral)
    // Since spinner has a specific stability score, emphasizing it should shift total.
    expect(score1.total).not.toBe(score2.total)
  })
})
