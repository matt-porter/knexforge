## Task 13.6: Performance Optimization and Warm-Start Caching

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.5 (Comprehensive Test Suite)  
**Blocked by**: Task 13.2 (minimum for implementation; 13.5 for validation)  
**Estimated effort**: 1.5–2 hours

---

### Problem Statement

The topology solver runs on every keystroke in the TopologyEditor (debounced at 300ms). With the new Jacobi refinement pass, each solve may take longer — especially for large builds with multiple loops. This task ensures the solver remains interactive by:

1. **Skipping refinement for tree-only components** (no loops → BFS is already exact)
2. **Warm-starting from cached transforms** when the topology changes incrementally (e.g., user adds one connection)
3. **Reusing Three.js temporaries** to reduce garbage collection pressure
4. **Adding performance instrumentation** for debugging

---

### Optimization 1: Skip Refinement for Tree-Only Components

Already partially implemented in Task 13.1 (refinement is only called when loop residuals fail). This task makes the skip **explicit and measurable**:

```typescript
// After BFS placement for a component:
if (!componentHasLoop.get(componentId)) {
  // Tree component — BFS placement is exact, skip refinement
  continue
}
```

This ensures zero overhead for the common case of open chains and branching structures.

---

### Optimization 2: Warm-Start Transform Cache

When the user edits topology text, typically only a small change occurs (add/remove one connection or part). Re-solving from scratch wastes the previous solution. Instead:

#### Cache Key

Compute a stable hash of the topology:
```typescript
function topologyHash(model: TopologyModel): string {
  // Hash parts (sorted by instance_id) + connections (sorted by canonical key)
  // Include part_ids, port references, joint types, twist values
  // Exclude metadata
}
```

#### Cache Structure

```typescript
interface TransformCache {
  hash: string
  transforms: Map<string, { position: [number, number, number]; rotation: [number, number, number, number] }>
}
```

Store as a module-level variable (not in component state — the solver is a pure function called from the editor).

#### Warm-Start Logic

In `solveTopology()`, before BFS placement:

```typescript
if (cachedTransforms && cachedTransforms.hash === currentHash) {
  // Exact match — but still re-validate all residuals before returning.
  // Never skip validation, even for cache hits.
}
```

**Important constraint**: Warm-start should only pre-seed transforms as **hints for the refinement pass**, NOT skip BFS placement entirely. BFS placement is where discrete twist candidates are evaluated and `isPhysicallyValidRodConnectorOrientation` is checked. Skipping BFS for cached parts risks using transforms that are incompatible with a changed adjacent edge.

The recommended approach:

1. **For exact hash match**: Re-validate all residuals. If all pass, return cached result. If any fail (shouldn't happen, but guards against bugs), clear cache and re-solve.
2. **For partial match** (some parts in cache): Run full BFS as normal. Then, before refinement, compare BFS output with cached transforms — if cached transforms have lower total residual for the component, use them as the refinement starting point instead of BFS output.
3. **Never skip BFS validation logic** (discrete twist selection, physical orientation checks).

#### Cache Invalidation

- Cache is always re-validated, never blindly trusted.
- Cache is cleared entirely if validation fails on an exact hash match (indicates a bug or stale data).
- Module-level cache must be cleared in test `beforeEach` hooks to prevent inter-test contamination.

---

### Optimization 3: Reuse Three.js Temporaries

The Jacobi refinement loop creates many temporary `Vector3` and `Quaternion` objects per iteration. In JavaScript, this causes GC pressure. Pre-allocate and reuse:

```typescript
// Pre-allocated temporaries (module-level, reused across calls)
const _tempVec3A = new Vector3()
const _tempVec3B = new Vector3()
const _tempVec3C = new Vector3()
const _tempQuatA = new Quaternion()
const _tempQuatB = new Quaternion()
```

Replace `new Vector3()` calls inside the hot loop with `.copy()` on pre-allocated temps. This pattern is standard in Three.js codebases (see Three.js source for examples).

**Caution**: Temps must not be used across `getWorldPortPose` calls that may alias. Verify that each temp is used for a single computation before being overwritten.

---

### Optimization 4: Performance Instrumentation

Add timing instrumentation behind a debug flag:

```typescript
const SOLVER_DEBUG = typeof globalThis !== 'undefined' && (globalThis as any).__TOPOLOGY_SOLVER_DEBUG__

function solveTopology(...): SolvedTopologyBuild {
  const t0 = SOLVER_DEBUG ? performance.now() : 0

  // ... existing solve logic ...

  if (SOLVER_DEBUG) {
    const elapsed = performance.now() - t0
    console.debug(`[TopologySolver] Solved in ${elapsed.toFixed(1)}ms (${parts.length} parts, ${connections.length} connections, ${refinementIterations} refinement iters)`)
  }
}
```

Users/developers can enable via browser console: `__TOPOLOGY_SOLVER_DEBUG__ = true`

---

### Edge Cases and Consequences

1. **Cache poisoning from concurrent edits**: The TopologyEditor debounces at 300ms. If the user types fast, multiple `applyText()` calls may be in-flight. Since `solveTopology` is synchronous and called from a `useCallback`, only one runs at a time. The cache is safe.

2. **Cache across different editor sessions**: The module-level cache persists for the lifetime of the page. If the user loads a completely different build, the cache hash won't match and BFS runs from scratch. This is correct.

3. **Warm-start with removed parts**: If a part existed in the cache but is removed in the new topology, its cached transform is ignored (the `partsByInstance.has()` check filters it out). No stale data leaks.

4. **Warm-start with added parts**: New parts not in the cache are placed by BFS as usual. The BFS picks them up because they're not in `transforms` yet.

5. **Warm-start producing worse results**: If cached transforms are far from the new solution (e.g., user changed a connection that drastically alters geometry), the refinement may need more iterations or may fail. Fallback: if warm-started solve fails, clear cache and retry from scratch (BFS only). This adds at most 2× solve time in the worst case.

6. **Memory**: The cache stores one `[number, number, number]` position + `[number, number, number, number]` rotation per part. For 100 parts, this is ~2.8KB. Negligible.

7. **Temp variable aliasing in `getWorldPortPose`**: The function creates new `Vector3` objects internally. If we change it to use temps, we must ensure the caller doesn't hold references to the returned vectors across calls. For safety, don't modify `getWorldPortPose` — only use temps in the refinement loop's correction accumulation.

8. **Impact on test determinism**: Warm-start caching could cause tests to pass when they shouldn't (if they reuse state from a previous test). Solution: clear the cache in a `beforeEach` hook in tests, or make the cache opt-in via `SolveTopologyOptions`.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — warm-start cache, temp reuse, debug instrumentation, explicit tree-skip

### Files NOT Modified

- `TopologyEditor.tsx` — no UI changes needed
- Test files — minor addition of cache-clear in `beforeEach` (if needed)

---

### Tests and Validation

1. **Performance benchmark**: Solve the octagon 100 times in a test, assert average time < 10ms.
2. **Warm-start test**: Solve a build, add one connection, solve again. Verify second solve is faster (or at least not slower) than first.
3. **Cache invalidation test**: Solve build A, solve completely different build B. Verify correct results for B (cache miss doesn't corrupt).
4. **All existing tests still pass** (especially order-independence tests — cache must not break determinism).
5. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
6. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] Tree-only components explicitly skip refinement (no overhead for non-loop builds)
- [ ] Warm-start cache reuses transforms from previous solves for unchanged parts
- [ ] Cache is keyed by topology hash and invalidated on structural changes
- [ ] Pre-allocated Three.js temporaries used in the refinement hot loop
- [ ] Debug timing instrumentation available via `__TOPOLOGY_SOLVER_DEBUG__`
- [ ] Fallback to full re-solve if warm-start refinement fails
- [ ] Test determinism preserved (cache cleared between tests if needed)
- [ ] All existing tests pass
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.6 status
- [ ] Committed with message `perf(solver): warm-start caching and temp reuse for loop refinement (Task 13.6)`
