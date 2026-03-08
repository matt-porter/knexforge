## Handoff Prompt: Task 4.7 MLX LoRA Dataset Builder

Continue from current `main` and add dataset tooling for shorthand-focused ML training.

### Objective
Implement `tools/shorthand_dataset_builder.py` to produce validated `train.jsonl` and `val.jsonl` datasets from image + shorthand pairs.

### Required Scope
1. Ingest source samples and produce split JSONL outputs.
2. Validate referenced file existence and shorthand parseability before writing each row.
3. Enforce canonical formatting on shorthand text targets.
4. Emit QA report summarizing invalid rows, class coverage, and loop/non-loop ratios.

### Tests And Validation
1. Add tests for dataset row validation and split generation.
2. Add smoke run on sample fixture set and capture QA report output.
3. Report exact command output or blockers.

### Constraints
1. Keep output schema stable for downstream MLX training scripts.
2. Avoid silently dropping invalid examples without reporting.
3. Keep script runnable from repo root.

### Completion Requirements
1. Update `PLAN.md` Task 4.7 status.
2. Commit with Conventional Commit message.
3. Return changed files, QA artifacts, and blockers.
