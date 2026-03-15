import { describe, it, expect, vi } from 'vitest'
import { CandidateGenerator } from '../synthesis/generator'
import { createSynthesisJobStore } from '../synthesis/jobStore'
import { CandidateRepository } from '../synthesis/repository'
import { synthesisFeedback } from '../synthesisFeedback'
import { partDefsById } from './partFixtures'
import type { SynthesisGoal } from '../../types/synthesis'

// Mock Supabase to avoid trying to actually hit the network/DB in tests
vi.mock('../supabaseClient', () => {
  const insertMock = vi.fn().mockResolvedValue({ error: null })
  const fromMock = vi.fn(() => ({ insert: insertMock }))
  return {
    supabase: {
      from: fromMock
    }
  }
})

describe('Synthesis Flow End-to-End & Performance', () => {

  it('completes the full generation lifecycle under performance budget', async () => {
    // 1. Setup Goal
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make a stable mechanism',
      objectives: ['stability'],
      constraints: { require_motor: true, max_parts: 50 },
      candidate_count: 3,
      seed: 42
    }

    const generator = new CandidateGenerator(partDefsById)
    const store = createSynthesisJobStore({ enableIndexedDb: false })
    const repo = new CandidateRepository(store)

    // E2E Timer start
    const startMs = Date.now()

    // 2. Generate Candidates (covers Oracle & Scoring implicitly)
    const result = generator.generate(goal)
    
    // Performance Budget: keep generation comfortably interactive under test load.
    // The synthesis loop is synchronous and can vary with machine contention.
    const generateDurationMs = Date.now() - startMs
    expect(generateDurationMs).toBeLessThan(1500)
    expect(result.candidates).toHaveLength(3)

    // 3. Deduplication against historical runs
    const deduped = await repo.deduplicate(result.candidates)
    // First run, all should be unique
    expect(deduped).toHaveLength(3)

    // 4. Validate output structures
    const topCandidate = deduped[0]
    expect(topCandidate.topology.format_version).toBe('topology-v1')
    expect(topCandidate.score.total).toBeGreaterThan(0)
    expect(topCandidate.metrics.part_count).toBeGreaterThan(0)

    // 5. Mock user accepting the candidate and importing it
    const feedbackResult = await synthesisFeedback.logAction(
      'mock_job_id', 
      topCandidate, 
      goal, 
      'accepted'
    )
    
    // Opt-out telemetry is default in test env (or mocked), so it should succeed
    expect(feedbackResult).toBe(true)

    // E2E Timer end
    const totalDurationMs = Date.now() - startMs
    expect(totalDurationMs).toBeLessThan(3000)
  })

  it('re-running the exact same goal deduplicates all results', async () => {
    const goal: SynthesisGoal = {
      format_version: 'synthesis-goal-v1',
      prompt: 'Make a stable mechanism',
      objectives: ['stability'],
      constraints: { require_motor: true, max_parts: 50 },
      candidate_count: 3,
      seed: 42
    }

    const generator = new CandidateGenerator(partDefsById)
    const repo = new CandidateRepository(createSynthesisJobStore({ enableIndexedDb: false }))

    // First run
    const result1 = generator.generate(goal)
    const deduped1 = await repo.deduplicate(result1.candidates)
    expect(deduped1).toHaveLength(3)

    // We maintain a shared set to simulate global history
    const history = new Set<string>()
    for (const cand of result1.candidates) {
      // In a real flow, repository gets hashes from saved jobs, 
      // here we inject them manually into the set for the second run
      const hash = await import('../synthesis/repository').then(m => m.getTopologyFingerprint(cand.topology))
      history.add(hash)
    }

    // Second run with same seed -> produces exactly the same topologies
    const result2 = generator.generate(goal)
    const deduped2 = await repo.deduplicate(result2.candidates, history)
    
    // All candidates should be filtered out because their hashes already exist
    expect(deduped2).toHaveLength(0)
  })

})
