## Handoff Prompt: Task 11.6 Round-Trip Compatibility Tests

Continue from current `main` and implement full compatibility coverage for topology conversions.

### Objective
Add robust round-trip tests for `.knx` and `topology-v1` conversion/solve flows.

### Required Scope
1. Build fixture set covering simple, branched, and loop-heavy models.
2. Add round-trip checks: `.knx` -> `topology-v1` -> solved build -> `.knx`.
3. Assert piece counts, connection equivalence, and transform drift tolerance.
4. Include migration compatibility checks for legacy cases.

### Tests And Validation
1. Add focused tests in core/frontend depending on where conversion utilities live.
2. Ensure deterministic output ordering where expected.
3. Run targeted pytest/vitest suites and report outcomes.

### Constraints
1. Keep solver tolerance assumptions explicit and documented.
2. Avoid flaky assertions tied to non-deterministic ordering.
3. Preserve existing import/export behavior for non-topology users.

### Completion Requirements
1. Update `PLAN.md` Task 11.6 status.
2. Commit with Conventional Commit message.
3. Return files changed, fixtures added, and test results.
