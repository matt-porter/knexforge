## Task 13.3: Twist and Allowed-Angle Snapping During Refinement

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.2 (Jacobi Iterative Constraint Solver)  
**Blocked by**: Task 13.2  
**Estimated effort**: 1.5–2 hours

---

### Problem Statement

Task 13.2 implements position + direction constraints, but ignores **roll/twist** around the mating axis. In K'Nex, connectors have discrete allowed twist angles (typically `[0, 90, 180, 270]`) that determine how a rod sits in the port. The BFS solver already handles these via `candidateAnglesForConnection()` and `edge.twist_deg` / `edge.fixed_roll`.

After Jacobi refinement redistributes position/direction errors, the parts' roll orientations may have drifted slightly from their discrete snapped values. This task adds a **periodic roll-snapping pass** inside the refinement loop to keep twists quantized to valid values while still allowing the loop to close.

Without this, refined builds may display parts at visually incorrect roll angles — rods that should be flat in the connector plane may be rotated a few degrees off, or connectors may appear twisted relative to their neighbors.

---

### Algorithm: Gradual Roll Snapping

#### When to Snap

Every 2–3 Jacobi iterations (not every iteration), measure the current roll angle for each connection and apply a gradual correction toward the nearest allowed angle. Doing this every iteration would fight against the position/direction corrections and cause oscillation.

#### Which Connections Get Roll Snapping

Not all connections need discrete roll snapping. The rule:

1. **Always snap** if `edge.fixed_roll === true` — the user/dataset explicitly set the roll angle.
2. **Snap** if either port has `allowed_angles_deg.length > 1` — the port offers discrete angle choices (e.g., connector `rod_hole` ports have `[0, 90, 180, 270]`). Note: `candidateAnglesForConnection()` already picks the larger list, so if either side has discrete choices, they apply.
3. **Skip** if `allowed_angles_deg === [0]` on both sides AND `fixed_roll === false` — this means both ports are rotationally unconstrained (rare, but possible for two rod ends meeting).
4. **Skip** for revolute/cylindrical joints (free roll) — handled in Task 13.4.

In practice, most rod-end↔rod-hole connections DO have discrete roll snapping because connector `rod_hole` ports declare `[0, 90, 180, 270]`. This is by design — it keeps rods aligned to the connector's plane for visual consistency.

#### How to Measure Roll

For a connection between anchor part `i` (port `P_i`) and placed part `j` (port `P_j`):

1. Compute the **mating axis** `a`: the world-space direction of port `P_i` (or the average of `dir_i` and `-dir_j` — they should be nearly parallel after direction correction).

2. Choose a **reference perpendicular vector** in each part's frame. This must be deterministic and handle all port orientations:
   - For each port, define a **local reference vector** perpendicular to the port direction:
     - If `|port.direction × [0, 1, 0]| > 0.1`: use `normalize(port.direction × [0, 1, 0])` as the reference
     - Otherwise (port direction near ±Y): use `normalize(port.direction × [0, 0, 1])` as the reference
   - Transform each reference to world space via the part's rotation quaternion
   - Project both onto the plane perpendicular to mating axis `a`

   This rule is deterministic, works for all port orientations, and doesn't depend on part category. It's the same "stable perpendicular" pattern used in `buildPlacementCandidate` for side-clip orientation.

3. Compute the **signed angle** between these two projected vectors around axis `a` using `atan2(cross·a, dot)`. This is the current effective roll.

4. Find the **nearest allowed angle** from `candidateAnglesForConnection(anchorPort, placingPort)` (or `[edge.twist_deg]` if `edge.fixed_roll` is true). Use shortest-path comparison to handle 360°/0° wraparound.

5. Compute the **roll correction angle** = `(nearest_allowed - current_roll)`, normalized to `[-180°, +180°]` for shortest path, then clamped to a small maximum per step (e.g., `±5°` per snap pass) to avoid sudden jumps.

#### How to Apply Roll Correction

Apply a rotation of `correction_angle` about the mating axis `a` to part `j` (or distribute between `i` and `j` if neither is root):

```typescript
const correctionQuat = new Quaternion().setFromAxisAngle(matingAxis, correctionAngle)
transform_j.rotation.premultiply(correctionQuat).normalize()
// Re-translate so the port position stays coincident:
transform_j.position = portPose_i.position.clone()
  .sub(localPortPos_j.clone().applyQuaternion(transform_j.rotation))
```

Note: after rotating for roll, the port position shifts because the port is offset from the part origin. We must re-seat the position to maintain the position constraint.

---

### Implementation Details

#### Integration Point

Inside the Jacobi iteration loop in `refineLoopComponent()`:

```typescript
for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
  // ... existing Jacobi position + direction pass ...

  // Periodic roll snap (every 3 iterations, starting from iteration 2)
  if ((iter + 1) % 3 === 0) {
    snapRollAngles(transforms, allEdges, partDefs, rootId)
  }

  // ... existing convergence check ...
}
```

#### `snapRollAngles` Function

```typescript
function snapRollAngles(
  transforms: Map<string, Transform>,
  edges: ResolvedConnection[],
  partDefs: Map<string, KnexPartDef>,
  rootId: string,
): void {
  for (const edge of edges) {
    // Skip if this edge has no twist constraint
    // (rod_end to rod_hole with allowed_angles_deg = [0] means roll doesn't matter)
    const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
    const toPort = getPartPort(partDefs.get(edge.to_instance)!, edge.to_port)!

    const allowedAngles = edge.fixed_roll
      ? [edge.twist_deg]
      : candidateAnglesForConnection(fromPort, toPort)

    // Only snap if there are meaningful discrete choices
    if (allowedAngles.length <= 1 && allowedAngles[0] === 0) continue

    // Measure current roll, find nearest allowed, apply gradual correction
    // ... (see algorithm above)
  }
}
```

---

### Edge Cases and Consequences

1. **Rod-end-to-rod-hole connections**: Most rod ends have `allowed_angles_deg: [0]`, meaning roll is unconstrained (the rod can spin freely in the hole). For these connections, roll snapping should be **skipped** — applying a roll correction here would be meaningless and could disrupt other constraints.

2. **Rod-side (tangent) connections**: These are the connections where roll matters most. A rod clipped to a connector's side must be oriented correctly (flat in the connector plane for flat edges, perpendicular for 3D edges). The existing `isPhysicallyValidRodConnectorOrientation` check validates this. Roll snapping must produce orientations that pass this check.

3. **`fixed_roll` edges**: When `edge.fixed_roll === true`, the twist angle is exactly `edge.twist_deg` with no alternatives. The snap target is singular and the correction should converge the roll exactly to that value.

4. **Roll discontinuity at 360°/0°**: When measuring signed angles, ensure the shortest-path angle is used. If current roll is 350° and nearest allowed is 0°, the correction should be +10° not -350°.

5. **Interaction with position/direction corrections**: Roll snapping changes the part's orientation, which can slightly shift port positions (because ports are offset from the part center). The subsequent Jacobi position pass will correct this. The interleaving frequency (every 3 iterations) is chosen to give position/direction corrections time to re-stabilize between roll adjustments.

6. **Performance**: Roll measurement involves a few vector operations per edge. With typical builds of <50 edges, this adds negligible overhead.

7. **Builds with no roll constraints**: If all connections are simple rod-end-to-rod-hole with `allowed_angles_deg: [0]`, the roll snap pass is a no-op (all connections skipped). No performance or correctness impact.

8. **Reference vector choice**: The perpendicular reference vector must be chosen consistently. Use the port's local +Y axis as the reference for all port types. If the port direction is nearly parallel to local +Y (e.g., for center ports pointing along Y), fall back to local +Z. This matches the existing `buildPlacementCandidate` side-clip orientation logic.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — add `snapRollAngles()` function, integrate into refinement loop

---

### Tests and Validation

1. **Roll preservation test**: Build a 2-connector chain with explicit `twist_deg: 90, fixed_roll: true`. Verify the solved roll angle is exactly 90° after refinement.
2. **Octagon roll test**: The octagon should solve with all connectors in a consistent planar orientation (all connector Z-axes parallel). Verify by checking that connector world Z-axes dot product ≈ 1.0.
3. **No-roll-constraint regression**: A simple rod-end-to-rod-hole chain must produce identical results with and without roll snapping (since roll snapping is skipped for these connections).
4. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
5. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] `snapRollAngles()` correctly measures current roll angle for each connection
- [ ] Roll is snapped to nearest `allowed_angles_deg` (or `twist_deg` if `fixed_roll`)
- [ ] Snap correction is gradual (clamped per pass) to avoid oscillation
- [ ] Roll snapping is skipped for connections with no meaningful discrete choices
- [ ] 360°/0° wraparound is handled correctly (shortest-path angle)
- [ ] Position is re-seated after roll correction to maintain port coincidence
- [ ] Interleaving with Jacobi passes does not cause convergence regression
- [ ] All existing tests pass
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.3 status
- [ ] Committed with message `feat(solver): add twist/roll snapping during loop refinement (Task 13.3)`
