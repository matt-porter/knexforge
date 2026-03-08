## Handoff Prompt: Task 4.8 Training Recipe And Reproducibility

Continue from current `main` and formalize reproducible MLX LoRA training guidance.

### Objective
Document baseline training recipe and reproducibility policy in `ai/scan-to-build/README.md`.

### Required Scope
1. Define baseline config (base model, batch size, iterations, prompt template).
2. Define run metadata capture (seed, adapter path, metrics, checkpoint snapshot).
3. Define dataset split policy and leakage checks.
4. Add repeatability checklist for rerunning baseline experiments.

### Tests And Validation
1. Validate documented command examples against current scripts.
2. Add minimal reproducibility smoke check instructions and expected outputs.
3. Report commands executed and outcomes.

### Constraints
1. Keep docs aligned with actual scripts/paths in repo.
2. Do not include unverifiable performance claims.
3. Make baseline recipe explicit and versioned.

### Completion Requirements
1. Update `PLAN.md` Task 4.8 status.
2. Commit with Conventional Commit message.
3. Return docs changed and validation notes.
