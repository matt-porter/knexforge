import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { synthesisFeedback } from '../synthesisFeedback'
import { supabase } from '../supabaseClient'
import type { SynthesisGoal, SynthesisCandidate } from '../../types/synthesis'
import { getTopologyFingerprint } from '../synthesis/repository'

// Mock Supabase
vi.mock('../supabaseClient', () => {
  const insertMock = vi.fn()
  const fromMock = vi.fn(() => ({ insert: insertMock }))
  return {
    supabase: {
      from: fromMock
    }
  }
})

describe('SynthesisFeedbackService', () => {
  const mockGoal: SynthesisGoal = {
    format_version: 'synthesis-goal-v1',
    prompt: 'Make a test thing',
    objectives: [],
    constraints: {}
  }

  const mockCandidate: SynthesisCandidate = {
    format_version: 'synthesis-candidate-v1',
    candidate_id: 'c_test',
    summary: 'Test',
    topology: {
      format_version: 'topology-v1',
      parts: [],
      connections: []
    },
    score: { total: 0.9, objective_fit: 0.9, stability: 0.9, stress_resilience: 0.9, part_efficiency: 0.9, structural_simplicity: 0.9, penalties: [] },
    diagnostics: [],
    metrics: { part_count: 0, connection_count: 0, estimated_envelope_mm: [0,0,0] }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    synthesisFeedback.setTelemetryEnabled(true)
  })

  it('logs telemetry to supabase correctly', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    ;(supabase.from as any).mockReturnValue({ insert: insertMock })

    const hash = await getTopologyFingerprint(mockCandidate.topology)

    const result = await synthesisFeedback.logAction('job_123', mockCandidate, mockGoal, 'accepted')
    
    expect(result).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('synthesis_feedback')
    expect(insertMock).toHaveBeenCalledWith({
      job_id: 'job_123',
      candidate_id: 'c_test',
      topology_hash: hash,
      action: 'accepted',
      goal_prompt: 'Make a test thing',
      score_total: 0.9,
      metadata: undefined
    })
  })

  it('returns true but skips supabase if telemetry is disabled', async () => {
    synthesisFeedback.setTelemetryEnabled(false)
    const insertMock = vi.fn()
    ;(supabase.from as any).mockReturnValue({ insert: insertMock })

    const result = await synthesisFeedback.logAction('job_123', mockCandidate, mockGoal, 'accepted')
    
    expect(result).toBe(true)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('returns false if supabase insert fails', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: new Error('Network error') })
    ;(supabase.from as any).mockReturnValue({ insert: insertMock })

    const result = await synthesisFeedback.logAction('job_123', mockCandidate, mockGoal, 'rejected')
    
    expect(result).toBe(false)
  })
})
