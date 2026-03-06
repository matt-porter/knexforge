## Handoff Prompt: Rod-Side Rollout - API Regression Tests

Continue from current `main` and add robust API regression coverage for legacy rod-side payloads.

### Objective
Extend `src/core/tests/test_api.py` so legacy `center_tangent` payloads are explicitly tested and verified to behave as canonical `center_tangent_y_pos` across API endpoints.

### Required Scope
1. Add regression tests for each API endpoint that ingests `connections` payloads.
2. Verify legacy `center_tangent` is accepted and normalized in endpoint processing.
3. Verify explicit rod-side ports pass through unchanged.
4. Assert response or exported payloads use canonical IDs where relevant.

### Suggested Test Cases
1. `stability` endpoint with legacy input.
2. `export` endpoint with legacy input and canonicalized output.
3. Diagnostics endpoint with legacy input.
4. Explicit side-port payload acceptance (`_y_pos/_y_neg/_z_pos/_z_neg`).

### Constraints
1. Keep tests deterministic and narrowly scoped.
2. Do not duplicate existing coverage unless adding new assertion value.
3. Do not modify production behavior in this test-only task unless required to unflake tests.

### Tests And Validation
1. Run API test module:
   - `.\\.venv\\Scripts\\python.exe -m pytest src/core/tests/test_api.py`
2. Run targeted legacy subset:
   - `.\\.venv\\Scripts\\python.exe -m pytest src/core/tests/test_api.py -k "center_tangent or rod_side"`

### Completion Requirements
1. Update `PLAN.md` with concise test-coverage completion note.
2. Commit with Conventional Commit message.
3. Return new test names, assertions added, and results.
