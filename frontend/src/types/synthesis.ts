import type { TopologyModel } from '../services/topologySolver'

export const SYNTHESIS_GOAL_FORMAT_VERSION = 'synthesis-goal-v1' as const
export const SYNTHESIS_CANDIDATE_FORMAT_VERSION = 'synthesis-candidate-v1' as const

export type SynthesisObjective =
  | 'stability'
  | 'part_efficiency'
  | 'smooth_rotation'
  | 'compactness'
  | 'structural_simplicity'
  | 'motion_range'

export type SynthesisJobState = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

export type SynthesisJobStage =
  | 'queued'
  | 'generating'
  | 'evolving'
  | 'validating'
  | 'scoring'
  | 'ranking'
  | 'complete'
  | 'failed'
  | 'cancelled'

export interface SynthesisConstraintSet {
  max_parts?: number
  max_envelope_mm?: [number, number, number]
  allow_disconnected?: boolean
  require_motor?: boolean
  required_joint_types?: Array<'fixed' | 'revolute' | 'prismatic'>
  required_part_ids?: string[]
  banned_part_ids?: string[]
  max_generation_time_ms?: number
  population_size?: number
  survivor_count?: number
  children_per_survivor?: number
  generation_count?: number
}

export interface SynthesisGoal {
  format_version: typeof SYNTHESIS_GOAL_FORMAT_VERSION
  prompt: string
  objectives: SynthesisObjective[]
  constraints: SynthesisConstraintSet
  candidate_count?: number
  seed?: number
  metadata?: {
    source?: 'user' | 'preset' | 'imported'
    [key: string]: unknown
  }
}

export interface SynthesisDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  details?: Record<string, unknown>
}

export interface SynthesisScorePenalty {
  code: string
  value: number
  reason: string
}

export interface SynthesisScoreBreakdown {
  total: number
  objective_fit: number
  stability: number
  stress_resilience: number
  part_efficiency: number
  structural_simplicity: number
  penalties: SynthesisScorePenalty[]
}

export interface SynthesisCandidateMetrics {
  part_count: number
  connection_count: number
  estimated_envelope_mm: [number, number, number]
  stability_score?: number
}

export interface SynthesisCandidate {
  format_version: typeof SYNTHESIS_CANDIDATE_FORMAT_VERSION
  candidate_id: string
  summary: string
  topology: TopologyModel
  score: SynthesisScoreBreakdown
  diagnostics: SynthesisDiagnostic[]
  metrics: SynthesisCandidateMetrics
}

export interface SynthesisCandidateRejection {
  candidate_id: string
  reason_code: string
  reason_message: string
  diagnostics: SynthesisDiagnostic[]
}

export interface SynthesisJobError {
  code: string
  message: string
  retriable: boolean
}

export interface SynthesisJobStatus {
  job_id: string
  goal: SynthesisGoal
  state: SynthesisJobState
  stage: SynthesisJobStage
  progress: number
  created_at: string
  updated_at: string
  candidates: SynthesisCandidate[]
  rejections: SynthesisCandidateRejection[]
  error?: SynthesisJobError
}
