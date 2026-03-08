## Handoff Prompt: Task 12.5 AI Endpoint Contract

Continue from current `main` and define the AI inference contract for shorthand generation.

### Objective
Establish a single request/response contract: prompt + image input(s) -> shorthand output, with post-processing and fallback behavior.

### Required Scope
1. Define pydantic (or equivalent typed) request/response models for inference.
2. Implement post-processing chain: parse shorthand -> validate topology -> solve.
3. Add fallback path for invalid model output with actionable diagnostics while keeping editor editable.
4. Document contract and error taxonomy for frontend integration.

### Tests And Validation
1. Add tests for valid output flow and invalid output fallback flow.
2. Add contract serialization tests for API boundary models.
3. Run focused tests and report command output summaries.

### Constraints
1. Keep AI orchestration in AI layer; core remains deterministic oracle.
2. Do not bypass parser/validator/solver safety chain.
3. Ensure deterministic error payload structure for UI consumption.

### Completion Requirements
1. Update `PLAN.md` Task 12.5 status.
2. Commit with Conventional Commit message.
3. Return files changed, tests, and blockers.
