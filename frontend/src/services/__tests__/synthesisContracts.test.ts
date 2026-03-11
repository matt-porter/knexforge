import { describe, expect, it } from 'vitest'

import {
  SYNTHESIS_PERSISTED_RECORD_VERSION,
  SYNTHESIS_WORKER_CONTRACT_VERSION,
  createPersistedSynthesisCandidateRecord,
  parsePersistedSynthesisCandidateRecord,
  parseSynthesisGoal,
  parseSynthesisWorkerRequest,
} from '../synthesis/contracts'

describe('synthesis contracts', () => {
  it('parses modern synthesis goal payloads', () => {
    const goal = parseSynthesisGoal({
      format_version: 'synthesis-goal-v1',
      prompt: 'stable motorized spinner',
      objectives: ['stability', 'smooth_rotation'],
      constraints: {
        max_parts: 35,
        max_envelope_mm: [250, 250, 250],
        allow_disconnected: false,
        require_motor: true,
        required_joint_types: ['fixed', 'revolute'],
      },
      seed: 42,
      candidate_count: 4,
    })

    expect(goal.prompt).toBe('stable motorized spinner')
    expect(goal.objectives).toEqual(['stability', 'smooth_rotation'])
    expect(goal.constraints.max_parts).toBe(35)
    expect(goal.constraints.max_envelope_mm).toEqual([250, 250, 250])
    expect(goal.constraints.required_joint_types).toEqual(['fixed', 'revolute'])
    expect(goal.seed).toBe(42)
    expect(goal.candidate_count).toBe(4)
  })

  it('normalizes legacy goal fields for backward compatibility', () => {
    const goal = parseSynthesisGoal({
      goal_prompt: 'compact linkage',
      optimize_for: ['compactness', 'part_efficiency'],
      constraints: {
        maxParts: 22,
        maxEnvelopeMm: [180, 150, 120],
        requireMotor: false,
      },
      random_seed: 99,
      candidateCount: 3,
    })

    expect(goal.prompt).toBe('compact linkage')
    expect(goal.objectives).toEqual(['compactness', 'part_efficiency'])
    expect(goal.constraints.max_parts).toBe(22)
    expect(goal.constraints.max_envelope_mm).toEqual([180, 150, 120])
    expect(goal.constraints.require_motor).toBe(false)
    expect(goal.seed).toBe(99)
    expect(goal.candidate_count).toBe(3)
  })

  it('parses worker generate and cancel requests', () => {
    const generateRequest = parseSynthesisWorkerRequest({
      type: 'synthesis.generate',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: 'req-1',
      goal: {
        prompt: 'spinner',
        objectives: ['stability'],
        constraints: {},
      },
    })

    expect(generateRequest.type).toBe('synthesis.generate')
    if (generateRequest.type === 'synthesis.generate') {
      expect(generateRequest.goal.prompt).toBe('spinner')
    }

    const cancelRequest = parseSynthesisWorkerRequest({
      type: 'synthesis.cancel',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: 'req-2',
      job_id: 'job-1',
    })

    expect(cancelRequest).toEqual({
      type: 'synthesis.cancel',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: 'req-2',
      job_id: 'job-1',
    })
  })

  it('rejects unsupported objective values', () => {
    expect(() =>
      parseSynthesisGoal({
        prompt: 'invalid objective test',
        objectives: ['magic_speed'],
        constraints: {},
      }),
    ).toThrow(/Unsupported synthesis objective/)
  })

  it('creates and parses persisted v1 candidate records', () => {
    const record = createPersistedSynthesisCandidateRecord(
      {
        format_version: 'synthesis-goal-v1',
        prompt: 'stable spinner',
        objectives: ['stability'],
        constraints: { max_parts: 30 },
      },
      [
        {
          format_version: 'synthesis-candidate-v1',
          candidate_id: 'cand-1',
          summary: 'Balanced spinner with fixed base',
          topology: {
            format_version: 'topology-v1',
            parts: [{ instance_id: 'r1', part_id: 'rod-128-red-v1' }],
            connections: [],
          },
          score: {
            total: 87,
            objective_fit: 20,
            stability: 25,
            stress_resilience: 15,
            part_efficiency: 12,
            structural_simplicity: 15,
            penalties: [],
          },
          diagnostics: [],
          metrics: {
            part_count: 1,
            connection_count: 0,
            estimated_envelope_mm: [128, 10, 10],
          },
        },
      ],
      '2026-03-10T12:00:00.000Z',
    )

    const parsed = parsePersistedSynthesisCandidateRecord(record)
    expect(parsed.schema_version).toBe(SYNTHESIS_PERSISTED_RECORD_VERSION)
    expect(parsed.saved_at).toBe('2026-03-10T12:00:00.000Z')
    expect(parsed.goal.prompt).toBe('stable spinner')
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0].candidate_id).toBe('cand-1')
  })

  it('normalizes legacy persisted candidate records', () => {
    const parsed = parsePersistedSynthesisCandidateRecord({
      schemaVersion: 0,
      savedAt: '2026-03-10T13:45:00.000Z',
      goal_prompt: 'legacy record spinner',
      optimize_for: ['stability'],
      constraints: {
        maxParts: 18,
      },
      results: [
        {
          id: 'legacy-candidate',
          rationale: 'legacy summary field',
          topology: {
            parts: [{ instance_id: 'c1', part_id: 'connector-3way-red-v1' }],
            connections: [],
          },
          score: {
            total: 80,
            objective_fit: 20,
            stability: 20,
            stress_resilience: 15,
            part_efficiency: 15,
            structural_simplicity: 10,
          },
          diagnostics: [{ code: 'legacy', message: 'legacy payload', severity: 'info' }],
          metrics: {
            part_count: 1,
            connection_count: 0,
            estimated_envelope_mm: [20, 20, 20],
          },
        },
      ],
    })

    expect(parsed.schema_version).toBe(SYNTHESIS_PERSISTED_RECORD_VERSION)
    expect(parsed.goal.prompt).toBe('legacy record spinner')
    expect(parsed.goal.constraints.max_parts).toBe(18)
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0].candidate_id).toBe('legacy-candidate')
    expect(parsed.candidates[0].summary).toBe('legacy summary field')
  })
})
