## Handoff Prompt: Task 12.4 Cross-Format Import Export Sync

Continue from current `main` and implement stable conversion paths across `.knx`, `topology-v1`, and shorthand.

### Objective
Add import/export and synchronization flows so all supported representations can round-trip with stable IDs and ports.

### Required Scope
1. Add BuildMenu flows for shorthand and topology import/export.
2. Implement explicit conversions:
   - `.knx` -> `topology-v1`
   - shorthand <-> `topology-v1`
   - shorthand/topology -> solved scene
3. Preserve stable alias/instance/port mapping through conversions.
4. Add user-facing diagnostics for conversion failures.

### Tests And Validation
1. Add conversion round-trip tests and mapping regressions.
2. Cover legacy port normalization interactions in conversion boundaries.
3. Run targeted core/frontend suites and report outcomes.

### Constraints
1. Do not regress existing `.knx` import/export behavior.
2. Keep canonicalization deterministic across formats.
3. Keep conversion helpers isolated and testable.

### Completion Requirements
1. Update `PLAN.md` Task 12.4 status.
2. Commit with Conventional Commit message.
3. Return files changed, tests, and blockers.
