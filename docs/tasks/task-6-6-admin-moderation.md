## Handoff Prompt: Task 6.6 Admin And Moderation

Continue from current `main` and implement lightweight moderation tooling.

### Objective
Add role-aware admin moderation flows with `is_admin` authorization and RLS enforcement, plus guarded UI routes for moderation actions.

### Required Scope
1. Implement role checks around admin-only UI routes and controls.
2. Add moderation actions: feature/unfeature, remove model, and view reports.
3. Ensure database policies enforce admin permissions server-side.
4. Provide audit-friendly action logging where practical.

### Tests And Validation
1. Add tests for route guards and hidden/visible admin controls.
2. Add service tests for policy-dependent mutation flows.
3. Validate non-admin users cannot invoke admin mutations.

### Constraints
1. No separate admin backend.
2. Enforce permissions in both UI and data policy layers.
3. Keep moderation UX simple and reversible when possible.

### Completion Requirements
1. Update `PLAN.md` Task 6.6 status.
2. Commit with Conventional Commit message.
3. Return changed files, test outcomes, and blockers.
