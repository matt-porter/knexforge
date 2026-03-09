## Task 14.2: Snapping Engine — Apply `slide_offset` to Port Positions

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (Connection model with `slide_offset`)  
**Blocked by**: Task 14.1  
**Estimated effort**: 2–3 hours

---

### Problem Statement

The snapping engine (`src/core/snapping.py` and `frontend/src/helpers/snapHelper.ts`) currently reads port positions directly from the part definition JSON. These positions are fixed at the rod midpoint. With `slide_offset` now on the `Connection` model (Task 14.1), the snapping engine must offset the effective port position along the rod's main axis before computing alignment and validation.

This task modifies both Python and TypeScript snapping code to support `slide_offset`, so that `align_part_to_port` / `computeGhostTransform` place connectors at the correct offset position along the rod.

---

### Objectives

1. Modify `align_part_to_port()` in `src/core/snapping.py` to accept and apply `slide_offset`.
2. Modify `computeGhostTransform()` in `frontend/src/helpers/snapHelper.ts` to accept and apply `slide_offset`.
3. Create a shared helper `applySlideOffset(port, slideOffset, rodLength)` that returns a new port position shifted along the rod's local X axis.
4. Update `snap_ports()` in Python to accept and validate `slide_offset`.
5. Update `_port_world_pose()` to optionally accept a `slide_offset` parameter.

---

### Implementation Details

#### 1. Port position offset logic

The offset is applied **before** any rotation. For a center port with default position `[64, 0, 0]` and `slide_offset = +20`:
- Effective position = `[64 + 20, 0, 0]` = `[84, 0, 0]`

This works because the rod's main axis is always local X.

**Python helper** (add to `src/core/snapping.py`):

```python
def _apply_slide_offset(port: Port, slide_offset: float) -> Port:
    """Return a copy of the port with position shifted along the rod's local X axis."""
    if slide_offset == 0.0:
        return port
    new_pos = (port.position[0] + slide_offset, port.position[1], port.position[2])
    return port.model_copy(update={"position": new_pos})
```

**TypeScript helper** (add to `frontend/src/helpers/snapHelper.ts`):

```typescript
function applySlideOffset(port: Port, slideOffset: number): Port {
  if (slideOffset === 0) return port
  return {
    ...port,
    position: [port.position[0] + slideOffset, port.position[1], port.position[2]],
  }
}
```

#### 2. `align_part_to_port()` changes (`src/core/snapping.py`)

Add `slide_offset: float = 0.0` parameter. Apply offset to the placing port before computing alignment:

```python
def align_part_to_port(
    placing_instance: PartInstance,
    placing_port_id: str,
    target_instance: PartInstance,
    target_port_id: str,
    twist_deg: float = 0.0,
    fixed_roll: bool = False,
    slide_offset: float = 0.0,  # NEW
) -> tuple[...]:
    # ... existing normalization ...
    placing_port = placing_instance.get_port(placing_port_id)
    
    # Apply slide offset if this is a slidable port on a rod
    if slide_offset != 0.0 and _is_slidable_port(placing_port_id):
        placing_port = _apply_slide_offset(placing_port, slide_offset)
    
    # ... rest of alignment logic unchanged ...
```

Similarly, if the **target** port is the slidable one (connector being placed onto a rod's center port), the offset applies to the target port instead.

The key insight: `slide_offset` always applies to whichever port is on the rod side (the `center_axial_*` or `center_tangent_*` port). Determine which side is the rod and apply accordingly.

#### 3. `computeGhostTransform()` changes (`frontend/src/helpers/snapHelper.ts`)

Add `slideOffset: number = 0` parameter. Apply to the appropriate port's position:

```typescript
export function computeGhostTransform(
  placingPort: Port,
  targetPort: Port,
  targetWorldPos: Vector3,
  targetWorldDir: Vector3,
  angleDeg: number = 0,
  targetInstance?: PartInstance,
  placingDef?: KnexPartDef,
  targetDef?: KnexPartDef,
  isPlacingRod?: boolean,
  slideOffset: number = 0,  // NEW
): { position: Vector3; rotation: Quaternion } {
```

If `isPlacingRod` and the placing port is slidable, apply offset to `placingPort`. Otherwise if the target port is slidable, the `targetWorldPos` must be recalculated with the offset applied in world space.

#### 4. `_port_world_pose()` changes

Add optional `slide_offset` parameter:

```python
def _port_world_pose(
    instance: PartInstance, port_id: str, slide_offset: float = 0.0
) -> tuple[np.ndarray, np.ndarray]:
    port = instance.get_port(port_id)
    if slide_offset != 0.0 and _is_slidable_port(port_id):
        port = _apply_slide_offset(port, slide_offset)
    # ... rest unchanged
```

#### 5. Helper to identify slidable ports

```python
def _is_slidable_port(port_id: str) -> bool:
    """Return True if this port supports sliding along the rod axis."""
    return port_id.startswith("center_axial") or port_id.startswith("center_tangent")
```

---

### Edge Cases

1. **`slide_offset` on non-slidable ports**: Must be silently ignored (no error). This prevents breaking existing connections that happen to have `slide_offset=0`.
2. **Clamping**: If `slide_offset` would push the port beyond the rod ends, clamp to the valid range from `get_slide_range()` (Task 14.1).
3. **Direction vectors unchanged**: The port's `direction` does not change with `slide_offset` — only `position` shifts.
4. **Both ports slidable**: In theory both ports in a connection could be slidable (e.g., two rods connected via center ports). The offset applies to the rod side of the connection. If both are rods, apply to the `from` side.
5. **Existing connections with no `slide_offset`**: Default `0.0` means the port stays at its JSON-defined position. No behavior change.

---

### Files Modified

- `src/core/snapping.py` — `_apply_slide_offset`, `_is_slidable_port`, update `align_part_to_port`, `snap_ports`, `_port_world_pose`
- `frontend/src/helpers/snapHelper.ts` — `applySlideOffset`, update `computeGhostTransform`, `getPortWorldPose`

### Files NOT Modified

- Part JSON files — positions remain at midpoint
- Build store — handled in Task 14.4
- UI — handled in Task 14.5/14.6

---

### Tests and Validation

1. **Python tests** (`src/core/tests/test_snapping.py`):
   - `align_part_to_port` with `slide_offset=0` produces identical results to current behavior
   - `align_part_to_port` with `slide_offset=+20` on a 128mm rod shifts the connector 20mm toward end2
   - `align_part_to_port` with `slide_offset=-30` shifts toward end1
   - `snap_ports` with `slide_offset` validates the offset connection
   - Clamping: `slide_offset=+100` on a 128mm rod clamps to the valid max

2. **Frontend tests**: Verify `computeGhostTransform` with `slideOffset` produces correct ghost positions.

3. Run: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v`
4. Run: `cd frontend && npm run type-check`
5. All existing tests pass unchanged.

---

### Completion Criteria

- [ ] `_apply_slide_offset` and `_is_slidable_port` helpers implemented
- [ ] `align_part_to_port` accepts and applies `slide_offset`
- [ ] `computeGhostTransform` accepts and applies `slideOffset`
- [ ] Port world pose calculation supports offset
- [ ] Out-of-range offsets are clamped to valid range
- [ ] All existing snapping tests pass unchanged
- [ ] New tests for offset alignment added and passing
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 14.2 status
- [ ] Committed with message `feat(snapping): apply slide_offset to port alignment (Task 14.2)`

---

### Project Basics (for standalone agents)

- **Python**: Code lives in `src/core/`. Run tests with `.\.venv\Scripts\python.exe -m pytest src/core/tests/`
- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **Separation of concerns**: Python `src/core/` = pure domain logic. Frontend = React/Three.js UI. Never cross-import.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
