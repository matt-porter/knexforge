## Task 15.2: Web Worker Runtime and Async Job Lifecycle

**Phase**: 15 — Goal-Driven Mechanism Synthesizer (Physics-Validated AI Design)
**Depends on**: Task 15.1
**Blocked by**: None
**Estimated effort**: 4–8 hours

---

### Problem Statement

Phase 15 requires synthesis jobs to run asynchronously without blocking UI interaction. The browser runtime needs a clear worker protocol, robust lifecycle transitions, cancellation, timeout behavior, and persistence so users can recover/review in-flight and completed jobs.

---

### Objectives

1. Implement worker-based synthesis lifecycle messaging (`queued` → `generating` → `validating` → `scoring` → `ranking` → terminal).
2. Add runtime orchestration in the app thread with request tracking, timeout handling, and abort-driven cancellation.
3. Add hybrid persistence (`Map` in memory + IndexedDB best-effort) for job status snapshots.
4. Add regression tests for worker bridge behavior and lifecycle edge-cases.

---

### Delivered Components

- Worker entry: `frontend/src/workers/synthesisWorker.ts`
- Runtime orchestrator: `frontend/src/services/synthesis/runtime.ts`
- Persistence service: `frontend/src/services/synthesis/jobStore.ts`
- Tests: `frontend/src/services/__tests__/synthesisRuntime.test.ts`

---

### Runtime Rules

1. Requests/responses must match `SYNTHESIS_WORKER_CONTRACT_VERSION`.
2. Runtime should reject on `synthesis.error` or terminal `failed` status.
3. Runtime should resolve with terminal `complete`/`cancelled` statuses.
4. Timeout and caller abort should send a cancel request when job ID is known.
5. Job snapshots should be written to memory immediately, then IndexedDB best-effort.

---

### Validation

Run:

- `cd frontend && npm run type-check`
- `cd frontend && npm run test -- src/services/__tests__/synthesisRuntime.test.ts`

Optional full checks:

- `python -m pytest src/core/tests/`
- `cd frontend && npm run test`

---

### Completion Criteria

- [ ] Worker lifecycle and message handling implemented.
- [ ] Runtime supports start, progress, cancel, timeout, and abort.
- [ ] In-memory + IndexedDB persistence is implemented with graceful fallback.
- [ ] Comprehensive async lifecycle and worker-bridge regression tests pass.
- [ ] `PLAN.md` updated with Task 15.2 status and blockers (if any).
- [ ] Changes committed with Conventional Commit and pushed.
