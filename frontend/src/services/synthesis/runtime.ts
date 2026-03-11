import type { SynthesisGoal, SynthesisJobStatus } from '../../types/synthesis'
import {
  SYNTHESIS_WORKER_CONTRACT_VERSION,
  parseSynthesisGoal,
  parseSynthesisWorkerResponse,
} from './contracts'
import { createSynthesisJobStore, type SynthesisJobStore } from './jobStore'

export interface SynthesisRuntimeOptions {
  workerFactory?: () => WorkerLike
  jobStore?: SynthesisJobStore
  requestTimeoutMs?: number
}

export interface StartSynthesisJobOptions {
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (status: SynthesisJobStatus) => void
}

export interface WorkerLike {
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message' | 'error', listener: EventListener) => void
  removeEventListener: (type: 'message' | 'error', listener: EventListener) => void
  terminate: () => void
}

interface PendingRequest {
  resolve: (status: SynthesisJobStatus) => void
  reject: (error: Error) => void
  onProgress?: (status: SynthesisJobStatus) => void
  timeoutHandle?: ReturnType<typeof setTimeout>
  abortCleanup?: () => void
  jobId?: string
}

const DEFAULT_TIMEOUT_MS = 30_000

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createWorker(): WorkerLike {
  return new Worker(new URL('../../workers/synthesisWorker.ts', import.meta.url), {
    type: 'module',
  })
}

export class SynthesisRuntime {
  private readonly worker: WorkerLike
  private readonly jobStore: SynthesisJobStore
  private readonly defaultTimeoutMs: number
  private readonly pendingByRequest = new Map<string, PendingRequest>()
  private readonly messageListener: EventListener
  private readonly errorListener: EventListener

  constructor(options: SynthesisRuntimeOptions = {}) {
    this.worker = (options.workerFactory ?? createWorker)()
    this.jobStore = options.jobStore ?? createSynthesisJobStore()
    this.defaultTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.messageListener = this.handleMessage.bind(this) as EventListener
    this.errorListener = this.handleError.bind(this) as EventListener

    this.worker.addEventListener('message', this.messageListener)
    this.worker.addEventListener('error', this.errorListener)
  }

  async startJob(goalInput: SynthesisGoal, options: StartSynthesisJobOptions = {}): Promise<SynthesisJobStatus> {
    const goal = parseSynthesisGoal(goalInput)
    const requestId = createRequestId()
    const timeoutMs = options.timeoutMs ?? goal.constraints.max_generation_time_ms ?? this.defaultTimeoutMs

    return new Promise<SynthesisJobStatus>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new Error('Synthesis request aborted before start'))
        return
      }

      const pending: PendingRequest = {
        resolve,
        reject,
        onProgress: options.onProgress,
      }

      pending.timeoutHandle = setTimeout(() => {
        this.handleTimeout(requestId, timeoutMs)
      }, timeoutMs)

      if (options.signal) {
        const onAbort = () => {
          this.cancelPendingRequest(requestId, 'Synthesis request aborted by caller')
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
        pending.abortCleanup = () => options.signal?.removeEventListener('abort', onAbort)
      }

      this.pendingByRequest.set(requestId, pending)

      this.worker.postMessage({
        type: 'synthesis.generate',
        contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
        request_id: requestId,
        goal,
      })
    })
  }

  cancelJob(jobId: string): void {
    this.worker.postMessage({
      type: 'synthesis.cancel',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id: createRequestId(),
      job_id: jobId,
    })
  }

  async getCachedJob(jobId: string): Promise<SynthesisJobStatus | null> {
    return this.jobStore.get(jobId)
  }

  async listCachedJobs(): Promise<SynthesisJobStatus[]> {
    return this.jobStore.list()
  }

  dispose(): void {
    this.worker.removeEventListener('message', this.messageListener)
    this.worker.removeEventListener('error', this.errorListener)
    this.worker.terminate()

    for (const [requestId, pending] of this.pendingByRequest.entries()) {
      this.cleanupPending(requestId)
      pending.reject(new Error('Synthesis runtime disposed while request was pending'))
    }
    this.pendingByRequest.clear()
  }

  private handleMessage(event: Event): void {
    const messageEvent = event as MessageEvent<unknown>
    let response
    try {
      response = parseSynthesisWorkerResponse(messageEvent.data)
    } catch {
      return
    }

    if (response.type === 'synthesis.error') {
      const pending = this.pendingByRequest.get(response.request_id)
      if (!pending) return

      this.cleanupPending(response.request_id)
      pending.reject(new Error(`[${response.code}] ${response.message}`))
      return
    }

    const pending = this.pendingByRequest.get(response.request_id)
    const status = response.status

    void this.jobStore.save(status)

    if (!pending) {
      return
    }

    pending.jobId = status.job_id

    if (response.type === 'synthesis.progress') {
      pending.onProgress?.(status)
      return
    }

    this.cleanupPending(response.request_id)

    if (status.state === 'failed') {
      const message = status.error?.message ?? 'Synthesis worker reported failure'
      pending.reject(new Error(message))
      return
    }

    pending.resolve(status)
  }

  private handleError(event: Event): void {
    const errorEvent = event as ErrorEvent
    for (const [requestId, pending] of this.pendingByRequest.entries()) {
      this.cleanupPending(requestId)
      pending.reject(new Error(errorEvent.message || 'Synthesis worker runtime error'))
    }
    this.pendingByRequest.clear()
  }

  private handleTimeout(requestId: string, timeoutMs: number): void {
    const pending = this.pendingByRequest.get(requestId)
    if (!pending) return

    if (pending.jobId) {
      this.cancelJob(pending.jobId)
    }

    this.cleanupPending(requestId)
    pending.reject(new Error(`Synthesis request timed out after ${timeoutMs}ms`))
  }

  private cancelPendingRequest(requestId: string, reason: string): void {
    const pending = this.pendingByRequest.get(requestId)
    if (!pending) return

    if (pending.jobId) {
      this.cancelJob(pending.jobId)
    }

    this.cleanupPending(requestId)
    pending.reject(new Error(reason))
  }

  private cleanupPending(requestId: string): void {
    const pending = this.pendingByRequest.get(requestId)
    if (!pending) return

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle)
    }
    pending.abortCleanup?.()
    this.pendingByRequest.delete(requestId)
  }
}

let runtimeSingleton: SynthesisRuntime | null = null

export function getSynthesisRuntime(): SynthesisRuntime {
  if (!runtimeSingleton) {
    runtimeSingleton = new SynthesisRuntime()
  }
  return runtimeSingleton
}
