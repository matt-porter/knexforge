import { create } from 'zustand'
import type {
  SynthesisGoal,
  SynthesisObjective,
  SynthesisConstraintSet,
  SynthesisCandidate,
} from '../types/synthesis'
import type { SolvedTopologyBuild } from '../services/topologySolver'

const DEFAULT_SYNTHESIS_TIMEOUT_MS = 120_000
const DEFAULT_EVOLUTION_GENERATIONS = 5

function normalizeGenerationCount(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EVOLUTION_GENERATIONS
  }
  return Math.max(1, Math.round(value ?? DEFAULT_EVOLUTION_GENERATIONS))
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return value
}

export interface SynthesisState {
  // Goal authoring
  prompt: string
  objectives: SynthesisObjective[]
  constraints: SynthesisConstraintSet
  candidateCount: number
  isGenerating: boolean
  progress: number
  currentGeneration: number
  totalGenerations: number
  bestScoreSoFar: number

  // Results
  candidates: SynthesisCandidate[]
  selectedCandidateId: string | null
  previewBuild: SolvedTopologyBuild | null

  // Actions
  setPrompt: (prompt: string) => void
  toggleObjective: (objective: SynthesisObjective) => void
  setConstraint: <K extends keyof SynthesisConstraintSet>(
    key: K,
    value: SynthesisConstraintSet[K],
  ) => void
  setCandidateCount: (count: number) => void
  startGeneration: () => void
  stopGeneration: () => void
  setProgress: (progress: number) => void
  setEvolutionInfo: (current: number, total: number, bestScore: number) => void
  resetProgress: () => void
  setCandidates: (candidates: SynthesisCandidate[]) => void
  setSelectedCandidate: (id: string | null) => void
  setPreviewBuild: (build: SolvedTopologyBuild | null) => void

  // Helpers
  getGoal: () => SynthesisGoal
}

export const useSynthesisStore = create<SynthesisState>()((set, get) => ({
  prompt: '',
  objectives: ['stability'],
  constraints: {
    require_motor: true,
    max_parts: 50,
    max_generation_time_ms: DEFAULT_SYNTHESIS_TIMEOUT_MS,
  },
  candidateCount: 3,
  isGenerating: false,
  progress: 0,
  currentGeneration: 0,
  totalGenerations: DEFAULT_EVOLUTION_GENERATIONS,
  bestScoreSoFar: 0,
  candidates: [],
  selectedCandidateId: null,
  previewBuild: null,

  setPrompt: (prompt) => set({ prompt }),

  toggleObjective: (objective) =>
    set((state) => {
      const current = state.objectives
      const next = current.includes(objective)
        ? current.filter((o) => o !== objective)
        : [...current, objective]

      // Always keep at least one objective
      if (next.length === 0) return { objectives: ['stability'] }
      return { objectives: next }
    }),

  setConstraint: (key, value) =>
    set((state) => {
      const nextConstraints = {
        ...state.constraints,
        [key]: value,
      }

      if (key === 'generation_count') {
        const totalGenerations = normalizeGenerationCount(nextConstraints.generation_count)
        return {
          constraints: nextConstraints,
          totalGenerations,
          currentGeneration: Math.min(state.currentGeneration, totalGenerations),
        }
      }

      return {
        constraints: nextConstraints,
      }
    }),

  setCandidateCount: (count) => set({ candidateCount: Math.max(1, Math.min(10, count)) }),

  startGeneration: () =>
    set((state) => {
      const totalGenerations = normalizeGenerationCount(state.constraints.generation_count)
      return {
        isGenerating: true,
        progress: 0,
        currentGeneration: 0,
        totalGenerations,
        bestScoreSoFar: 0,
      }
    }),
  stopGeneration: () => set({ isGenerating: false }),
  setProgress: (progress) => set({ progress: clampProgress(progress) }),
  setEvolutionInfo: (current, total, bestScore) => {
    const totalGenerations = normalizeGenerationCount(total)
    const currentGeneration = Math.max(0, Math.min(totalGenerations, Math.round(current)))

    set({
      currentGeneration,
      totalGenerations,
      bestScoreSoFar: normalizeScore(bestScore),
    })
  },
  resetProgress: () =>
    set((state) => ({
      progress: 0,
      currentGeneration: 0,
      totalGenerations: normalizeGenerationCount(state.constraints.generation_count),
      bestScoreSoFar: 0,
    })),

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
      candidate_count: state.candidateCount,
    }
  },
}))
