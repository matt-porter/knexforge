## Handoff Prompt: Task 4.2 Synthetic Data Generation

Continue from current `main` and implement the synthetic image generation half of Phase 4.2.

### Objective
Extend `ai/scan-to-build/data_generator.py` so it can generate high-volume, labeled synthetic training images for K'Nex part detection.

### Required Scope
1. Render randomized part combinations from existing GLB assets with varied lighting, camera angles, and backgrounds.
2. Export images plus labels in COCO-compatible format suitable for YOLOv8 workflows.
3. Add configurable generation targets (default target: 10k images per part type) and deterministic seeding support.
4. Add dataset integrity checks (missing image, missing annotation, invalid bbox) before final write completion.

### Tests And Validation
1. Add focused tests under `ai/scan-to-build/` for annotation correctness and output structure.
2. Run `python ai/scan-to-build/data_generator.py --dry-run` (or equivalent dry mode) and report output summary.
3. If blocked by environment dependencies, report exact command and error.

### Constraints
1. Keep behavior data-driven from part definitions and meshes.
2. Do not hard-code part geometry assumptions outside schema/part metadata.
3. Do not modify unrelated frontend or core snapping logic.

### Completion Requirements
1. Update `PLAN.md` entry for this task with completion or progress details.
2. Commit with a Conventional Commit message.
3. Return changed files, validation commands run, and any blockers.
