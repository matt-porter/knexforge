## Handoff Prompt: Task 4.9 Evaluation Harness

Continue from current `main` and implement held-out evaluation automation for sketch-to-topology performance.

### Objective
Add an evaluation script that tracks parse quality, topology validity, graph quality, and solve success for baseline and fine-tuned checkpoints.

### Required Scope
1. Implement automated eval runner over held-out sketch set.
2. Compute metrics: parse success, topology validity, connection precision/recall (or graph edit distance), and end-to-end solve success.
3. Track and compare baseline vs fine-tuned checkpoints in a structured report.
4. Emit machine-readable and human-readable summary outputs.

### Tests And Validation
1. Add tests for metric computation correctness and report format.
2. Run smoke evaluation on a small held-out subset.
3. Report command outputs and metric snapshot.

### Constraints
1. Keep metrics definitions stable and documented.
2. Avoid hidden filtering that inflates metrics.
3. Ensure failures are reported with per-sample diagnostics.

### Completion Requirements
1. Update `PLAN.md` Task 4.9 status.
2. Commit with Conventional Commit message.
3. Return files changed, metrics produced, and blockers.
