## Handoff Prompt: Task 12.2 Shorthand Lint And Auto-Fix

Continue from current `main` and add shorthand quality tooling.

### Objective
Implement canonical formatting, lint checks, and CLI validation utilities for shorthand authoring workflows.

### Required Scope
1. Add formatter for stable whitespace/order and canonical edge formatting.
2. Add lints for missing ports, unsupported aliases, disconnected fragments, and duplicate edges.
3. Provide CLI entrypoint (`python -m ...`) for lint/format in CI and local workflows.
4. Emit machine-readable diagnostics for editor and automation integration.

### Tests And Validation
1. Add pytest coverage for formatter idempotence and lint rule correctness.
2. Add CLI tests for exit codes and output formats.
3. Run focused tests and example CLI commands.

### Constraints
1. Keep formatter deterministic and non-destructive.
2. Separate lint warnings from hard parse/validation errors.
3. Preserve compatibility with Task 12.1 parser output contract.

### Completion Requirements
1. Update `PLAN.md` Task 12.2 status.
2. Commit with Conventional Commit message.
3. Return files changed, commands run, and blockers.
