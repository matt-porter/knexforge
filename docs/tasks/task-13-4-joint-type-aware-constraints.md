## Task 13.4: Joint-Type-Aware Constraints (Revolute, Prismatic, Cylindrical)

**Phase**: 13 — Iterative Constraint Solver for Loop Closure  
**Depends on**: Task 13.3 (Twist and Roll Snapping)  
**Blocked by**: Task 13.3  
**Estimated effort**: 2–3 hours

---

### Problem Statement

Tasks 13.2 and 13.3 treat all connections as **fixed joints** — enforcing full position coincidence, direction alignment, and discrete roll. This is correct for most K'Nex connections (rod end snapped into a connector's edge hole), but K'Nex also has joints with free degrees of freedom:

- **Revolute joints** (rod through a rotational hole — e.g., motor axles): free to rotate around the hole axis.
- **Prismatic joints** (rod through a slider hole): free to translate along the hole axis.
- **Cylindrical joints** (rod through a connector's center hole via `center_axial` ports): physically free to both rotate AND slide along the axis. This is the most common "loose" joint in K'Nex and is **currently misclassified as revolute** by `inferJointType()`.

The solver must **actively exploit** these free DOFs during refinement — not just passively ignore them. When a loop has a cylindrical joint, the solver should slide the rod along the axis to help close the loop. This is the difference between "don't penalize axial error" (passive) and "use the free translation to minimize total residual" (active).

---

### Joint DOF Table

| Joint Type   | Position (3 DOF)            | Direction (2 DOF)    | Roll (1 DOF)             | Total Constrained | Free DOFs |
|-------------|----------------------------|---------------------|--------------------------|-------------------|-----------|
| `fixed`      | All 3 constrained           | 2 constrained        | 1 constrained (snapped)   | 6                 | 0         |
| `revolute`   | All 3 constrained           | 2 constrained        | **Free** (no roll snap)   | 5                 | 1 (roll)  |
| `prismatic`  | 2 constrained (⟂ to axis)   | 2 constrained        | 1 constrained (snapped)   | 5                 | 1 (axial translation) |
| `cylindrical`| 2 constrained (⟂ to axis)   | 2 constrained        | **Free** (no roll snap)   | 4                 | 2 (axial translation + roll) |

---

### Change 1: Internal DOF Detection (No New Public Joint Type)

After full impact analysis, introducing `cylindrical` as a public joint type would cascade across **10+ files**: `types/parts.ts`, `snapHelper.ts`, `PortIndicators.tsx`, `rapierSimulator.ts`, `pybullet.py`, `topologyCompactFormat.ts`, `shorthand_parser.py`, `dataset_generator.py`, and more. Most of these surfaces don't need cylindrical semantics — only the refinement loop does.

**Approach**: Keep the existing 3-value joint type union (`fixed | revolute | prismatic`) in all public interfaces. Instead, detect the extra DOF **internally** in the refinement loop by inspecting port IDs:

```typescript
/** Check if a connection has axial slide freedom (rod through center hole). */
function hasAxialFreedom(edge: ResolvedConnection, partDefs: Map<string, KnexPartDef>): boolean {
  return edge.from_port.startsWith('center_axial') || edge.to_port.startsWith('center_axial')
}

/** Check if a connection has roll freedom (revolute or center-axial). */
function hasRollFreedom(edge: ResolvedConnection): boolean {
  return edge.joint_type === 'revolute' || hasAxialFreedom(edge, partDefs)
}
```

This avoids all cascading type changes while still giving the solver the DOF information it needs. The rest of the application continues to treat center-axial connections as `revolute` (which is already close — they do have free roll).

#### Why NOT a public `cylindrical` type (yet)

| Surface | Would need changes | Actually needs cylindrical semantics? |
|---------|-------------------|--------------------------------------|
| `types/parts.ts` | Type union update | No — interactive builder always snaps to fixed position |
| `snapHelper.ts` | `inferJointType` return type | No — doesn't even check `center_axial` today |
| `PortIndicators.tsx` | Variant type + display | No — user sees same snap behavior regardless |
| `rapierSimulator.ts` | Joint creation switch | Yes eventually, but separate physics task |
| `pybullet.py` | Constraint creation | Yes eventually, but separate physics task |
| `topologyCompactFormat.ts` | New operator needed | No — `~~` (revolute) is close enough for serialization |
| `shorthand_parser.py` | New operator | No — same reason |
| `dataset_generator.py` | Training data labels | No — would pollute training data with rare type |

**Future task**: When we tackle physics simulation accuracy for center-axial joints (Rapier should allow axial slide, PyBullet should use appropriate constraints), we can promote `cylindrical` to a public type. That's a Phase 14+ concern.

#### No UI/UX changes needed for manual building

The interactive builder does **not** need a "slide along axis" affordance because:

1. **Manual placement is intentional**: When a user snaps a rod to a center hole, they are placing it at a specific position. The `center_axial_1` port has a fixed local position (the rod's midpoint). This is correct.
2. **Axial freedom is a solver concern**: The refinement loop exploits axial slide to close loops. The user never interacts with this — they define the topology, and the solver figures out positions.
3. **If a user wants a rod at a non-center position**, they would need a different port definition (e.g., `center_axial_offset_10mm`). This is a part library concern, not a UI concern.

---

### Change 2: DOF-Aware Position Correction in `refineLoopComponent()`

Implement the `maskFreeDOFs` function stubbed in Task 13.2:

```typescript
function maskPositionError(
  posError: Vector3,
  edge: ResolvedConnection,
  transforms: Map<string, Transform>,
  partDefs: Map<string, KnexPartDef>,
): Vector3 {
  const hasFreeAxial = edge.joint_type === 'prismatic' || hasAxialFreedom(edge, partDefs)

  if (!hasFreeAxial) {
    // Fixed and revolute: all 3 position DOFs are constrained — use full error
    return posError.clone()
  }

  // Prismatic or cylindrical (center-axial): remove the axial component (free to slide)
  // Axis source: use the port direction that defines the sliding axis.
  // For prismatic: the slider_hole port direction.
  // For center-axial: the center_axial port direction (rod's main axis).
  // In both cases, the port direction IS the sliding axis, so using fromPort is correct
  // (both ports should have anti-parallel directions; either works after normalization).
  const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
  const fromTransform = transforms.get(edge.from_instance)!
  const axis = getWorldPortPose(fromTransform, fromPort).direction.clone().normalize()

  const axialComponent = posError.dot(axis)
  return posError.clone().sub(axis.clone().multiplyScalar(axialComponent))
}
```

This **actively exploits** the free axial DOF: by removing the axial error component from corrections, the solver naturally lets the parts slide to whatever axial position minimizes the remaining (perpendicular) error. The other constraints in the loop pull the parts into the optimal axial position as a side effect.

---

### Change 3: DOF-Aware Roll Correction in `snapRollAngles()`

```typescript
// Skip roll correction for connections with free roll (revolute, or center-axial = cylindrical)
if (hasRollFreedom(edge)) {
  // Unless fixed_roll is explicitly set (user/dataset override)
  if (!edge.fixed_roll) continue
}
```

---

### Change 4: No Changes to Python Core, Physics Engines, or Serialization

Because `cylindrical` is an **internal solver concept** (detected via port ID inspection, not stored as a joint type), no changes are needed in:

- `src/core/snapping.py` — `infer_joint_type` continues to return `revolute` for center-axial. The public API is unchanged.
- `frontend/src/services/rapierSimulator.ts` — continues to create `RevoluteImpulseJoint` for center-axial. Axial slide freedom in physics simulation is a separate future task.
- `src/core/physics/pybullet.py` — same, continues to use 2-anchor revolute constraints.
- `topologyCompactFormat.ts` / `shorthand_parser.py` — `~~` operator still maps to `revolute`.
- `types/parts.ts` / `PortIndicators.tsx` — type unions unchanged.

**Future work (Phase 14+)**: If physics simulation needs accurate cylindrical joints (rod can slide through center hole under gravity/force), that would be a dedicated task covering Rapier `GenericJoint` configuration, PyBullet constraint changes, and potentially a public `cylindrical` joint type. This is not needed for the loop solver.

---

### Edge Cases and Consequences

1. **No public API changes**: Because `cylindrical` is detected internally via port ID inspection (`center_axial` prefix), the public `joint_type` union remains `fixed | revolute | prismatic` everywhere. No backwards compatibility concerns, no schema changes, no serialization changes.

2. **Existing `revolute` behavior for center-axial**: The public joint type remains `revolute` for center-axial connections. Only the refinement loop additionally detects the axial slide freedom. All other systems (interactive builder, physics, export, datasets) continue to treat these as revolute.

3. **Rod sliding too far**: With free axial translation in the refinement loop, a rod could theoretically slide far from its original position. In practice, the BFS warm-start places rods near the correct position, and the Jacobi corrections are small (stiffness < 1). The rod should only slide a few mm. If extreme sliding occurs, add a bounded axial range constraint (e.g., ±half the rod length from center). This is a guardrail, not expected to trigger.

4. **`fixed_roll` override**: A revolute/center-axial connection with `fixed_roll: true` should constrain roll but the `hasAxialFreedom` check still allows free axial translation. These are independent DOFs — `fixed_roll` controls rotation, `hasAxialFreedom` controls translation. The masking logic handles this naturally.

5. **Multiple center-axial joints in one loop**: If a loop has several center-axial connections, each provides an extra free DOF. The solver has more slack to close the loop but also more underdetermined geometry. The Jacobi projector handles this naturally — underdetermined DOFs settle to values that minimize the remaining constrained errors.

6. **No physics engine changes**: Rapier and PyBullet continue creating the same joint types as before. The topology solver's internal DOF detection does not propagate to physics. If physics simulation later needs to allow axial sliding (e.g., rod slipping through a center hole under gravity), that's a separate Phase 14+ task.

7. **No UI changes needed**: The interactive builder snaps parts to fixed port positions. Users don't need a "slide along axis" affordance because manual placement is intentional. Axial freedom is only exploited by the automated loop solver.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — add `hasAxialFreedom()`, `hasRollFreedom()` helpers, update `maskPositionError()` and `snapRollAngles()` in the refinement loop

### Files NOT Modified (By Design)

- `types/parts.ts` — no type union changes
- `snapHelper.ts` — interactive builder unchanged
- `PortIndicators.tsx` — variant UI unchanged
- `rapierSimulator.ts` — physics joints unchanged
- `pybullet.py` — physics constraints unchanged
- `topologyCompactFormat.ts` / `shorthand_parser.py` — serialization unchanged
- `src/core/snapping.py` — public `infer_joint_type` unchanged
- `src/core/parts/models.py` — pydantic models unchanged

---

### Tests and Validation

1. **Axial freedom detection test**: Connect `rod.center_axial_1` to `connector.center`. Assert `hasAxialFreedom()` returns `true`. Assert `inferJointType()` still returns `'revolute'` (public type unchanged).
2. **Center-axial loop test**: Build a loop where one connection uses `center_axial`. Assert loop closes (the free axial DOF absorbs length error).
3. **Position masking test**: For a center-axial connection, create a position error with both axial and perpendicular components. Assert `maskPositionError` removes only the axial component.
4. **Prismatic masking test**: Same for a prismatic connection — axial component removed.
5. **Fixed joint masking test**: For a fixed connection, assert `maskPositionError` returns the full error (no masking).
6. **Revolute regression**: Explicit `revolute` connections (motor axle) still behave as before (free roll, full position constraint, no axial freedom).
7. **Physics regression**: Run existing Rapier/Vitest physics tests — no changes to physics, so they must pass unchanged.
8. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
9. Run: `cd frontend && npm run type-check`

---

### Completion Criteria

- [ ] `hasAxialFreedom()` correctly identifies center-axial connections
- [ ] `hasRollFreedom()` correctly identifies revolute + center-axial connections
- [ ] `maskPositionError` removes axial component for prismatic and center-axial connections
- [ ] `maskPositionError` preserves full error for fixed and revolute connections
- [ ] Roll snapping is skipped for connections with roll freedom (unless `fixed_roll`)
- [ ] No changes to any public types, interfaces, or type unions
- [ ] No changes to physics engines, serialization, or Python core
- [ ] Existing tests pass unchanged (no type errors, no behavior changes outside refinement)
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 13.4 status
- [ ] Committed with message `feat(solver): add DOF-aware constraints for revolute/prismatic/center-axial (Task 13.4)`
