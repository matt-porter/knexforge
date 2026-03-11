import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SynthesisPanel } from '../SynthesisPanel'
import { CandidateExplorer } from '../CandidateExplorer'
import { useSynthesisStore } from '../../../stores/synthesisStore'
import { useBuildStore } from '../../../stores/buildStore'
import type { SynthesisCandidate } from '../../../types/synthesis'

// Mock the alert to prevent it from cluttering the test output
global.alert = vi.fn()

describe('Synthesis E2E UI Flow', () => {
  beforeEach(() => {
    act(() => {
      useSynthesisStore.setState({
        prompt: '',
        objectives: ['stability'],
        constraints: { require_motor: true, max_parts: 50 },
        candidateCount: 3,
        isGenerating: false,
        candidates: [],
        selectedCandidateId: null
      })
      useBuildStore.setState({
        parts: {},
        connections: {},
        stabilityScore: null
      })
    })
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('completes the full loop: Setup Goal -> Generate -> Select -> Import', async () => {
    const { container } = render(
      <div>
        <SynthesisPanel />
        <CandidateExplorer />
      </div>
    )

    // 1. Setup Goal
    const promptInput = screen.getByPlaceholderText(/e.g. A spinning sign post mechanism/i)
    fireEvent.change(promptInput, { target: { value: 'A cool spinner' } })

    const generateBtn = screen.getByRole('button', { name: 'Synthesize' })
    expect(generateBtn).not.toBeDisabled()

    // 2. Trigger Generation
    act(() => {
      fireEvent.click(generateBtn)
    })

    // UI should show generating state
    expect(screen.getByText('Generating...')).toBeInTheDocument()
    expect(useSynthesisStore.getState().isGenerating).toBe(true)

    // Simulate the worker returning results by intercepting the mocked timeout in handleGenerate
    // In a real e2e, the runtime orchestrator would do this
    const mockCand: SynthesisCandidate = {
      format_version: 'synthesis-candidate-v1',
      candidate_id: 'cand_1',
      summary: 'Awesome Spinner',
      topology: { format_version: 'topology-v1', parts: [], connections: [] },
      score: { total: 0.95, objective_fit: 0.9, stability: 0.8, stress_resilience: 0.9, part_efficiency: 1.0, structural_simplicity: 1.0, penalties: [] },
      diagnostics: [],
      metrics: { part_count: 5, connection_count: 4, estimated_envelope_mm: [10, 10, 10] },
      solvedBuild: { parts: [{ instance_id: 'p1', part_id: 'm1', position: [0,0,0], rotation: [0,0,0,1] }], connections: [] }
    } as any

    act(() => {
      // Fast forward the fake timeout in SynthesisPanel handleGenerate
      vi.advanceTimersByTime(1500)
      
      // Inject mock candidate directly (as the runtime orchestrator would do upon job complete)
      useSynthesisStore.getState().setCandidates([mockCand])
      useSynthesisStore.getState().stopGeneration()
    })

    // 3. Explorer Appears
    expect(screen.getByText('Generated Candidates')).toBeInTheDocument()
    expect(screen.getByText('Awesome Spinner')).toBeInTheDocument()

    // 4. Select Candidate
    const candElement = screen.getByText('Awesome Spinner').closest('div')?.parentElement
    act(() => {
      fireEvent.click(candElement!)
    })
    expect(useSynthesisStore.getState().selectedCandidateId).toBe('cand_1')

    // 5. Import into Scene
    const importBtn = screen.getByRole('button', { name: /Import into Scene/i })
    act(() => {
      fireEvent.click(importBtn)
    })

    // 6. Verify Store Impact
    const buildState = useBuildStore.getState()
    expect(Object.keys(buildState.parts)).toHaveLength(1)
    expect(buildState.parts['p1'].part_id).toBe('m1')
    expect(buildState.stabilityScore).toBe(0.8)
  })
})
