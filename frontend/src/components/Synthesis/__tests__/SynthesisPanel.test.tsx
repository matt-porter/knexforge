import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { SynthesisPanel } from '../SynthesisPanel'
import { useSynthesisStore } from '../../../stores/synthesisStore'

describe('SynthesisPanel', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSynthesisStore.setState({
      prompt: '',
      objectives: ['stability'],
      constraints: { require_motor: true, max_parts: 50, max_generation_time_ms: 120000 },
      candidateCount: 3,
      isGenerating: false,
      progress: 0,
      currentGeneration: 0,
      totalGenerations: 5,
      bestScoreSoFar: 0,
    })
  })

  it('renders the initial state correctly', () => {
    render(<SynthesisPanel />)

    // Header
    expect(screen.getByText('AI Mechanism Synthesis')).toBeInTheDocument()

    // Button is disabled when prompt is empty
    const generateBtn = screen.getByRole('button', { name: 'Synthesize' })
    expect(generateBtn).toBeDisabled()

    // Checkboxes and inputs
    const requireMotor = screen.getByLabelText('Require Motor')
    expect(requireMotor).toBeChecked()

    const maxParts = screen.getByDisplayValue('50')
    expect(maxParts).toBeInTheDocument()

    expect(
      screen.queryByRole('progressbar', { name: 'Synthesis Generation Progress' }),
    ).not.toBeInTheDocument()
  })

  it('updates the prompt and enables the button', () => {
    render(<SynthesisPanel />)

    const promptInput = screen.getByPlaceholderText(/e.g. A spinning sign post mechanism/i)
    fireEvent.change(promptInput, { target: { value: 'Make a fan' } })

    expect(useSynthesisStore.getState().prompt).toBe('Make a fan')

    const generateBtn = screen.getByRole('button', { name: 'Synthesize' })
    expect(generateBtn).not.toBeDisabled()
  })

  it('toggles objectives correctly', () => {
    render(<SynthesisPanel />)

    // Stability is checked by default (has active styling)
    const stabilityBtn = screen.getByText('Stability')
    const compactnessBtn = screen.getByText('Compactness')

    // Click compactness to enable
    fireEvent.click(compactnessBtn)
    expect(useSynthesisStore.getState().objectives).toContain('compactness')

    // Click stability to disable
    fireEvent.click(stabilityBtn)
    expect(useSynthesisStore.getState().objectives).not.toContain('stability')
  })

  it('renders progress bar while generation is active', () => {
    useSynthesisStore.setState({
      isGenerating: true,
      progress: 0.4,
      currentGeneration: 2,
      totalGenerations: 5,
      bestScoreSoFar: 0.72,
    })

    render(<SynthesisPanel />)

    expect(screen.getByRole('button', { name: 'Generating...' })).toBeDisabled()
    expect(
      screen.getByRole('progressbar', { name: 'Synthesis Generation Progress' }),
    ).toBeInTheDocument()
  })

  it('tracks progress bar width from store progress state', () => {
    useSynthesisStore.setState({
      isGenerating: true,
      progress: 0.67,
      currentGeneration: 3,
      totalGenerations: 5,
      bestScoreSoFar: 0.41,
    })

    render(<SynthesisPanel />)

    const fill = screen.getByTestId('synthesis-progress-fill')
    expect(fill).toHaveStyle({ width: '67%' })
  })

  it('shows generation and best score details while generating', () => {
    useSynthesisStore.setState({
      isGenerating: true,
      progress: 0.8,
      currentGeneration: 4,
      totalGenerations: 5,
      bestScoreSoFar: 0.93,
    })

    render(<SynthesisPanel />)

    expect(screen.getByTestId('synthesis-progress-text')).toHaveTextContent(
      'Generation 4 / 5 • Best Score: 0.93',
    )
  })

  it('hides progress bar when not generating', () => {
    useSynthesisStore.setState({
      isGenerating: false,
      progress: 0.5,
      currentGeneration: 2,
      totalGenerations: 5,
      bestScoreSoFar: 0.75,
    })

    render(<SynthesisPanel />)

    expect(
      screen.queryByRole('progressbar', { name: 'Synthesis Generation Progress' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('synthesis-progress-fill')).not.toBeInTheDocument()
  })
})
