import { describe, it, expect } from 'vitest'
import { CandidateRepository, getTopologyFingerprint } from '../synthesis/repository'
import { createSynthesisJobStore } from '../synthesis/jobStore'
import type { SynthesisCandidate, SynthesisJobStatus } from '../../types/synthesis'

describe('CandidateRepository and Fingerprinting', () => {

  it('generates consistent fingerprints for structurally identical topologies', async () => {
    const topologyA = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: '1', part_id: 'rod-54' },
        { instance_id: '2', part_id: 'connector-2way' }
      ],
      connections: [
        { from: '1.end1', to: '2.center', joint_type: 'fixed' as const }
      ]
    }

    const topologyB = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: '2', part_id: 'connector-2way' }, // different order
        { instance_id: '1', part_id: 'rod-54' }
      ],
      connections: [
        // from and to reversed, but structurally same after canonicalization
        { from: '2.center', to: '1.end1', joint_type: 'fixed' as const } 
      ]
    }

    const hashA = await getTopologyFingerprint(topologyA)
    const hashB = await getTopologyFingerprint(topologyB)

    expect(hashA).toBe(hashB)
    expect(hashA.length).toBe(64) // SHA-256 hex string length
  })

  it('generates different fingerprints for structurally different topologies', async () => {
    const topologyA = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: '1', part_id: 'rod-54' },
      ],
      connections: []
    }

    const topologyB = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: '1', part_id: 'rod-86' }, // Different part ID
      ],
      connections: []
    }

    const hashA = await getTopologyFingerprint(topologyA)
    const hashB = await getTopologyFingerprint(topologyB)

    expect(hashA).not.toBe(hashB)
  })

  it('deduplicates a batch of candidates', async () => {
    const store = createSynthesisJobStore({ enableIndexedDb: false })
    const repo = new CandidateRepository(store)

    const cand1: SynthesisCandidate = {
      format_version: 'synthesis-candidate-v1',
      candidate_id: 'c1',
      summary: '',
      topology: {
        format_version: 'topology-v1',
        parts: [{ instance_id: '1', part_id: 'rod-54' }],
        connections: []
      },
      score: { total: 1, objective_fit: 1, stability: 1, stress_resilience: 1, part_efficiency: 1, structural_simplicity: 1, penalties: [] },
      diagnostics: [],
      metrics: { part_count: 1, connection_count: 0, estimated_envelope_mm: [1,1,1] }
    }

    const cand2: SynthesisCandidate = {
      ...cand1,
      candidate_id: 'c2',
      // Same topology, should be filtered
    }

    const cand3: SynthesisCandidate = {
      ...cand1,
      candidate_id: 'c3',
      topology: {
        format_version: 'topology-v1',
        parts: [{ instance_id: '1', part_id: 'rod-86' }],
        connections: []
      }
    }

    const deduped = await repo.deduplicate([cand1, cand2, cand3])

    expect(deduped).toHaveLength(2)
    expect(deduped.map(c => c.candidate_id)).toEqual(['c1', 'c3'])
  })

  it('can extract all candidates across saved jobs', async () => {
    const store = createSynthesisJobStore({ enableIndexedDb: false })
    const repo = new CandidateRepository(store)

    const cand1: SynthesisCandidate = {
      format_version: 'synthesis-candidate-v1',
      candidate_id: 'c1',
      summary: '',
      topology: { format_version: 'topology-v1', parts: [], connections: [] },
      score: { total: 1, objective_fit: 1, stability: 1, stress_resilience: 1, part_efficiency: 1, structural_simplicity: 1, penalties: [] },
      diagnostics: [],
      metrics: { part_count: 0, connection_count: 0, estimated_envelope_mm: [0,0,0] }
    }

    const job1: SynthesisJobStatus = {
      job_id: 'j1',
      goal: { format_version: 'synthesis-goal-v1', prompt: '', objectives: [], constraints: {} },
      state: 'complete',
      stage: 'complete',
      progress: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      candidates: [cand1],
      rejections: []
    }

    await store.save(job1)

    const allCands = await repo.getAllCandidates()
    expect(allCands).toHaveLength(1)
    expect(allCands[0].candidate_id).toBe('c1')
  })
})
