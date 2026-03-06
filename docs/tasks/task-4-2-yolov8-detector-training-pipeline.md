## Handoff Prompt: Task 4.2 YOLOv8 Detector Training Pipeline

Continue from current `main` and implement the detector training pipeline half of Phase 4.2.

### Objective
Build a reproducible YOLOv8 training pipeline in `ai/scan-to-build/detector.py` and `ai/scan-to-build/train_config.yaml`, then export ONNX for app integration.

### Required Scope
1. Define training config for synthetic + real data mixing, augmentations, epochs/steps, and evaluation cadence.
2. Implement train/eval/export entrypoints or script wrappers for YOLOv8n fine-tuning.
3. Add ONNX export path with clear artifact naming/versioning.
4. Document expected input dataset layout and model artifact outputs.

### Tests And Validation
1. Add smoke tests for config loading and training pipeline argument validation.
2. Run a short training dry run (minimal epochs) and ONNX export command.
3. Report mAP/precision recall metrics if available from smoke run.

### Constraints
1. Keep code under `ai/scan-to-build/`.
2. Avoid changing unrelated runtime inference behavior without tests.
3. Preserve compatibility with existing detector interfaces.

### Completion Requirements
1. Update `PLAN.md` task status.
2. Commit with Conventional Commit message.
3. Return files changed, commands run, and blockers.
