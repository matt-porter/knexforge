import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CandidateExplorer } from '../CandidateExplorer'
import { loadAllPartDefs } from '../../../hooks/usePartLibrary'
import { solveTopology } from '../../../services/topologySolver'
import { useBuildStore } from '../../../stores/buildStore'
import { useSynthesisStore } from '../../../stores/synthesisStore'
import type { SynthesisCandidate } from '../../../types/synthesis'

vi.mock('../../../hooks/usePartLibrary', () => ({
  loadAllPartDefs: vi.fn(),
}))

vi.mock('../../../services/topologySolver', () => ({
  solveTopology: vi.fn(),
}))

describe('CandidateExplorer Regressions', () => {
  const loadAllPartDefsMock = vi.mocked(loadAllPartDefs)
  const solveTopologyMock = vi.mocked(solveTopology)
  const originalLoadBuild = useBuildStore.getState().loadBuild

  beforeEach(() => {
    useSynthesisStore.setState({
      candidates: [],
      selectedCandidateId: null,
      previewBuild: null,
      setSelectedCandidate: vi.fn(),
      setPreviewBuild: vi.fn(),
    })

    useBuildStore.setState({
      loadBuild: originalLoadBuild,
    } as never)

    loadAllPartDefsMock.mockResolvedValue(new Map())
    solveTopologyMock.mockReturnValue({
      parts: [
        {
          instance_id: 'p1',
          part_id: 'rod-16-green-v1',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
        },
      ],
      connections: [],
    })
  })

  afterEach(() => {
    useBuildStore.setState({
      loadBuild: originalLoadBuild,
    } as never)
    vi.clearAllMocks()
  })

  it('imports synthesis stability as a BuildStore percentage score', async () => {
    const loadBuildSpy = vi.fn()
    useBuildStore.setState({
      loadBuild: loadBuildSpy,
    } as never)

    const candidate: SynthesisCandidate = {
      format_version: 'synthesis-candidate-v1',
      candidate_id: 'cand-scale',
      summary: 'Scale check candidate',
      topology: {
        format_version: 'topology-v1',
        parts: [],
        connections: [],
      },
      score: {
        total: 0.9,
        objective_fit: 0.8,
        stability: 0.8,
        stress_resilience: 0.7,
        part_efficiency: 0.9,
        structural_simplicity: 0.9,
        penalties: [],
      },
      diagnostics: [],
      metrics: {
        part_count: 1,
        connection_count: 0,
        estimated_envelope_mm: [16, 8, 8],
      },
    }

    useSynthesisStore.setState({
      candidates: [candidate],
      selectedCandidateId: candidate.candidate_id,
    })

    render(<CandidateExplorer />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import into Scene/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(loadBuildSpy).toHaveBeenCalledTimes(1)
    })

    expect(loadBuildSpy).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 80)
  })
})
