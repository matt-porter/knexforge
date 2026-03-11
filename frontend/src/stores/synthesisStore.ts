import { create } from 'zustand'
import type { SynthesisGoal, SynthesisObjective, SynthesisConstraintSet, SynthesisCandidate } from '../types/synthesis'
import type { SolvedTopologyBuild } from '../services/topologySolver'

export interface SynthesisState {
  // Goal authoring
  prompt: string
  objectives: SynthesisObjective[]
  constraints: SynthesisConstraintSet
  candidateCount: number
  isGenerating: boolean
  
  // Results
  candidates: SynthesisCandidate[]
  selectedCandidateId: string | null
  previewBuild: SolvedTopologyBuild | null
  
  // Actions
  setPrompt: (prompt: string) => void
  toggleObjective: (objective: SynthesisObjective) => void
  setConstraint: <K extends keyof SynthesisConstraintSet>(key: K, value: SynthesisConstraintSet[K]) => void
  setCandidateCount: (count: number) => void
  startGeneration: () => void
  stopGeneration: () => void
  setCandidates: (candidates: SynthesisCandidate[]) => void
  setSelectedCandidate: (id: string | null) => void
  setPreviewBuild: (build: SolvedTopologyBuild | null) => void
  
  // Helpers
  getGoal: () => SynthesisGoal
}

export const useSynthesisStore = create<SynthesisState>((set, get) => ({
  prompt: '',
  objectives: ['stability'],
  constraints: {
    require_motor: true,
    max_parts: 50,
  },
  candidateCount: 3,
  isGenerating: false,
  candidates: [],
  selectedCandidateId: null,
  previewBuild: null,

  setPrompt: (prompt) => set({ prompt }),
  
  toggleObjective: (objective) => set((state) => {
    const current = state.objectives
    const next = current.includes(objective)
      ? current.filter(o => o !== objective)
      : [...current, objective]
    
    // Always keep at least one objective
    if (next.length === 0) return { objectives: ['stability'] }
    return { objectives: next }
  }),

  setConstraint: (key, value) => set((state) => ({
    constraints: {
      ...state.constraints,
      [key]: value
    }
  })),

  setCandidateCount: (count) => set({ candidateCount: Math.max(1, Math.min(10, count)) }),

  startGeneration: () => set({ isGenerating: true }),
  stopGeneration: () => set({ isGenerating: false }),
  
  setCandidates: (candidates) => set({ candidates, selectedCandidateId: null, previewBuild: null }),
  setSelectedCandidate: (id) => set({ selectedCandidateId: id }),
  setPreviewBuild: (build) => set({ previewBuild: build }),

  getGoal: () => {
    const state = get()
    return {
      format_version: 'synthesis-goal-v1',
      prompt: state.prompt,
      objectives: state.objectives,
      constraints: state.constraints,
      candidate_count: state.candidateCount
    }
  }
}))
