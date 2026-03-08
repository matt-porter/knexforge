## Task 13.2: Jacobi Iterative Constraint Solver (Position + Direction)

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.1 (Loop Detection and Refinement Hook)  
**Blocked by**: Task 13.1  
**Estimated effort**: 2–3 hours

---

### Problem Statement

After Task 13.1, the solver defers loop-closing edge failures and calls `refineLoopComponent()`, which is a stub that always returns `false`. This task implements the actual iterative refinement algorithm.

The core insight: the BFS placement produces a **good initial guess** — all parts are roughly in the right place, but cumulative floating-point errors across the loop cause the closing edge's ports to be slightly misaligned. We need to **redistribute this error across all parts in the loop** rather than concentrating it at the arbitrary closing edge.

---

### Algorithm: Jacobi XPBD-Style Constraint Projection

#### Why Jacobi (not Gauss-Seidel)

**Order independence** is a hard requirement. The user's bug report explicitly states "the order of operations shouldn't matter." Gauss-Seidel updates parts sequentially, so results depend on iteration order. Jacobi computes all corrections from the current state, then applies them simultaneously — producing identical results regardless of edge traversal order.

#### Constraint Definitions

For each connection edge between parts `i` and `j`, the constraints enforced depend on the **effective degrees of freedom** of the joint. For fixed joints (the most common case and the focus of this task):

1. **Position constraint**: The two ports' world positions must coincide.
   - Error: `e_p = worldPortPos_i - worldPortPos_j` (Vector3)
   - Correction: translate each part by `±k_pos * e_p / 2`

2. **Direction constraint**: The two ports' world directions must be anti-parallel (facing into each other).
   - Error: `e_ω = dir_i × (-dir_j)` (cross product — axis of misalignment, magnitude ≈ sin(angle))
   - Correction: rotate each part by a small angle about `e_ω` axis, split ±half

**Important design note**: The position and direction corrections must be **DOF-aware** from the start, even though this task only implements fixed joints. The correction functions should accept a `constrainedAxes` parameter (or equivalent) so that Task 13.4 can easily restrict corrections to only the constrained DOFs. For example, a prismatic joint should only correct the position error **perpendicular** to the sliding axis, and a revolute/cylindrical joint should not correct roll. See Task 13.4 for the full DOF table.

The core loop structure should be:
```typescript
const posError = computePositionError(edge, transforms, partDefs)  // full 3D error
const maskedPosError = maskFreeDOFs(posError, edge, transforms, partDefs)  // remove free DOFs
// ... apply maskedPosError as correction
```

For this task, `maskFreeDOFs` is the identity function for all joints (fixed joints constrain all DOFs). Task 13.4 fills in the actual masking logic.

#### Gauge Fixing (Root Pinning)

Without pinning, corrections would translate/rotate the entire component as a rigid body (gauge freedom). Fix this by assigning weight 0 to the root part (lexicographically first instance_id) and weight 1 to all others. When computing corrections:
- If part `i` is root: apply full correction to part `j` only
- If part `j` is root: apply full correction to part `i` only
- If neither is root: split correction 50/50

#### Iteration Schedule

```
maxIterations = 12
k_pos = 0.6        // position stiffness (0 = no correction, 1 = full correction)
k_rot = 0.5        // rotation stiffness
earlyExitPosMm = positionToleranceMm * 0.5   // converged when well within tolerance
earlyExitAngleDeg = angleToleranceDeg * 0.5
```

---

### Implementation Details

#### Function Signature

```typescript
function refineLoopComponent(
  transforms: Map<string, Transform>,
  failingEdges: ResolvedConnection[],
  allEdges: ResolvedConnection[],
  partDefs: Map<string, KnexPartDef>,
  tolerances: { positionToleranceMm: number; angleToleranceDeg: number },
): boolean
```

**Mutates** `transforms` in-place if refinement succeeds. Returns `true` if all edge residuals are within tolerance after refinement, `false` otherwise.

#### Core Loop (Pseudocode)

```typescript
function refineLoopComponent(...): boolean {
  // 1. Identify all parts in the component that have loop-closing edges
  const componentParts = new Set<string>()
  for (const edge of allEdges) {
    componentParts.add(edge.from_instance)
    componentParts.add(edge.to_instance)
  }

  // 2. Determine root (pinned) part — lexicographically first
  const rootId = [...componentParts].sort()[0]

  // 3. Iterate
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // 3a. Accumulate corrections (Jacobi: read from current, write to accumulators)
    const posDeltas = new Map<string, Vector3>()  // accumulated position corrections
    const rotDeltas = new Map<string, { axis: Vector3; angle: number; pivot: Vector3 }[]>()
    // Initialize all to zero for each part in componentParts

    for (const edge of allEdges) {
      const fromTransform = transforms.get(edge.from_instance)!
      const toTransform = transforms.get(edge.to_instance)!
      const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
      const toPort = getPartPort(partDefs.get(edge.to_instance)!, edge.to_port)!

      const fromPose = getWorldPortPose(fromTransform, fromPort)
      const toPose = getWorldPortPose(toTransform, toPort)

      // Position error
      const e_p = fromPose.position.clone().sub(toPose.position)

      // Direction error (cross product of dir_from and -dir_to)
      const targetDir = toPose.direction.clone().negate()
      const e_omega = new Vector3().crossVectors(fromPose.direction, targetDir)

      // Distribute corrections based on root pinning
      const fromIsRoot = edge.from_instance === rootId
      const toIsRoot = edge.to_instance === rootId
      const fromWeight = fromIsRoot ? 0 : (toIsRoot ? 1 : 0.5)
      const toWeight = toIsRoot ? 0 : (fromIsRoot ? 1 : 0.5)

      // Accumulate position deltas
      posDeltas.get(edge.from_instance)!.sub(e_p.clone().multiplyScalar(K_POS * fromWeight))
      posDeltas.get(edge.to_instance)!.add(e_p.clone().multiplyScalar(K_POS * toWeight))

      // Accumulate rotation deltas
      // Use atan2 for stable angle extraction (asin is ambiguous above 90°)
      const sinAngle = e_omega.length()
      const cosAngle = fromPose.direction.dot(targetDir)
      const angle = Math.atan2(sinAngle, cosAngle)
      if (angle > 1e-6) {
        const axis = e_omega.clone().normalize()
        // Store rotation pivot (midpoint of the two port world positions)
        // so that rotation updates position correctly
        const pivot = fromPose.position.clone().add(toPose.position).multiplyScalar(0.5)
        rotDeltas.get(edge.from_instance)!.push({ axis: axis.clone().negate(), angle: K_ROT * angle * fromWeight, pivot })
        rotDeltas.get(edge.to_instance)!.push({ axis, angle: K_ROT * angle * toWeight, pivot })
      }
    }

    // 3b. Apply all accumulated corrections simultaneously
    for (const partId of componentParts) {
      if (partId === rootId) continue
      const t = transforms.get(partId)!

      // Apply position
      t.position.add(posDeltas.get(partId)!)

      // Apply rotations ABOUT THE PORT PIVOT (not part origin)
      // This is critical: rotating about the part origin moves port positions,
      // which fights the position constraint and causes oscillation on short parts.
      for (const { axis, angle, pivot } of rotDeltas.get(partId)!) {
        const dq = new Quaternion().setFromAxisAngle(axis, angle)
        // Rotate the part's position around the pivot
        t.position.sub(pivot).applyQuaternion(dq).add(pivot)
        // Update the part's orientation
        t.rotation.premultiply(dq).normalize()
      }
    }

    // 3c. Check convergence and track residual trend
    let maxPosMm = 0
    let maxAngleDeg = 0
    for (const edge of allEdges) {
      const residual = connectionResidual(edge, transforms, partDefs)
      maxPosMm = Math.max(maxPosMm, residual.distance)
      maxAngleDeg = Math.max(maxAngleDeg, residual.angleDeg)
    }

    if (maxPosMm <= tolerances.positionToleranceMm && maxAngleDeg <= tolerances.angleToleranceDeg) {
      console.debug(`[TopologySolver] Loop refinement converged in ${iter + 1} iterations (pos=${maxPosMm.toFixed(3)}mm, angle=${maxAngleDeg.toFixed(2)}°)`)
      return true
    }

    // Track whether residual is improving — early abort if diverging
    // (e.g., if max residual has increased for 3 consecutive iterations)
  }

  console.debug(`[TopologySolver] Loop refinement did not converge after ${MAX_ITERATIONS} iterations`)
  return false
}
```

#### Important: Which Edges to Refine

The refinement must iterate over **ALL edges in the component**, not just the loop-closing edges. Only correcting the failing edges would leave the tree edges violated. The Jacobi projector must simultaneously satisfy all constraints — tree edges and loop-closing edges alike.

---

### Edge Cases and Consequences

1. **Genuinely infeasible geometry**: If parts physically cannot form a closed loop (e.g., wrong rod lengths for a square), refinement will fail to converge within `maxIterations` and return `false`. The solver then throws the same error as before. This is correct — we don't want to force impossible geometry.

2. **Near-zero-length rods in loops**: Green micro rods (16mm) with green 4-way connectors (port offset ~12.7mm) create very short effective edge lengths. Small angular errors produce proportionally large position errors. The stiffness constants must be conservative enough (k_pos=0.6, k_rot=0.5) to avoid oscillation in these tight geometries.

3. **Single-loop vs. multi-loop**: A component with one loop has exactly one redundant edge. A component with N redundant edges has N independent loops. The Jacobi projector handles both cases identically because it processes all edges uniformly.

4. **Large loops (20+ parts)**: More parts = more accumulated error in the BFS warm-start, but also more parts to distribute the correction across. Convergence may need more iterations. The 12-iteration cap should handle loops up to ~30 parts; beyond that, users would need to pass custom options.

5. **Mixed joint types in the same loop**: For this task, all joints are treated as `fixed` (position + direction constraints). Revolute/prismatic joints are handled in Task 13.4. A loop with a revolute joint may converge faster because the revolute DOF provides slack.

6. **Rotation correction ordering**: Multiple rotation corrections accumulated from different edges are applied by composing quaternions. Since rotations don't commute, the order matters slightly. We apply them in canonical edge-key order (the same sorting already used for edges). Because corrections are small (stiffness < 1), composition order has negligible effect.

7. **NaN/infinity guards**: If any correction produces NaN (e.g., from normalizing a zero vector), skip that correction. The `angle > 1e-6` guard handles the most common case (already-aligned directions).

8. **Transform mutation**: The function mutates `transforms` in place. If refinement fails, the transforms will be in a partially-corrected state. This is acceptable because the solver throws an error immediately after, and the transforms are not used further. If future code needs rollback, we should clone before refining.

9. **Rotation about port pivot, not part origin**: This is critical for short parts (like green micro rods, 16mm). Rotating a part about its origin moves the port position, which the position constraint then tries to undo — causing oscillation. By rotating about the port's world position (or the midpoint of the two mating ports), the port stays approximately in place and only the orientation changes. This dramatically improves convergence on tight geometries.

10. **Divergence detection**: Track the maximum residual at each iteration. If the residual increases for 3 consecutive iterations, abort early and return `false`. This catches cases where the geometry is infeasible or the stiffness constants cause instability, without wasting all 12 iterations.

11. **Underconstrained components**: If a component has many revolute/cylindrical joints, parts with free DOFs may drift during refinement. A mild regularization toward the BFS warm-start (e.g., add a small penalty `k_reg * (position - initial_position)` to the position delta) can prevent wild motion. Only add if drift is observed in practice — the BFS warm-start should generally be close enough that this isn't needed.

9. **Impact on existing non-loop builds**: None. Task 13.1 ensures `refineLoopComponent` is only called when loops have failing residuals. Tree-only components skip this entirely.

10. **Impact on the TopologyEditor UI**: When refinement succeeds, the user sees a valid build instead of an error. The status message changes from "Topology has issues" to "Applied COMPACT topology (N parts, M connections)". No UI code changes needed.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — replace stub `refineLoopComponent` with full implementation

### Files NOT Modified

- No other files need changes for this task

---

### Tests and Validation

1. **Octagon test** (the user's reported bug): 8×gc4 + 8×gsr in a loop must solve successfully. Add to `topologySolver.test.ts`.
2. **Triangle test**: The triangle from Issue #4 should still pass (it already passes with relaxed tolerances; refinement should make it converge tighter).
3. **Open chain regression**: A simple rod-connector chain with no loops must produce identical results to pre-Task-13 code.
4. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
5. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] `refineLoopComponent` implements Jacobi iterative constraint projection
- [ ] Position constraints (port coincidence) are enforced
- [ ] Direction constraints (anti-parallel port directions) are enforced
- [ ] Root part is pinned (gauge fixed) per component
- [ ] Corrections are accumulated and applied simultaneously (Jacobi, not Gauss-Seidel)
- [ ] Early exit on convergence, bounded by `maxIterations`
- [ ] The user's octagon loop (8×gc4 + 8×gsr) solves without error
- [ ] Existing triangle loop from Issue #4 still solves
- [ ] Open-chain builds produce identical results to pre-Task-13 behavior
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.2 status
- [ ] Committed with message `feat(solver): implement Jacobi iterative loop refinement (Task 13.2)`
