## Handoff Prompt: Task 12.3 Live Shorthand Editor Polish

Continue from current `main` and finish remaining shorthand-editor UX gaps.

### Objective
Complete pending portions of live shorthand editing in frontend, focusing on grammar-mode UX and reliability.

### Current Status
JSON/topology live panel, debounce, autocomplete, and layout fixes are in place; shorthand grammar mode and final UX polish remain.

### Required Scope
1. Add shorthand-mode editing experience with parse-on-change preview.
2. Surface parser/validator errors inline with actionable messages.
3. Ensure fallback to last valid solved scene on invalid edits.
4. Keep panel ergonomics stable with existing resize/hide/show interactions.

### Tests And Validation
1. Extend frontend tests for shorthand mode parsing, error rendering, and last-valid fallback.
2. Add regressions for panel state transitions to prevent layout drift regressions.
3. Run targeted frontend tests and type-check.

### Constraints
1. Preserve existing builder layout and parts panel discoverability.
2. Keep edits debounced and responsive for large topologies.
3. Avoid introducing direct Three.js math in editor logic.

### Completion Requirements
1. Update `PLAN.md` Task 12.3 status.
2. Commit with Conventional Commit message.
3. Return files changed, test outcomes, and blockers.
