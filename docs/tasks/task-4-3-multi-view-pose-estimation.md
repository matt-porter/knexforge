## Handoff Prompt: Task 4.3 Multi-View Pose Estimation

Continue from current `main` and implement robust multi-view pose estimation.

### Objective
Advance `ai/scan-to-build/pose_estimator.py` to reconstruct 3D part poses from two or more images using PnP, RANSAC, and triangulation.

### Required Scope
1. Add camera pose estimation flow for multi-view inputs with outlier rejection.
2. Triangulate part positions across views and return uncertainty/confidence per pose.
3. Handle degenerate geometries (insufficient correspondences, near-collinear views) with structured errors.
4. Define clear input/output contract for downstream graph reconstruction.

### Tests And Validation
1. Add deterministic tests with synthetic camera/point fixtures.
2. Validate reprojection error and triangulation error thresholds.
3. Run a focused test command for pose estimator tests and report results.

### Constraints
1. Keep implementation inside scan-to-build AI layer.
2. Do not embed hard-coded part-specific offsets.
3. Maintain typed interfaces and explicit diagnostics.

### Completion Requirements
1. Update `PLAN.md` with progress/completion notes.
2. Commit with Conventional Commit message.
3. Return changed files, test results, and blockers.
