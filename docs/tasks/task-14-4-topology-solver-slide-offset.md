## Task 14.4: Topology Solver — Place Parts with `slide_offset`

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (model), Task 14.2 (snapping)  
**Blocked by**: Task 14.2  
**Estimated effort**: 2–3 hours

---

### Problem Statement

The topology solver (`frontend/src/services/topologySolver.ts`) uses `buildPlacementCandidate()` and `connectionResidual()` to compute transforms for parts defined in shorthand notation. These functions currently read port positions directly from the part definition. With `slide_offset` support, the solver must apply the offset when computing placement transforms and when measuring residuals.

This task updates the topology solver to correctly handle `slide_offset` during BFS placement, residual calculation, and the iterative loop refinement (Phase 13).

---

### Objectives

1. Modify `buildPlacementCandidate()` to apply `slide_offset` to the appropriate port before computing the transform.
2. Modify `connectionResidual()` to apply `slide_offset` when computing world port positions.
3. Modify `getWorldPortPose()` (solver-local) to accept an optional `slideOffset` parameter.
4. Thread `slide_offset` through the BFS placement loop.
5. Update the Jacobi refinement loop to handle `slide_offset` in constraint evaluation.

---

### Implementation Details

#### 1. Port position with offset

Add a helper to create an offset port for placement calculations:

```typescript
function applySlideOffset(port: Port, slideOffset: number): Port {
  if (slideOffset === 0) return port
  return {
    ...port,
    position: [port.position[0] + slideOffset, port.position[1], port.position[2]],
  }
}
```

#### 2. `buildPlacementCandidate()` changes

The function currently takes `anchorPort` and `placingPort` directly. Add `slideOffset` parameter and apply it to the port that is on the rod side:

```typescript
function buildPlacementCandidate(
  anchor: Transform,
  anchorPort: Port,
  placingPort: Port,
  twistDeg: number,
  anchorDef: KnexPartDef,
  placingDef: KnexPartDef,
  fixedRoll: boolean,
  slideOffset: number = 0,  // NEW
): Transform {
  // Determine which port is on the rod and apply offset
  const isPlacingRod = placingDef.category === 'rod'
  const isAnchorRod = anchorDef.category === 'rod'
  
  if (isPlacingRod && isSlidablePort(placingPort.id) && slideOffset !== 0) {
    placingPort = applySlideOffset(placingPort, slideOffset)
  } else if (isAnchorRod && isSlidablePort(anchorPort.id) && slideOffset !== 0) {
    anchorPort = applySlideOffset(anchorPort, slideOffset)
  }
  
  // ... rest of existing placement logic unchanged
}
```

#### 3. `connectionResidual()` changes

Apply slide offset when computing the world-space port pose for residual measurement:

```typescript
function connectionResidual(
  connection: ResolvedConnection,
  transforms: Map<string, Transform>,
  partDefs: Map<string, KnexPartDef>,
): { distance: number; angleDeg: number } {
  // ... existing transform/port lookups ...
  
  // Apply slide offset to the appropriate port
  let adjustedFromPort = fromPort
  let adjustedToPort = toPort
  if (connection.slide_offset && connection.slide_offset !== 0) {
    const fromDef = partDefs.get(connection.from_instance)
    const toDef = partDefs.get(connection.to_instance)
    if (fromDef?.category === 'rod' && isSlidablePort(fromPort.id)) {
      adjustedFromPort = applySlideOffset(fromPort, connection.slide_offset)
    } else if (toDef?.category === 'rod' && isSlidablePort(toPort.id)) {
      adjustedToPort = applySlideOffset(toPort, connection.slide_offset)
    }
  }
  
  const fromPose = getWorldPortPose(fromTransform, adjustedFromPort)
  const toPose = getWorldPortPose(toTransform, adjustedToPort)
  // ... rest unchanged
}
```

#### 4. BFS placement loop

In the main `solveTopology()` function, when placing a part via BFS, pass the connection's `slide_offset` to `buildPlacementCandidate()`:

```typescript
// In the BFS loop where candidate is built:
const candidate = buildPlacementCandidate(
  anchorTransform,
  anchorPort,
  placingPort,
  connection.twist_deg,
  anchorDef,
  placingDef,
  connection.fixed_roll,
  connection.slide_offset,  // NEW
)
```

#### 5. Refinement loop

The Jacobi iterative constraint solver (Task 13.2) evaluates constraints using `connectionResidual`. Since that function now handles `slide_offset`, the refinement loop should work correctly without further changes. However, verify that the constraint Jacobian correctly accounts for the offset port position.

---

### Edge Cases

1. **Two slidable ports in the same connection**: If both `from_port` and `to_port` are slidable (e.g., rod-to-rod via center ports), apply the offset to the `from` side only.
2. **Connections with `slide_offset=0`**: Must produce identical results to current behavior.
3. **Loop-closing edges with `slide_offset`**: The residual check must use the offset position. If the loop can't close because of the offset, the solver reports the same `loop_constraint_violation` error.
4. **Joint-type-aware refinement**: For `center_axial` connections with `slide_offset`, the solver already treats axial translation as a free DOF (Task 13.4). The `slide_offset` shifts the equilibrium position — the solver should use the offset port position as the target, not the default.

---

### Files Modified

- `frontend/src/services/topologySolver.ts` — all changes in this file:
  - `applySlideOffset()` and `isSlidablePort()` helpers
  - `buildPlacementCandidate()` — apply offset
  - `connectionResidual()` — apply offset
  - BFS placement loop — pass offset

### Files NOT Modified

- Python topology/snapping (already handled in Task 14.2)
- Part JSON files
- UI (Task 14.5/14.6)

---

### Tests and Validation

1. **Topology solver tests** (`frontend/src/services/__tests__/topologySolver.test.ts`):
   - Solve a chain with `slide_offset=0` produces identical results to current behavior
   - Solve a chain where one connector is offset +20mm on a 128mm rod — verify the connector position is 20mm from center toward end2
   - Solve a loop where one connection has `slide_offset` — verify residual is within tolerance
   - Verify two connectors on the same rod at different offsets (+20 and -20) both resolve correctly

2. Run: `cd frontend && npx vitest run src/services/__tests__/topologySolver.test.ts`
3. Run: `cd frontend && npm run type-check`
4. All existing topology solver tests pass unchanged.

---

### Completion Criteria

- [ ] `buildPlacementCandidate` applies `slide_offset` to the correct port
- [ ] `connectionResidual` applies `slide_offset` when measuring residual
- [ ] BFS placement loop passes `slide_offset` through
- [ ] Existing solver tests pass unchanged (backward compatible)
- [ ] New tests for offset placement and residual calculation
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 14.4 status
- [ ] Committed with message `feat(solver): apply slide_offset in topology solver (Task 14.4)`

---

### Project Basics (for standalone agents)

- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **Topology solver**: `frontend/src/services/topologySolver.ts` — BFS-based placement with iterative loop refinement (Phase 13).
- **Separation of concerns**: Topology solver is pure TypeScript, no Python calls.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
