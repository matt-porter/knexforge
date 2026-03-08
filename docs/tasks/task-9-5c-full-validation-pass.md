## Handoff Prompt: Rod-Side Rollout - Full Validation Pass

Continue from current `main` and run the full cross-layer validation suite for the rod-side rollout once dependencies are available.

### Objective
Produce a clean validation report for frontend and core suites, using project venv commands to avoid dependency mismatch issues seen in prior shell sessions.

### Required Scope
1. Execute frontend checks for helper/simulation/topology regressions.
2. Execute core pytest via `\.venv\Scripts\python.exe` with coverage.
3. Capture pass/fail outcomes and timing in completion notes.
4. If tooling/dependencies are missing, document exact blockers and minimal remediation.

### Validation Commands
1. Frontend type-check:
   - `cd frontend && npm run type-check`
2. Frontend targeted regressions:
   - `cd frontend && npm run test -- src/helpers/portGrouping.test.ts src/helpers/portIndicatorSim.test.ts src/helpers/rodSideOrdering.test.ts src/helpers/rodSideGrouping.test.ts src/stores/tabCycling.test.ts src/stores/interactionStore.test.ts src/stores/buildStore.test.ts src/services/__tests__/topologySolver.test.ts src/services/__tests__/rapierSimulator.test.ts`
3. Core full suite:
   - `.\\.venv\\Scripts\\python.exe -m pytest src/core/tests/ --cov`

### Constraints
1. Do not silently skip failing suites.
2. If a command fails due to environment, include error text in task result summary.
3. Keep this task focused on validation and reporting, not feature edits.

### Completion Requirements
1. Update `PLAN.md` with validation status and blockers (if any).
2. Commit any docs-only updates with Conventional Commit format.
3. Return command-by-command results and unresolved blockers.
