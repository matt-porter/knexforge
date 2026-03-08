## Task 13.7: Solver Error UX Improvements

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.5 (Comprehensive Test Suite)  
**Blocked by**: Task 13.2  
**Estimated effort**: 1–1.5 hours

---

### Problem Statement

When the solver fails to close a loop (even after iterative refinement), the error message shown in the TopologyEditor is technical and unhelpful:

```
loop_constraint_violation: Residual too high for gc4_5.A|gsr_5.end1
```

The user sees:
- A cryptic error code (`loop_constraint_violation`)
- A port pair reference (`gc4_5.A|gsr_5.end1`) with no context on what's wrong
- No guidance on how to fix the problem
- No indication of how far off the geometry is

This task improves error reporting to help users understand and fix loop closure failures.

---

### Objectives

1. Provide human-readable error messages that explain WHY a loop failed.
2. Include quantitative residual information (how far off, in mm and degrees).
3. Suggest actionable fixes when possible.
4. Differentiate between "close but not quite" and "fundamentally impossible" geometries.
5. Surface loop closure progress information (not just pass/fail).

---

### Implementation Details

#### 1. Enhanced Error Messages

Replace the generic "Residual too high" message with specific diagnostics:

```typescript
// Before:
message: `Residual too high for ${edge.key}`

// After (examples):
// Position failure:
message: `Loop cannot close: ports gc4_5.A and gsr_5.end1 are ${residual.distance.toFixed(1)}mm apart (limit: ${positionToleranceMm}mm). The loop geometry may need different rod lengths or connector angles.`

// Angle failure:
message: `Loop cannot close: ports gc4_5.A and gsr_5.end1 are misaligned by ${residual.angleDeg.toFixed(1)}° (limit: ${angleToleranceDeg}°). Try a different connector type at this junction.`

// Both:
message: `Loop cannot close: gc4_5.A ↔ gsr_5.end1 gap is ${residual.distance.toFixed(1)}mm and ${residual.angleDeg.toFixed(1)}° off. ...`
```

#### 2. Classify Failure Severity

Add a `severity` field to `TopologyIssue`:

```typescript
export interface TopologyIssue {
  code: string
  message: string
  item?: string
  severity?: 'error' | 'warning' | 'info'
  details?: {
    residualDistanceMm?: number
    residualAngleDeg?: number
    toleranceDistanceMm?: number
    toleranceAngleDeg?: number
    refinementIterations?: number
  }
}
```

Classify based on how far off the residual is:
- **Close miss** (residual < 3× tolerance): "Loop is close to closing. Try adjusting rod lengths."
- **Far miss** (residual > 10× tolerance): "This combination of parts cannot form a closed loop."
- **Angle-only failure**: "Loop positions match but angles are incompatible."

#### 3. Report Refinement Progress

When refinement runs but fails, include iteration count and convergence trend:

```typescript
{
  code: 'loop_refinement_failed',
  message: `Loop refinement ran ${iterations} iterations but couldn't close the gap (final: ${finalResidual.distance.toFixed(1)}mm, ${finalResidual.angleDeg.toFixed(1)}°)`,
  details: {
    residualDistanceMm: finalResidual.distance,
    residualAngleDeg: finalResidual.angleDeg,
    refinementIterations: iterations,
  }
}
```

#### 4. Multi-Issue Reporting

When multiple loop-closing edges fail, report ALL of them (not just the first):

```typescript
const failingEdges = loopClosingEdges.filter(edge => {
  const r = connectionResidual(edge, transforms, partsByInstance)
  return r.distance > positionToleranceMm || r.angleDeg > angleToleranceDeg
})

const issues = failingEdges.map(edge => ({
  code: 'loop_constraint_violation',
  message: `...`,
  item: edge.key,
  details: { ... }
}))

throw new TopologySolveError(`${issues.length} loop(s) could not close`, issues)
```

#### 5. TopologyEditor Display

The TopologyEditor already renders `error.issues.map(issue => issue.message)` as separate lines. The enhanced messages will display naturally. Optionally, add severity-based styling:

```tsx
// In TopologyEditor.tsx error rendering:
<div style={{ color: issue.severity === 'warning' ? '#FFA500' : '#FF4444' }}>
  {issue.message}
</div>
```

---

### Edge Cases and Consequences

1. **Backwards compatibility**: The `TopologyIssue` type gains optional fields (`severity`, `details`). Existing consumers that only read `code` and `message` are unaffected. The `details` field is optional and only present for refinement-related errors. The existing error `code` values (`loop_constraint_violation`, `residual_violation`) must remain stable — new codes (`loop_refinement_failed`) are additive only.

   **Successful-solve warnings**: To surface near-tolerance info issues on successful solves, `SolvedTopologyBuild` needs a new optional `warnings?: TopologyIssue[]` field. This avoids abusing the error/throw path for informational messages. The TopologyEditor checks `result.warnings` after a successful solve and displays them in a muted style.

2. **Error message length**: Enhanced messages are longer than before. The TopologyEditor's error panel should handle multi-line messages without truncation. Verify the panel has `overflow-y: auto` or similar.

3. **Multiple failing loops in one component**: A grid structure (e.g., 2×2 squares) may have multiple independent loops that all fail. Report each failing edge separately so the user can identify which part of the structure is problematic.

4. **Near-tolerance successes**: When a loop closes but is near tolerance (>80% of limit), consider adding an `info`-severity issue: "Loop closed but is near tolerance limits. The build may be fragile." This helps users understand why their build looks slightly off. **Important**: These info warnings must only be emitted as part of the `TopologyIssue[]` array when the solver succeeds — NOT via `console.debug` on every keystroke. The TopologyEditor should display them in a muted style (not red), and they should not prevent the build from rendering.

5. **AI pipeline consumers**: The `ai/sketch-to-build/parser.py` and inference pipeline may parse error messages. Keep the `code` field stable (`loop_constraint_violation`, `residual_violation`) so programmatic consumers don't break. Enhanced messages are for human display only.

6. **Internationalization**: Error messages are in English. No i18n framework exists in the project currently. This is acceptable for an open-source tool. If i18n is added later, error codes can be used as translation keys.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — enhanced error messages, severity classification, multi-issue reporting
- `frontend/src/components/TopologyEditor.tsx` — optional severity-based styling for error display

### Files NOT Modified

- `topologyCompactFormat.ts` — no parser changes
- Python core files — error types are frontend-only

---

### Tests and Validation

1. **Message content tests**: For the infeasible geometry tests from Task 13.5, assert that error messages contain distance/angle values and actionable hints.
2. **Multi-issue test**: Build with 2 independent failing loops. Assert both are reported.
3. **Severity classification test**: Assert "close miss" vs "far miss" produces different severity values.
4. **Backwards compatibility**: Assert that `error.issues[0].code` is still `'loop_constraint_violation'` for existing error paths.
5. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
6. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] Error messages include quantitative residual data (mm and degrees)
- [ ] Error messages include actionable fix suggestions
- [ ] `TopologyIssue.severity` classifies failures as close-miss vs. far-miss
- [ ] `TopologyIssue.details` includes residual values and iteration count
- [ ] Multiple failing loop edges are all reported (not just the first)
- [ ] Near-tolerance successes emit info-level warnings
- [ ] TopologyEditor renders severity-appropriate styling
- [ ] Error codes remain stable for programmatic consumers
- [ ] All existing tests pass
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.7 status
- [ ] Committed with message `feat(solver): improved loop closure error messages and diagnostics (Task 13.7)`
