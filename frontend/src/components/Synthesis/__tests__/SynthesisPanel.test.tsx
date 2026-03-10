import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SynthesisPanel } from '../SynthesisPanel'
import { useSynthesisStore } from '../../../stores/synthesisStore'

describe('SynthesisPanel', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSynthesisStore.setState({
      prompt: '',
      objectives: ['stability'],
      constraints: { require_motor: true, max_parts: 50 },
      candidateCount: 3,
      isGenerating: false
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

  it('shows generating state when button is clicked', () => {
    // Set up a valid prompt
    useSynthesisStore.setState({ prompt: 'A valid prompt' })
    
    render(<SynthesisPanel />)
    
    const generateBtn = screen.getByRole('button', { name: 'Synthesize' })
    fireEvent.click(generateBtn)
    
    expect(useSynthesisStore.getState().isGenerating).toBe(true)
    expect(screen.getByText('Generating...')).toBeInTheDocument()
    expect(generateBtn).toBeDisabled()
  })
})
