## Task 13.5: Comprehensive Loop Solver Test Suite

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.4 (Joint-Type-Aware Constraints)  
**Blocked by**: Task 13.2 (minimum; can start after 13.2 and extend as 13.3/13.4 land)  
**Estimated effort**: 2–3 hours

---

### Problem Statement

The existing topology solver test file (`frontend/src/services/__tests__/topologySolver.test.ts`) has only 2 tests, both for open chains (no loops). The loop closure logic introduced in Tasks 13.1–13.4 has no automated test coverage. This task adds a comprehensive test suite covering:

- Valid loops that must solve (the user's octagon, triangles, squares, hexagons)
- Order-independence (shuffled connections produce identical geometry)
- Infeasible loops that must fail with clear errors
- Mixed joint types in loops
- Regression for open chains (no loops)
- Edge cases (single-part, disconnected components with and without loops)

---

### Test Categories

#### Category 1: Valid Loop Closure

These tests verify that geometrically valid K'Nex loops solve without error.

**Test 1.1: Octagon (user's reported bug)**
```
gc4_1.A -- gsr_1.end1
gsr_1.end2 -- gc4_2.D
gc4_2.A -- gsr_2.end1
gsr_2.end2 -- gc4_3.D
... (8 connectors + 8 rods forming a regular octagon)
gsr_8.end2 -- gc4_1.D
```
- Assert: `solveTopology()` does not throw
- Assert: all 16 connection residuals are < 2.0mm position, < 15° angle
- Assert: all 8 connectors lie approximately in the same plane (world Z-axes parallel)

**Test 1.2: Triangle (Issue #4 regression)**
```
br_1.end1 -- rc3_1.A
br_1.end2 -- gc2_1.A
rc3_1.C -- br_2.end1
br_2.end2 -- gc2_2.A
gc2_1.B -- yr_1.end2
gc2_2.B -- yr_1.end1
```
- Assert: solves without error
- Assert: residuals within tolerance

**Test 1.3: Square (4 connectors + 4 rods)**
Using 4 red 3-way connectors (90° between ports A and B) and 4 rods of the same length:
```
rc3_1.A -- rr_1.end1
rr_1.end2 -- rc3_2.B
rc3_2.A -- rr_2.end1
rr_2.end2 -- rc3_3.B
rc3_3.A -- rr_3.end1
rr_3.end2 -- rc3_4.B
rc3_4.A -- rr_4.end1
rr_4.end2 -- rc3_1.B
```
- Assert: solves without error
- Assert: connectors are approximately at square vertices

**Test 1.4: Hexagon (6 connectors + 6 rods)**
Using 6 connectors with 60° port spacing (if available) or appropriate part combination.
- Assert: solves without error

#### Category 2: Order Independence

**Test 2.1: Octagon with shuffled connection order**
Take the octagon from Test 1.1, use a fixed (deterministic, not random) permutation of the 16 connection lines. Solve both orderings.
- Assert: both solve without error
- Assert: all connection residuals are within tolerance for both
- Assert: solved part positions are equivalent within practical epsilon (0.1mm) — not exact match, because Jacobi convergence path differs slightly
- Assert: solved part rotations are equivalent (quaternion dot product > 0.999)
- Assert: root part position is identical (gauge-fixed, so this IS exact)

**Test 2.2: Triangle with reversed edges**
Take the triangle, reverse the `from`/`to` of every connection.
- Assert: produces geometrically equivalent results within same practical epsilon

**Test 2.3: Octagon with "worst-case" ordering**
Order connections so the loop-closing edge is processed first in BFS (if possible). This tests that the solver doesn't depend on the closing edge being last.
- Assert: solves and produces equivalent geometry to Test 1.1

#### Category 3: Infeasible Loops

**Test 3.1: Overconstrained rectangle (wrong rod lengths)**
A rectangle where opposite sides have different rod lengths that don't form a valid rectangle:
```
rc3_1.A -- gr_1.end1    # 190mm rod
gr_1.end2 -- rc3_2.B
rc3_2.A -- br_1.end1    # 54mm rod
br_1.end2 -- rc3_3.B
rc3_3.A -- gr_2.end1    # 190mm rod
gr_2.end2 -- rc3_4.B
rc3_4.A -- br_2.end1    # 54mm rod — but 90° angles + these lengths don't close
br_2.end2 -- rc3_1.B
```
- Assert: throws `TopologySolveError` with code `loop_constraint_violation` or `residual_violation`
- Assert: error message includes the failing edge key

**Test 3.2: Impossible triangle (all same-length rods, 90° connectors)**
Three 90° connectors can't form a triangle (internal angles sum to 270°, not 180°).
- Assert: throws with clear error

#### Category 4: Mixed Joint Types

**Test 4.1: Loop with one revolute joint**
An octagon where one connection is revolute instead of fixed.
- Assert: solves (more easily than all-fixed, since revolute adds DOF slack)
- Assert: revolute joint's roll angle is not constrained to discrete values

**Test 4.2: Motor chain forming a loop**
A motor connected to a rod loop where the motor creates a revolute joint.
- Assert: solves without error

**Test 4.3: Loop with center-axial connection (internal cylindrical DOFs)**
A loop where one rod passes through a connector's center hole via `center_axial` port. The center-axial connection has 2 internal free DOFs (axial slide + roll) detected via `hasAxialFreedom()`.
- Assert: `inferJointType` still returns `'revolute'` (public type unchanged)
- Assert: `hasAxialFreedom(edge)` returns `true` for the center-axial connection
- Assert: loop closes (the free axial DOF helps absorb error along the mating axis)
- Note: Only assert the loop closes, not that the rod has shifted. Axial masking removes resistance but doesn't guarantee visible movement — it depends on whether the error projects onto the free axis.

**Test 4.4: Multiple center-axial connections in one loop**
A structure where 2+ center-axial connections provide extra DOF slack.
- Assert: solves without error

#### Category 5: Regression (Open Chains)

**Test 5.1: Simple 2-part chain (existing test preserved)**
- Assert: identical results to pre-Task-13 code

**Test 5.2: Long open chain (10 parts)**
- Assert: no refinement is triggered (no loops exist)
- Assert: results are identical to greedy BFS placement

**Test 5.3: Disconnected components (one with loop, one without)**
- Assert: the loop component is refined, the tree component is not
- Assert: both produce valid builds

#### Category 6: Edge Cases

**Test 6.1: Single-part build (no connections)**
- Assert: solves with part at default position

**Test 6.2: Two-part loop (if possible — likely not with K'Nex geometry)**
- Assert: either solves or fails gracefully (no crash, no infinite loop)

**Test 6.3: Figure-8 (two loops sharing a vertex)**
Two triangles sharing one connector:
- Assert: both loops close successfully

---

### Implementation Notes

#### Part Definition Fixtures

Tests need `KnexPartDef` data. Two approaches:

1. **Inline definitions** (as in the existing tests): Verbose but self-contained. Use for simple tests.
2. **Load from `parts/*.json`**: More realistic but requires file I/O in tests. Use a helper:
   ```typescript
   function loadPartDefs(...partIds: string[]): Map<string, KnexPartDef>
   ```

Recommend: create a shared test fixture file `__tests__/partFixtures.ts` that exports pre-loaded part definitions for the most common parts (gc4, gsr, rc3, rr, br, yr, gc2, etc.).

#### Geometry Assertions Helper

Add a helper to verify solved geometry properties:

```typescript
function assertResidualWithinTolerance(
  build: SolvedTopologyBuild,
  partDefs: Map<string, KnexPartDef>,
  posTolMm: number,
  angleTolDeg: number,
): void
```

#### Order-Independence Assertion Helper

```typescript
function assertGeometryEquivalent(
  buildA: SolvedTopologyBuild,
  buildB: SolvedTopologyBuild,
  posEpsilonMm: number = 0.1,     // practical epsilon for JS floating-point + Jacobi path variance
  rotEpsilonDot: number = 0.999,   // quaternion dot product threshold
): void
```

---

### Edge Cases and Consequences

1. **Test determinism**: All tests must be deterministic (no random shuffling in CI). For "shuffled order" tests, use a fixed permutation, not `Math.random()`.

2. **Part definitions must match actual JSON files**: If part JSON files change (e.g., port positions adjusted), tests using inline definitions may diverge. The fixture helper approach mitigates this.

3. **Tolerance values in tests**: Tests should use the default solver tolerances (2.0mm, 15°), not tighter custom values. Custom tolerance tests belong in a separate "precision" test category if needed.

4. **Test performance**: Each `solveTopology` call with refinement should complete in <100ms. Add a test timeout to catch infinite loops or divergence.

5. **Snapshot stability**: Do NOT use snapshot tests for solved positions/rotations — they're fragile across algorithm changes. Use geometric property assertions (residuals, planarity, parallelism).

---

### Files Modified

- `frontend/src/services/__tests__/topologySolver.test.ts` — add all new tests
- `frontend/src/services/__tests__/partFixtures.ts` — new file with shared part definition fixtures

### Files NOT Modified

- `topologySolver.ts` — no solver changes in this task
- `topologyCompactFormat.ts` — no parser changes

---

### Tests and Validation

1. Run full test suite: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
2. Verify all new tests pass
3. Verify existing 2 tests still pass
4. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] At least 15 new test cases covering all 6 categories
- [ ] Octagon loop test (user's reported bug) passes
- [ ] Order-independence tests verify identical geometry for shuffled connections
- [ ] Infeasible geometry tests verify clear error reporting
- [ ] Shared part definition fixtures are reusable
- [ ] Geometry assertion helpers are reusable
- [ ] All tests are deterministic (no randomness)
- [ ] Each test completes in <100ms
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.5 status
- [ ] Committed with message `test(solver): comprehensive loop solver test suite (Task 13.5)`
