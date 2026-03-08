## Handoff Prompt: Task 4.4 Connection Graph Reconstruction

Continue from current `main` and implement connection graph inference from estimated 3D poses.

### Objective
Complete `ai/scan-to-build/graph_reconstructor.py` so detected parts are converted into a valid connection graph aligned with core snapping constraints.

### Required Scope
1. Infer candidate port-to-port matches based on distance/orientation constraints.
2. Score and select valid edges while preventing duplicates and impossible connections.
3. Validate inferred edges against core snapping rules and part definitions.
4. Return structured ambiguity diagnostics for uncertain edges.

### Tests And Validation
1. Add unit tests for valid reconstruction, ambiguous cases, and invalid-edge rejection.
2. Add regression fixture(s) covering rods with side-clip semantics where relevant.
3. Run focused graph reconstructor tests and report outcomes.

### Constraints
1. Keep behavior data-driven from part schema and port metadata.
2. Do not bypass validator by writing raw graph edges without checks.
3. Preserve deterministic ordering for reproducible outputs.

### Completion Requirements
1. Update `PLAN.md` task status.
2. Commit with Conventional Commit message.
3. Return files changed, tests, and blockers.
