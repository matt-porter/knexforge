## Handoff Prompt: Task 11.1 Topology-V1 Schema

Continue from current `main` and complete the formal topology schema artifacts.

### Objective
Finish `topology-v1` specification as docs + JSON Schema, aligned with existing browser-first contract implementation.

### Current Status
TypeScript contract exists in `frontend/src/services/topologySolver.ts`; formal schema docs and schema file are still pending.

### Required Scope
1. Create `docs/topology-format.md` with required fields, constraints, and examples.
2. Add JSON Schema under `schema/` for `topology-v1` including forbidden transform fields.
3. Define joint type enum, ID/port format rules, and metadata shape.
4. Add migration notes between `.knx` and `topology-v1`.

### Tests And Validation
1. Add schema validation tests (valid and invalid payload fixtures).
2. Ensure schema aligns with existing runtime validator expectations.
3. Run relevant tests and report exact commands/results.

### Constraints
1. Keep format position-agnostic (no absolute transforms in topology schema).
2. Preserve backward compatibility guidance for existing flows.
3. Avoid changing solver behavior unless needed for schema parity and tested.

### Completion Requirements
1. Update `PLAN.md` from `[~]` to completed when done.
2. Commit with Conventional Commit message.
3. Return doc/schema files changed and validation evidence.
