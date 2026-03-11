import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SynthesisGoal, SynthesisJobStatus } from '../../types/synthesis'
import { SYNTHESIS_WORKER_CONTRACT_VERSION } from '../synthesis/contracts'
import { createSynthesisJobStore } from '../synthesis/jobStore'
import { SynthesisRuntime, type WorkerLike } from '../synthesis/runtime'

class FakeWorker implements WorkerLike {
  readonly postedMessages: unknown[] = []
  private readonly listeners = {
    message: new Set<EventListener>(),
    error: new Set<EventListener>(),
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message)
  }

  addEventListener(type: 'message' | 'error', listener: EventListener): void {
    this.listeners[type].add(listener)
  }

  removeEventListener(type: 'message' | 'error', listener: EventListener): void {
    this.listeners[type].delete(listener)
  }

  terminate(): void {
    // no-op for tests
  }

  emitMessage(data: unknown): void {
    const event = { data } as MessageEvent
    for (const listener of this.listeners.message) {
      listener(event)
    }
  }

  emitError(message: string): void {
    const event = { message } as ErrorEvent
    for (const listener of this.listeners.error) {
      listener(event)
    }
  }
}

function buildGoal(): SynthesisGoal {
  return {
    format_version: 'synthesis-goal-v1',
    prompt: 'test spinner',
    objectives: ['stability'],
    constraints: {
      max_parts: 20,
    },
    seed: 7,
  }
}

function buildStatus(overrides: Partial<SynthesisJobStatus>): SynthesisJobStatus {
  const now = '2026-03-10T00:00:00.000Z'
  return {
    job_id: 'job-req-1',
    goal: buildGoal(),
    state: 'running',
    stage: 'generating',
    progress: 0.1,
    created_at: now,
    updated_at: now,
    candidates: [],
    rejections: [],
    ...overrides,
  }
}

function getGenerateRequest(worker: FakeWorker): { request_id: string } {
  const message = worker.postedMessages[0] as Record<string, unknown>
  return { request_id: String(message.request_id) }
}

describe('synthesis runtime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('processes worker progress and completion lifecycle', async () => {
    const worker = new FakeWorker()
    const runtime = new SynthesisRuntime({
      workerFactory: () => worker,
      jobStore: createSynthesisJobStore({ enableIndexedDb: false, indexedDb: null }),
    })
    const onProgress = vi.fn()

    const jobPromise = runtime.startJob(buildGoal(), { onProgress })
    const { request_id } = getGenerateRequest(worker)

    worker.emitMessage({
      type: 'synthesis.progress',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: buildStatus({ job_id: `job-${request_id}`, stage: 'validating', progress: 0.5 }),
    })

    worker.emitMessage({
      type: 'synthesis.result',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: buildStatus({
        job_id: `job-${request_id}`,
        state: 'complete',
        stage: 'complete',
        progress: 1,
      }),
    })

    const status = await jobPromise
    expect(status.state).toBe('complete')
    expect(onProgress).toHaveBeenCalledTimes(1)

    const cached = await runtime.getCachedJob(status.job_id)
    expect(cached?.job_id).toBe(status.job_id)

    runtime.dispose()
  })

  it('sends cancel requests by job id and resolves cancelled result', async () => {
    const worker = new FakeWorker()
    const runtime = new SynthesisRuntime({
      workerFactory: () => worker,
      jobStore: createSynthesisJobStore({ enableIndexedDb: false, indexedDb: null }),
    })

    const jobPromise = runtime.startJob(buildGoal())
    const { request_id } = getGenerateRequest(worker)

    const running = buildStatus({ job_id: `job-${request_id}`, stage: 'scoring', progress: 0.75 })
    worker.emitMessage({
      type: 'synthesis.progress',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: running,
    })

    runtime.cancelJob(running.job_id)

    const cancelMessage = worker.postedMessages[1] as Record<string, unknown>
    expect(cancelMessage.type).toBe('synthesis.cancel')
    expect(cancelMessage.job_id).toBe(running.job_id)

    worker.emitMessage({
      type: 'synthesis.result',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: buildStatus({
        job_id: running.job_id,
        state: 'cancelled',
        stage: 'cancelled',
        progress: 0.75,
      }),
    })

    const status = await jobPromise
    expect(status.state).toBe('cancelled')

    runtime.dispose()
  })

  it('rejects timed out jobs and dispatches cancel when job id is known', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const runtime = new SynthesisRuntime({
      workerFactory: () => worker,
      jobStore: createSynthesisJobStore({ enableIndexedDb: false, indexedDb: null }),
      requestTimeoutMs: 50,
    })

    const jobPromise = runtime.startJob(buildGoal(), { timeoutMs: 50 })
    const { request_id } = getGenerateRequest(worker)

    worker.emitMessage({
      type: 'synthesis.progress',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: buildStatus({ job_id: `job-${request_id}` }),
    })

    const timeoutExpectation = expect(jobPromise).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(51)

    await timeoutExpectation
    const cancelMessage = worker.postedMessages[1] as Record<string, unknown>
    expect(cancelMessage.type).toBe('synthesis.cancel')
    expect(cancelMessage.job_id).toBe(`job-${request_id}`)

    runtime.dispose()
  })

  it('rejects request when worker emits synthesis.error', async () => {
    const worker = new FakeWorker()
    const runtime = new SynthesisRuntime({
      workerFactory: () => worker,
      jobStore: createSynthesisJobStore({ enableIndexedDb: false, indexedDb: null }),
    })

    const jobPromise = runtime.startJob(buildGoal())
    const { request_id } = getGenerateRequest(worker)

    worker.emitMessage({
      type: 'synthesis.error',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      code: 'invalid_graph',
      message: 'Candidate graph is invalid',
    })

    await expect(jobPromise).rejects.toThrow(/invalid_graph/i)
    runtime.dispose()
  })

  it('handles abort signals and sends cancel when progress already provided job id', async () => {
    const worker = new FakeWorker()
    const runtime = new SynthesisRuntime({
      workerFactory: () => worker,
      jobStore: createSynthesisJobStore({ enableIndexedDb: false, indexedDb: null }),
    })

    const controller = new AbortController()
    const jobPromise = runtime.startJob(buildGoal(), { signal: controller.signal })
    const { request_id } = getGenerateRequest(worker)

    worker.emitMessage({
      type: 'synthesis.progress',
      contract_version: SYNTHESIS_WORKER_CONTRACT_VERSION,
      request_id,
      status: buildStatus({ job_id: `job-${request_id}` }),
    })

    controller.abort()

    await expect(jobPromise).rejects.toThrow(/aborted by caller/i)
    const cancelMessage = worker.postedMessages[1] as Record<string, unknown>
    expect(cancelMessage.type).toBe('synthesis.cancel')
    expect(cancelMessage.job_id).toBe(`job-${request_id}`)

    runtime.dispose()
  })
})
