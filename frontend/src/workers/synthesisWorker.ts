/// <reference lib="webworker" />

import type { SynthesisGoal, SynthesisJobStatus } from '../types/synthesis'
import {
  SYNTHESIS_WORKER_CONTRACT_VERSION,
  parseSynthesisWorkerRequest,
} from '../services/synthesis/contracts'

interface ActiveJob {
  requestId: string
  status: SynthesisJobStatus
  timers: Array<ReturnType<typeof setTimeout>>
  timeoutTimer?: ReturnType<typeof setTimeout>
  cancelled: boolean
  done: boolean
}

const workerScope = self as DedicatedWorkerGlobalScope

const jobsById = new Map<string, ActiveJob>()

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function seededDelayMs(goal: SynthesisGoal): number {
  const seedBase = goal.seed ?? hashString(goal.prompt)
  return 20 + (seedBase % 10)
}

function buildJobId(requestId: string): string {
  return `job-${requestId}`
}

function postProgress(requestId: string, status: SynthesisJobStatus): void {
  workerScope.postMessage({
    type: 'synthesis.progress',
    contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
    request_id: requestId,
    status,
  })
}

function postResult(requestId: string, status: SynthesisJobStatus): void {
  workerScope.postMessage({
    type: 'synthesis.result',
    contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
    request_id: requestId,
    status,
  })
}

function postError(requestId: string, code: string, message: string): void {
  workerScope.postMessage({
    type: 'synthesis.error',
    contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
    request_id: requestId,
    code,
    message,
  })
}

function setStatus(job: ActiveJob, patch: Partial<SynthesisJobStatus>): void {
  job.status = {
    ...job.status,
    ...patch,
    updated_at: new Date().toISOString(),
  }
}

function clearTimers(job: ActiveJob): void {
  for (const timer of job.timers) {
    clearTimeout(timer)
  }
  job.timers = []
  if (job.timeoutTimer) {
    clearTimeout(job.timeoutTimer)
    job.timeoutTimer = undefined
  }
}

function finalizeJob(job: ActiveJob): void {
  if (job.done) return
  job.done = true
  clearTimers(job)
  jobsById.delete(job.status.job_id)
}

function waitForStep(job: ActiveJob, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve()
    }, delayMs)
    job.timers.push(timer)
  })
}

async function runLifecycle(job: ActiveJob): Promise<void> {
  const delay = seededDelayMs(job.status.goal)
  const steps: Array<{ stage: SynthesisJobStatus['stage']; progress: number }> = [
    { stage: 'generating', progress: 0.25 },
    { stage: 'validating', progress: 0.5 },
    { stage: 'scoring', progress: 0.75 },
    { stage: 'ranking', progress: 0.9 },
  ]

  for (const step of steps) {
    if (job.cancelled || job.done) {
      return
    }
    setStatus(job, {
      state: 'running',
      stage: step.stage,
      progress: step.progress,
    })
    postProgress(job.requestId, job.status)
    await waitForStep(job, delay)
  }

  if (job.cancelled || job.done) {
    return
  }

  setStatus(job, {
    state: 'complete',
    stage: 'complete',
    progress: 1,
    candidates: [],
    rejections: [],
  })
  postResult(job.requestId, job.status)
  finalizeJob(job)
}

function cancelActiveJob(job: ActiveJob, reasonMessage: string): void {
  if (job.done) return

  job.cancelled = true
  setStatus(job, {
    state: 'cancelled',
    stage: 'cancelled',
    error: {
      code: 'cancelled',
      message: reasonMessage,
      retriable: true,
    },
  })
  postResult(job.requestId, job.status)
  finalizeJob(job)
}

function failActiveJob(job: ActiveJob, code: string, message: string): void {
  if (job.done) return

  setStatus(job, {
    state: 'failed',
    stage: 'failed',
    error: {
      code,
      message,
      retriable: true,
    },
  })
  postResult(job.requestId, job.status)
  finalizeJob(job)
}

function startJob(requestId: string, goal: SynthesisGoal): void {
  const now = new Date().toISOString()
  const jobId = buildJobId(requestId)

  const job: ActiveJob = {
    requestId,
    status: {
      job_id: jobId,
      goal,
      state: 'queued',
      stage: 'queued',
      progress: 0,
      created_at: now,
      updated_at: now,
      candidates: [],
      rejections: [],
    },
    timers: [],
    cancelled: false,
    done: false,
  }

  jobsById.set(jobId, job)
  postProgress(requestId, job.status)

  const timeoutMs = goal.constraints.max_generation_time_ms ?? 30_000
  job.timeoutTimer = setTimeout(() => {
    failActiveJob(job, 'worker_timeout', `Synthesis worker exceeded ${timeoutMs}ms budget`)
  }, timeoutMs)

  runLifecycle(job).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    failActiveJob(job, 'worker_exception', message)
  })
}

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
  let request
  try {
    request = parseSynthesisWorkerRequest(event.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    postError('unknown', 'invalid_request', message)
    return
  }

  if (request.type === 'synthesis.generate') {
    startJob(request.request_id, request.goal)
    return
  }

  const active = jobsById.get(request.job_id)
  if (!active) {
    postError(request.request_id, 'job_not_found', `No active synthesis job found for ${request.job_id}`)
    return
  }

  cancelActiveJob(active, 'Synthesis job cancelled by request')
})

export {}
