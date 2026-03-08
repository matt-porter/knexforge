## Handoff Prompt: Task 4.5 Tauri Camera Integration And UI

Continue from current `main` and implement the desktop capture workflow.

### Objective
Create `frontend/src/components/ScanWizard.tsx` flow for multi-photo capture, preview, and reconstruction progress feedback.

### Required Scope
1. Build a guided capture wizard (camera permissions, shot count guidance, retake support).
2. Add thumbnail preview/selection state and clear capture progression UI.
3. Integrate reconstruction kickoff and progress/error states.
4. Wire results into existing import/build flow once reconstruction is ready.

### Tests And Validation
1. Add component tests for step transitions and error states.
2. Add service mocks for camera/reconstruction requests.
3. Run targeted frontend tests and `npm run type-check`.

### Constraints
1. Follow existing frontend state/store patterns.
2. Keep business logic in services, UI logic in components.
3. Preserve mobile/desktop responsive behavior.

### Completion Requirements
1. Update `PLAN.md` status line for Task 4.5.
2. Commit with Conventional Commit message.
3. Return files changed, tests run, and blockers.
