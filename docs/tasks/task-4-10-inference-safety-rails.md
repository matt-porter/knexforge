## Handoff Prompt: Task 4.10 Inference Safety Rails

Continue from current `main` and harden inference post-processing before rendering AI output.

### Objective
Ensure all AI shorthand outputs pass parser, topology validator, and solver gates before scene rendering, with clear recovery guidance on failure.

### Required Scope
1. Enforce parser -> validator -> solver pipeline on every inference output.
2. Return actionable errors when invalid output is produced.
3. Add partial-recovery suggestions (for example, keep editable text and highlight failing edges).
4. Integrate safety rails into existing inference UI/API path.

### Tests And Validation
1. Add regression tests for malformed and near-valid shorthand generations.
2. Add tests proving invalid output cannot bypass checks into rendering.
3. Run targeted test suites and report outcomes.

### Constraints
1. Never render unchecked AI output directly.
2. Keep fallback UX non-destructive and transparent.
3. Preserve deterministic validation diagnostics.

### Completion Requirements
1. Update `PLAN.md` Task 4.10 status.
2. Commit with Conventional Commit message.
3. Return changed files, tests run, and blockers.
