import type {
  SynthesisCandidate,
  SynthesisCandidateRejection,
  SynthesisCandidateMetrics,
  SynthesisConstraintSet,
  SynthesisDiagnostic,
  SynthesisGoal,
  SynthesisJobError,
  SynthesisJobStage,
  SynthesisJobState,
  SynthesisJobStatus,
  SynthesisObjective,
  SynthesisScoreBreakdown,
} from '../../types/synthesis'
import {
  SYNTHESIS_CANDIDATE_FORMAT_VERSION,
  SYNTHESIS_GOAL_FORMAT_VERSION,
} from '../../types/synthesis'
import type { TopologyConnection, TopologyModel, TopologyPart } from '../topologySolver'

export const SYNTHESIS_WORKER_CONTRACT_VERSION = 1 as const
export const SYNTHESIS_PERSISTED_RECORD_VERSION = 1 as const

const SYNTHESIS_OBJECTIVES: SynthesisObjective[] = [
  'stability',
  'part_efficiency',
  'smooth_rotation',
  'compactness',
  'structural_simplicity',
  'motion_range',
]

const JOINT_TYPES = ['fixed', 'revolute', 'prismatic'] as const
const JOB_STATES: SynthesisJobState[] = ['queued', 'running', 'complete', 'failed', 'cancelled']
const JOB_STAGES: SynthesisJobStage[] = [
  'queued',
  'generating',
  'validating',
  'scoring',
  'ranking',
  'complete',
  'failed',
  'cancelled',
]

export interface SynthesisWorkerGenerateRequest {
  type: 'synthesis.generate'
  contract_version: typeof SYNTHESIS_WORKER_CONTRACT_VERSION
  request_id: string
  goal: SynthesisGoal
}

export interface SynthesisWorkerCancelRequest {
  type: 'synthesis.cancel'
  contract_version: typeof SYNTHESIS_WORKER_CONTRACT_VERSION
  request_id: string
  job_id: string
}

export type SynthesisWorkerRequest = SynthesisWorkerGenerateRequest | SynthesisWorkerCancelRequest

export interface SynthesisWorkerProgressMessage {
  type: 'synthesis.progress'
  contract_version: typeof SYNTHESIS_WORKER_CONTRACT_VERSION
  request_id: string
  status: SynthesisJobStatus
}

export interface SynthesisWorkerResultMessage {
  type: 'synthesis.result'
  contract_version: typeof SYNTHESIS_WORKER_CONTRACT_VERSION
  request_id: string
  status: SynthesisJobStatus
}

export interface SynthesisWorkerErrorMessage {
  type: 'synthesis.error'
  contract_version: typeof SYNTHESIS_WORKER_CONTRACT_VERSION
  request_id: string
  code: string
  message: string
}

export type SynthesisWorkerResponse =
  | SynthesisWorkerProgressMessage
  | SynthesisWorkerResultMessage
  | SynthesisWorkerErrorMessage

export interface PersistedSynthesisCandidateRecord {
  schema_version: typeof SYNTHESIS_PERSISTED_RECORD_VERSION
  saved_at: string
  goal: SynthesisGoal
  candidates: SynthesisCandidate[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string for ${fieldName}`)
  }
  return value
}

function asBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean for ${fieldName}`)
  }
  return value
}

function asFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected finite number for ${fieldName}`)
  }
  return value
}

function asStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Expected string[] for ${fieldName}`)
  }
  return value
}

function normalizeEnvelope(value: unknown, fieldName: string): [number, number, number] | undefined {
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new Error(`Expected [number, number, number] for ${fieldName}`)
  }
  return [value[0], value[1], value[2]]
}

function normalizeObjectives(value: unknown): SynthesisObjective[] {
  if (!Array.isArray(value)) {
    return ['stability']
  }

  const normalized: SynthesisObjective[] = []
  for (const objective of value) {
    if (typeof objective !== 'string' || !SYNTHESIS_OBJECTIVES.includes(objective as SynthesisObjective)) {
      throw new Error(`Unsupported synthesis objective: ${String(objective)}`)
    }
    normalized.push(objective as SynthesisObjective)
  }

  return normalized.length > 0 ? normalized : ['stability']
}

function normalizeConstraintSet(value: unknown): SynthesisConstraintSet {
  if (!isRecord(value)) {
    return {}
  }

  const maxParts = asFiniteNumber(value.max_parts ?? value.maxParts, 'constraints.max_parts')
  const maxEnvelope = normalizeEnvelope(
    value.max_envelope_mm ?? value.maxEnvelopeMm,
    'constraints.max_envelope_mm',
  )
  const allowDisconnected = asBoolean(
    value.allow_disconnected ?? value.allowDisconnected,
    'constraints.allow_disconnected',
  )
  const requireMotor = asBoolean(value.require_motor ?? value.requireMotor, 'constraints.require_motor')
  const requiredPartIds = asStringArray(
    value.required_part_ids ?? value.requiredPartIds,
    'constraints.required_part_ids',
  )
  const bannedPartIds = asStringArray(
    value.banned_part_ids ?? value.bannedPartIds,
    'constraints.banned_part_ids',
  )

  let requiredJointTypes: SynthesisConstraintSet['required_joint_types']
  if (value.required_joint_types !== undefined || value.requiredJointTypes !== undefined) {
    const raw = value.required_joint_types ?? value.requiredJointTypes
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
      throw new Error('Expected string[] for constraints.required_joint_types')
    }
    requiredJointTypes = raw.map((item) => {
      if (!JOINT_TYPES.includes(item as (typeof JOINT_TYPES)[number])) {
        throw new Error(`Unsupported joint type in constraints.required_joint_types: ${item}`)
      }
      return item as 'fixed' | 'revolute' | 'prismatic'
    })
  }

  const maxGenerationTime = asFiniteNumber(
    value.max_generation_time_ms ?? value.maxGenerationTimeMs,
    'constraints.max_generation_time_ms',
  )

  return {
    max_parts: maxParts,
    max_envelope_mm: maxEnvelope,
    allow_disconnected: allowDisconnected,
    require_motor: requireMotor,
    required_joint_types: requiredJointTypes,
    required_part_ids: requiredPartIds,
    banned_part_ids: bannedPartIds,
    max_generation_time_ms: maxGenerationTime,
  }
}

function normalizeTopologyPart(value: unknown): TopologyPart {
  if (!isRecord(value)) {
    throw new Error('Expected topology part object')
  }

  return {
    instance_id: asString(value.instance_id, 'topology.parts[].instance_id'),
    part_id: asString(value.part_id, 'topology.parts[].part_id'),
    color: typeof value.color === 'string' ? value.color : undefined,
  }
}

function normalizeTopologyConnection(value: unknown): TopologyConnection {
  if (!isRecord(value)) {
    throw new Error('Expected topology connection object')
  }

  return {
    from: asString(value.from, 'topology.connections[].from'),
    to: asString(value.to, 'topology.connections[].to'),
    joint_type:
      typeof value.joint_type === 'string' && JOINT_TYPES.includes(value.joint_type as (typeof JOINT_TYPES)[number])
        ? (value.joint_type as 'fixed' | 'revolute' | 'prismatic')
        : undefined,
    twist_deg: asFiniteNumber(value.twist_deg, 'topology.connections[].twist_deg'),
    fixed_roll: asBoolean(value.fixed_roll, 'topology.connections[].fixed_roll'),
    slide_offset: asFiniteNumber(value.slide_offset, 'topology.connections[].slide_offset'),
  }
}

function normalizeTopologyModel(value: unknown): TopologyModel {
  if (!isRecord(value)) {
    throw new Error('Expected topology model object')
  }

  if (!Array.isArray(value.parts) || !Array.isArray(value.connections)) {
    throw new Error('Topology model must include parts[] and connections[]')
  }

  const metadata = isRecord(value.metadata) ? value.metadata : undefined

  return {
    format_version: 'topology-v1',
    parts: value.parts.map((part) => normalizeTopologyPart(part)),
    connections: value.connections.map((connection) => normalizeTopologyConnection(connection)),
    metadata,
  }
}

function normalizeDiagnostics(value: unknown): SynthesisDiagnostic[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map((diagnostic) => ({
      code: asString(diagnostic.code, 'diagnostics[].code'),
      message: asString(diagnostic.message, 'diagnostics[].message'),
      severity:
        diagnostic.severity === 'warning' || diagnostic.severity === 'info'
          ? diagnostic.severity
          : 'error',
      details: isRecord(diagnostic.details) ? diagnostic.details : undefined,
    }))
}

function normalizeScore(value: unknown): SynthesisScoreBreakdown {
  if (!isRecord(value)) {
    throw new Error('Expected score object')
  }

  return {
    total: asFiniteNumber(value.total, 'score.total') ?? 0,
    objective_fit: asFiniteNumber(value.objective_fit, 'score.objective_fit') ?? 0,
    stability: asFiniteNumber(value.stability, 'score.stability') ?? 0,
    stress_resilience: asFiniteNumber(value.stress_resilience, 'score.stress_resilience') ?? 0,
    part_efficiency: asFiniteNumber(value.part_efficiency, 'score.part_efficiency') ?? 0,
    structural_simplicity: asFiniteNumber(value.structural_simplicity, 'score.structural_simplicity') ?? 0,
    penalties: Array.isArray(value.penalties)
      ? value.penalties
          .filter(isRecord)
          .map((penalty) => ({
            code: asString(penalty.code, 'score.penalties[].code'),
            value: asFiniteNumber(penalty.value, 'score.penalties[].value') ?? 0,
            reason: asString(penalty.reason, 'score.penalties[].reason'),
          }))
      : [],
  }
}

function normalizeMetrics(value: unknown): SynthesisCandidateMetrics {
  if (!isRecord(value)) {
    throw new Error('Expected metrics object')
  }

  return {
    part_count: asFiniteNumber(value.part_count, 'metrics.part_count') ?? 0,
    connection_count: asFiniteNumber(value.connection_count, 'metrics.connection_count') ?? 0,
    estimated_envelope_mm:
      normalizeEnvelope(value.estimated_envelope_mm, 'metrics.estimated_envelope_mm') ?? [0, 0, 0],
    stability_score: asFiniteNumber(value.stability_score, 'metrics.stability_score'),
  }
}

function normalizeCandidate(value: unknown): SynthesisCandidate {
  if (!isRecord(value)) {
    throw new Error('Expected synthesis candidate object')
  }

  return {
    format_version: SYNTHESIS_CANDIDATE_FORMAT_VERSION,
    candidate_id: asString(value.candidate_id ?? value.id, 'candidate.candidate_id'),
    summary: asString(value.summary ?? value.rationale ?? 'Generated candidate', 'candidate.summary'),
    topology: normalizeTopologyModel(value.topology),
    score: normalizeScore(value.score),
    diagnostics: normalizeDiagnostics(value.diagnostics),
    metrics: normalizeMetrics(value.metrics),
  }
}

function normalizeISODate(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  const now = new Date().toISOString()
  if (value === undefined) return now
  throw new Error(`Expected ISO date string for ${fieldName}`)
}

function normalizeJobState(value: unknown): SynthesisJobState {
  if (typeof value === 'string' && JOB_STATES.includes(value as SynthesisJobState)) {
    return value as SynthesisJobState
  }
  return 'queued'
}

function normalizeJobStage(value: unknown): SynthesisJobStage {
  if (typeof value === 'string' && JOB_STAGES.includes(value as SynthesisJobStage)) {
    return value as SynthesisJobStage
  }
  return 'queued'
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function normalizeRejections(value: unknown): SynthesisCandidateRejection[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map((rejection) => ({
      candidate_id: asString(rejection.candidate_id ?? rejection.id ?? 'unknown', 'rejections[].candidate_id'),
      reason_code: asString(rejection.reason_code ?? rejection.code ?? 'unknown_reason', 'rejections[].reason_code'),
      reason_message: asString(
        rejection.reason_message ?? rejection.message ?? 'No reason provided',
        'rejections[].reason_message',
      ),
      diagnostics: normalizeDiagnostics(rejection.diagnostics),
    }))
}

function normalizeJobError(value: unknown): SynthesisJobError | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return {
    code: asString(value.code ?? 'runtime_error', 'error.code'),
    message: asString(value.message ?? 'Synthesis runtime error', 'error.message'),
    retriable: typeof value.retriable === 'boolean' ? value.retriable : false,
  }
}

export function parseSynthesisJobStatus(value: unknown): SynthesisJobStatus {
  if (!isRecord(value)) {
    throw new Error('Expected synthesis job status object')
  }

  return {
    job_id: asString(value.job_id, 'status.job_id'),
    goal: parseSynthesisGoal(value.goal),
    state: normalizeJobState(value.state),
    stage: normalizeJobStage(value.stage),
    progress: normalizeProgress(value.progress),
    created_at: normalizeISODate(value.created_at, 'status.created_at'),
    updated_at: normalizeISODate(value.updated_at, 'status.updated_at'),
    candidates: Array.isArray(value.candidates)
      ? value.candidates.map((candidate) => normalizeCandidate(candidate))
      : [],
    rejections: normalizeRejections(value.rejections),
    error: normalizeJobError(value.error),
  }
}

export function parseSynthesisGoal(value: unknown): SynthesisGoal {
  if (!isRecord(value)) {
    throw new Error('Expected synthesis goal object')
  }

  const prompt = asString(value.prompt ?? value.goal_prompt, 'goal.prompt')
  const objectives = normalizeObjectives(value.objectives ?? value.optimize_for)
  const constraints = normalizeConstraintSet(value.constraints)

  return {
    format_version: SYNTHESIS_GOAL_FORMAT_VERSION,
    prompt,
    objectives,
    constraints,
    candidate_count: asFiniteNumber(value.candidate_count ?? value.candidateCount, 'goal.candidate_count'),
    seed: asFiniteNumber(value.seed ?? value.random_seed, 'goal.seed'),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  }
}

export function parseSynthesisWorkerRequest(value: unknown): SynthesisWorkerRequest {
  if (!isRecord(value)) {
    throw new Error('Expected synthesis worker request object')
  }

  const type = asString(value.type, 'request.type')
  const requestId = asString(value.request_id, 'request.request_id')
  const contractVersion = asFiniteNumber(value.contract_version, 'request.contract_version')
  if (contractVersion !== SYNTHESIS_WORKER_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported worker contract version ${String(contractVersion)}. Expected ${SYNTHESIS_WORKER_CONTRACT_VERSION}`,
    )
  }

  if (type === 'synthesis.generate') {
    return {
      type,
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: requestId,
      goal: parseSynthesisGoal(value.goal),
    }
  }

  if (type === 'synthesis.cancel') {
    return {
      type,
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: requestId,
      job_id: asString(value.job_id, 'request.job_id'),
    }
  }

  throw new Error(`Unsupported synthesis worker request type: ${type}`)
}

export function parseSynthesisWorkerResponse(value: unknown): SynthesisWorkerResponse {
  if (!isRecord(value)) {
    throw new Error('Expected synthesis worker response object')
  }

  const type = asString(value.type, 'response.type')
  const requestId = asString(value.request_id, 'response.request_id')
  const contractVersion = asFiniteNumber(value.contract_version, 'response.contract_version')

  if (contractVersion !== SYNTHESIS_WORKER_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported worker contract version ${String(contractVersion)}. Expected ${SYNTHESIS_WORKER_CONTRACT_VERSION}`,
    )
  }

  if (type === 'synthesis.progress' || type === 'synthesis.result') {
    return {
      type,
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: requestId,
      status: parseSynthesisJobStatus(value.status),
    }
  }

  if (type === 'synthesis.error') {
    return {
      type,
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: requestId,
      code: asString(value.code, 'response.code'),
      message: asString(value.message, 'response.message'),
    }
  }

  throw new Error(`Unsupported synthesis worker response type: ${type}`)
}

export function parsePersistedSynthesisCandidateRecord(
  value: unknown,
): PersistedSynthesisCandidateRecord {
  if (!isRecord(value)) {
    throw new Error('Expected persisted synthesis candidate record object')
  }

  const schemaVersion =
    asFiniteNumber(value.schema_version ?? value.schemaVersion, 'record.schema_version') ??
    SYNTHESIS_PERSISTED_RECORD_VERSION

  if (schemaVersion > SYNTHESIS_PERSISTED_RECORD_VERSION) {
    throw new Error(`Unsupported persisted record schema_version: ${schemaVersion}`)
  }

  const goalPayload = value.goal ?? {
    prompt: value.goal_prompt,
    objectives: value.objectives ?? value.optimize_for,
    constraints: value.constraints,
  }

  const candidatesPayload = value.candidates ?? value.results
  if (!Array.isArray(candidatesPayload)) {
    throw new Error('Expected record.candidates as array')
  }

  return {
    schema_version: SYNTHESIS_PERSISTED_RECORD_VERSION,
    saved_at: normalizeISODate(value.saved_at ?? value.savedAt ?? value.created_at, 'record.saved_at'),
    goal: parseSynthesisGoal(goalPayload),
    candidates: candidatesPayload.map((candidate) => normalizeCandidate(candidate)),
  }
}

export function createPersistedSynthesisCandidateRecord(
  goal: SynthesisGoal,
  candidates: SynthesisCandidate[],
  savedAt: string = new Date().toISOString(),
): PersistedSynthesisCandidateRecord {
  return {
    schema_version: SYNTHESIS_PERSISTED_RECORD_VERSION,
    saved_at: savedAt,
    goal,
    candidates,
  }
}
