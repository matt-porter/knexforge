## Handoff Prompt: Task 4.6 End-To-End Validation Pipeline

Continue from current `main` and harden final scan-to-build validation.

### Objective
Extend `ai/scan-to-build/validator.py` and `src/core/tests/test_scan_to_build.py` so reconstructed outputs are valid `.knx` builds with actionable ambiguity reporting.

### Required Scope
1. Validate reconstructed parts/connections against schema and core constraints.
2. Add ambiguity flags for uncertain connections requiring manual review.
3. Define pass/fail thresholds and structured validation result model.
4. Ensure exported/reconstructed output can be consumed by import pipeline.

### Tests And Validation
1. Add pytest coverage for valid graph, malformed graph, and ambiguous graph scenarios.
2. Add at least one end-to-end fixture test from detections to validated output.
3. Run focused core tests for scan-to-build validation.

### Constraints
1. Keep validation deterministic and explainable.
2. Do not silently drop invalid edges without diagnostics.
3. Maintain compatibility with current `.knx` schema/version handling.

### Completion Requirements
1. Update `PLAN.md` status.
2. Commit with Conventional Commit message.
3. Return changed files, commands/results, and blockers.
