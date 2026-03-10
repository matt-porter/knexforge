import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CandidateExplorer } from '../CandidateExplorer'
import { useSynthesisStore } from '../../../stores/synthesisStore'
import { useBuildStore } from '../../../stores/buildStore'
import type { SynthesisCandidate } from '../../../types/synthesis'

// Mock the alert to prevent it from cluttering the test output
global.alert = vi.fn()

describe('CandidateExplorer', () => {
  beforeEach(() => {
    // Reset stores
    act(() => {
      useSynthesisStore.setState({
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
  })

  const mockCand1: SynthesisCandidate = {
    format_version: 'synthesis-candidate-v1',
    candidate_id: 'cand_1',
    summary: 'Cool Spinner',
    topology: { format_version: 'topology-v1', parts: [], connections: [] },
    score: { total: 0.95, objective_fit: 0.9, stability: 0.8, stress_resilience: 0.9, part_efficiency: 1.0, structural_simplicity: 1.0, penalties: [] },
    diagnostics: [],
    metrics: { part_count: 5, connection_count: 4, estimated_envelope_mm: [10, 10, 10] },
    // Fake solved build for the test import
    solvedBuild: { parts: [{ instance_id: 'p1', part_id: 'm1', position: [0,0,0], rotation: [0,0,0,1] }], connections: [] }
  } as any // Cast because solvedBuild is a hack we added for the UI mockup

  const mockCand2: SynthesisCandidate = {
    ...mockCand1,
    candidate_id: 'cand_2',
    summary: 'Okay Spinner',
    score: { ...mockCand1.score, total: 0.75 }
  } as any

  it('renders nothing if no candidates exist', () => {
    const { container } = render(<CandidateExplorer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders candidates and allows selection', () => {
    act(() => {
      useSynthesisStore.setState({ candidates: [mockCand1, mockCand2] })
    })
    render(<CandidateExplorer />)

    expect(screen.getByText('Generated Candidates')).toBeInTheDocument()
    expect(screen.getByText('Cool Spinner')).toBeInTheDocument()
    expect(screen.getByText('Okay Spinner')).toBeInTheDocument()

    // Scores (0.95 * 100 = 95)
    expect(screen.getByText('Score: 95')).toBeInTheDocument()

    // Select a candidate
    const cand2Element = screen.getByText('Okay Spinner').closest('div')?.parentElement
    expect(cand2Element).toBeDefined()
    
    // Click on the container to select it
    act(() => {
      fireEvent.click(cand2Element!)
    })
    
    expect(useSynthesisStore.getState().selectedCandidateId).toBe('cand_2')
  })

  it('shows an import button only on the selected candidate', () => {
    act(() => {
      useSynthesisStore.setState({ 
        candidates: [mockCand1, mockCand2],
        selectedCandidateId: 'cand_1'
      })
    })
    render(<CandidateExplorer />)

    const buttons = screen.getAllByRole('button', { name: /Import into Scene/i })
    expect(buttons).toHaveLength(1)
  })

  it('imports candidate into buildStore when button is clicked', () => {
    act(() => {
      useSynthesisStore.setState({ 
        candidates: [mockCand1],
        selectedCandidateId: 'cand_1'
      })
    })
    render(<CandidateExplorer />)

    const importBtn = screen.getByRole('button', { name: /Import into Scene/i })
    act(() => {
      fireEvent.click(importBtn)
    })

    // Check if build store was updated with the mock solvedBuild
    const buildState = useBuildStore.getState()
    expect(Object.keys(buildState.parts)).toHaveLength(1)
    expect(buildState.parts['p1'].part_id).toBe('m1')
    expect(buildState.stabilityScore).toBe(0.8) // matches cand_1 score.stability
  })
})
