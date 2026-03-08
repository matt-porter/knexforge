## Task 13.1: Loop Detection and Refinement Hook

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 11.5 (Closed-Loop Constraint Handling — DONE)  
**Blocked by**: None  
**Estimated effort**: 1–2 hours

---

### Problem Statement

The topology solver in `frontend/src/services/topologySolver.ts` uses greedy BFS tree-construction. When it encounters a loop-closing edge (an edge where both parts are already placed), it immediately checks the residual and throws `TopologySolveError` with code `loop_constraint_violation` if the residual exceeds tolerance.

This "fail-fast" behavior means:
- **Order-dependent failures**: The same valid loop can pass or fail depending on which edge happens to be the loop-closing edge (determined by BFS traversal order, which depends on lexicographic instance ID sorting and canonical edge ordering).
- **No opportunity for correction**: Even when the geometry is mathematically exact (e.g., an octagon of 8 green 4-way connectors + 8 green micro rods), accumulated floating-point drift across 16 parts causes the final edge's residual to exceed tolerance.
- **No graceful degradation**: The solver cannot attempt refinement before giving up.

This task restructures the solver to **detect loops, defer judgment, and invoke a refinement hook** — without changing the placement algorithm itself.

---

### Objectives

1. Add loop detection per connected component during BFS placement.
2. Replace the immediate `throw` on loop-closing edges with deferred error collection.
3. After BFS placement completes, invoke a `refineLoopComponent()` stub if any loop residuals exceed tolerance.
4. If refinement succeeds (or residuals were already within tolerance), proceed normally.
5. If refinement fails, throw the same `TopologySolveError` with the same error codes so downstream consumers (TopologyEditor, tests) see identical error shapes.

---

### Implementation Details

#### 1. Loop detection during BFS (lines ~620–635 in `topologySolver.ts`)

After building the adjacency map and before starting placement, detect whether each connected component has loops:

```typescript
// A connected component has a loop if edgeCount >= vertexCount
// Count unique undirected edges per component (adjacency lists double-count,
// so count via the ResolvedConnection[] array, not adjacency.get().length)
const componentEdgeCounts = new Map<number, number>()
const componentVertexCounts = new Map<number, number>()
for (const edge of connections) {
  const compId = componentIdByInstance.get(edge.from_instance)!
  componentEdgeCounts.set(compId, (componentEdgeCounts.get(compId) ?? 0) + 1)
}
for (const [instanceId, compId] of componentIdByInstance) {
  componentVertexCounts.set(compId, (componentVertexCounts.get(compId) ?? 0) + 1)
}
const componentHasLoop = new Map<number, boolean>()
for (const compId of componentEdgeCounts.keys()) {
  componentHasLoop.set(compId, componentEdgeCounts.get(compId)! >= componentVertexCounts.get(compId)!)
}
```

**Important**: Count edges from the deduplicated `connections` array (each undirected edge appears once), NOT from adjacency lists (which store each edge twice).

#### 2. Defer loop-closing edge errors (lines ~674–694)

Currently:
```typescript
if (transforms.has(neighbor)) {
  const residual = connectionResidual(...)
  if (residual.distance > positionToleranceMm || ...) {
    throw new TopologySolveError(...)  // <-- fail fast
  }
  continue
}
```

Change to:
```typescript
if (transforms.has(neighbor)) {
  // Record the loop-closing edge for post-BFS refinement
  loopClosingEdges.push(edge)
  continue
}
```

#### 3. Post-BFS refinement gate (per component, before final residual check)

The refinement gate must run **per component** (inside the component loop), not once globally. This is because each component has its own root, its own loop-closing edges, and its own set of edges to refine. The `loopClosingEdges` array must be scoped per component.

```typescript
// After BFS placement completes for this component:
const componentId = componentIdByInstance.get(root)!
if (componentHasLoop.get(componentId) && loopClosingEdges.length > 0) {
  // Check if any loop-closing edges exceed tolerance
  const failingLoopEdges = loopClosingEdges.filter(edge => {
    const residual = connectionResidual(edge, transforms, partsByInstance)
    return residual.distance > positionToleranceMm || residual.angleDeg > angleToleranceDeg
  })

  if (failingLoopEdges.length > 0) {
    // Collect ALL edges in this component (tree edges + loop-closing edges)
    const componentEdges = connections.filter(edge =>
      componentIdByInstance.get(edge.from_instance) === componentId
    )

    // Attempt iterative refinement (Task 13.2 implements this; stub returns false for now)
    const refined = refineLoopComponent(transforms, failingLoopEdges, componentEdges, partsByInstance, {
      positionToleranceMm,
      angleToleranceDeg,
    })
    if (!refined) {
      // Refinement failed — throw with same error shape as before
      // Report ALL failing edges, not just the first
      const issues = failingLoopEdges.map(edge => {
        const residual = connectionResidual(edge, transforms, partsByInstance)
        return {
          code: 'loop_constraint_violation',
          message: `Residual too high for ${edge.key} (distance=${residual.distance.toFixed(3)}mm, angle=${residual.angleDeg.toFixed(3)}°)`,
          item: edge.key,
        }
      })
      throw new TopologySolveError(
        `Closed-loop constraint violation on ${issues.length} edge(s)`,
        issues,
      )
    }
  }
}
```

**Important**: `componentEdges` must include ALL edges in the component (tree + loop-closing), not just the failing edges. The refinement needs the full constraint graph. The `failingLoopEdges` are passed separately so the refinement knows which edges triggered it (for diagnostics).

#### 4. Stub `refineLoopComponent()` function

```typescript
function refineLoopComponent(
  transforms: Map<string, Transform>,
  failingEdges: ResolvedConnection[],
  allEdges: ResolvedConnection[],
  partDefs: Map<string, KnexPartDef>,
  tolerances: { positionToleranceMm: number; angleToleranceDeg: number },
): boolean {
  // Stub: Task 13.2 will implement Jacobi iterative refinement
  // For now, return false (no refinement available)
  return false
}
```

---

### Edge Cases and Consequences

1. **Multi-loop components**: A single component can have multiple independent loops (e.g., a grid of squares). The code must collect ALL loop-closing edges, not just the first. The refinement hook must receive all of them.

2. **Nested loops sharing edges**: Two loops may share a common rod. The refinement must handle the full set of constraints simultaneously, not loop-by-loop. This is handled naturally because `refineLoopComponent` receives all edges in the component.

3. **Tree-only components must be unaffected**: Components with no loops should never hit the refinement path. This preserves existing behavior and performance for the common case.

4. **Error message fidelity**: The `TopologySolveError` thrown after failed refinement must include the same `code: 'loop_constraint_violation'` and `item` format so the TopologyEditor UI (`TopologyEditor.tsx` line 156) displays the same error messages.

5. **Debug logging preserved**: The existing `console.debug` for near-tolerance residuals (lines 689–693) should still fire during the initial BFS pass for loop-closing edges that are close but within tolerance.

6. **Performance**: Loop detection is O(V+E), negligible. The stub refinement is a no-op. No performance regression.

7. **Disconnected components**: Each component is processed independently. A multi-component build where only one component has loops should only attempt refinement on that component.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — main changes (loop detection, deferred errors, refinement hook, stub function)

### Files NOT Modified

- `topologyCompactFormat.ts` — no parser changes needed
- `TopologyEditor.tsx` — error handling already supports `TopologySolveError` with issues array
- Test files — updated in Task 13.5

---

### Tests and Validation

1. **All existing tests must pass unchanged** — the stub returns `false`, so behavior is identical to current code for all existing test cases.
2. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
3. Run: `cd frontend && npm run type-check`
4. Manually test in TopologyEditor that a simple chain (no loop) still solves instantly.
5. Manually test that the octagon loop still shows the same `loop_constraint_violation` error (since the stub doesn't refine yet).

---

### Completion Criteria

- [ ] Loop detection correctly identifies components with cycles vs. trees
- [ ] Loop-closing edges are deferred (not immediately thrown) during BFS
- [ ] `refineLoopComponent` stub is called with correct parameters when loop residuals exceed tolerance
- [ ] Stub returns `false`, so existing error behavior is preserved exactly
- [ ] All existing topology solver tests pass without modification
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.1 status
- [ ] Committed with message `feat(solver): add loop detection and refinement hook (Task 13.1)`
