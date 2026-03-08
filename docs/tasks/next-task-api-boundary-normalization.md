## Handoff Prompt: API Boundary Legacy Port Normalization

Continue the rod-side snapping rollout from current `main`.

### Objective
Normalize legacy `center_tangent` rod-side references at API/service boundaries so all inbound payloads are canonicalized to `center_tangent_y_pos` before `Connection` creation.

### Why This Is Next
Legacy normalization is already implemented in frontend store/topology and core import/deserialization paths. API request handlers may still accept and pass through raw legacy IDs, which can create inconsistent behavior.

### Required Scope
1. Add a centralized normalization helper in `src/core/api.py`.
2. Apply normalization in all endpoints that reconstruct connections from request payloads, especially:
   - `/stability`
   - `/export`
   - diagnostics endpoints that ingest `connections`
3. Ensure canonicalization happens before any `Connection(**...)` construction and graph edge insertion.
4. Preserve backward compatibility: accept `center_tangent`, persist/compute using `center_tangent_y_pos`.

### Tests
1. Update/add API regressions in `src/core/tests/test_api.py`:
   - Post payload(s) with legacy `center_tangent`.
   - Assert endpoint success and canonical behavior (no failure from legacy ID).
2. Add any narrowly scoped tests only if needed in related core test files.

### Constraints
1. Do not change snapping math or remove legacy alias support.
2. Do not revert unrelated changes in the worktree.
3. Follow AGENTS.md requirements (including PLAN updates and conventional commits).

### Validation Commands
1. Frontend sanity checks:
   - `cd frontend && npm run type-check`
   - `cd frontend && npm run test -- src/helpers/portGrouping.test.ts src/helpers/portIndicatorSim.test.ts src/helpers/rodSideOrdering.test.ts src/helpers/rodSideGrouping.test.ts src/stores/tabCycling.test.ts src/stores/interactionStore.test.ts src/stores/buildStore.test.ts src/services/__tests__/topologySolver.test.ts src/services/__tests__/rapierSimulator.test.ts`
2. Core checks (preferred):
   - `.\.venv\Scripts\python.exe -m pytest src/core/tests/ --cov`
3. If blocked by missing deps/tools, report exact command + error.

### Completion Requirements
1. Update `PLAN.md` with a concise status line for this API normalization step.
2. Commit with Conventional Commit format.
3. Return summary including:
   - files changed
   - normalization behavior implemented
   - tests run + outcomes
   - blockers (if any)
