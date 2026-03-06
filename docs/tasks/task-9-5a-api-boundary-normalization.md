## Handoff Prompt: Rod-Side Rollout - API Boundary Normalization

Continue from current `main` and complete API-side canonicalization for legacy rod-side ports.

### Objective
Ensure all API request payloads that ingest connections accept legacy `center_tangent` but normalize to canonical `center_tangent_y_pos` before any `Connection` model construction or graph insertion.

### Required Scope
1. Audit `src/core/api.py` for every endpoint/path that accepts connection payloads.
2. Add or finalize centralized helpers for legacy port normalization.
3. Apply canonicalization at payload-boundary points before `Connection(**...)` construction.
4. Keep explicit rod-side IDs (`center_tangent_y_pos`, `center_tangent_y_neg`, `center_tangent_z_pos`, `center_tangent_z_neg`) untouched.

### Constraints
1. Preserve backward compatibility for legacy snapshots and clients.
2. Do not alter snapping math, physics tuning, or topology semantics in this task.
3. Avoid touching unrelated API behaviors.

### Tests And Validation
1. Run focused API tests for touched endpoints:
   - `.\\.venv\\Scripts\\python.exe -m pytest src/core/tests/test_api.py -k "center_tangent or stability or export or diagnostics"`
2. Run full core tests if environment allows:
   - `.\\.venv\\Scripts\\python.exe -m pytest src/core/tests/ --cov`
3. If blocked, report exact command and error.

### Completion Requirements
1. Update `PLAN.md` with a concise status note for this normalization step.
2. Commit with a Conventional Commit message.
3. Return changed files, normalized endpoints, and test outcomes.
