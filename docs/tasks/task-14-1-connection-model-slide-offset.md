## Task 14.1: Add `slide_offset` to Connection Model & Part Schema

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: None  
**Blocked by**: None  
**Estimated effort**: 1–2 hours

---

### Problem Statement

Currently, `center_axial` and `center_tangent` ports are defined at fixed positions (the rod midpoint) in every rod's JSON definition. For example, on a 128mm red rod, all center ports sit at `[64, 0, 0]`. This means only one connector can attach to the center of a rod, and it's always at exactly the midpoint.

Real K'Nex allows connectors to slide freely along the length of a rod. To support multiple connectors on the same rod and arbitrary positioning, we need a `slide_offset` parameter on connections that shifts the effective port position along the rod's main axis (local X).

This task adds the `slide_offset` field to the Connection model in both Python core and TypeScript frontend, with full backward compatibility (defaulting to `0.0`).

---

### Objectives

1. Add `slide_offset: float` (default `0.0`) to the Python `Connection` model in `src/core/parts/models.py`.
2. Add `slide_offset?: number` (optional, default `0`) to the TypeScript `Connection` interface in `frontend/src/types/parts.ts`.
3. Add `slide_offset` support to the topology solver's `ResolvedConnection` and `TopologyConnection` interfaces in `frontend/src/services/topologySolver.ts`.
4. Update `buildStateToTopology` and `canonicalizeTopology` to preserve `slide_offset`.
5. Ensure all existing code continues to work with `slide_offset` absent or `0`.

---

### Implementation Details

#### 1. Python `Connection` model (`src/core/parts/models.py`)

```python
class Connection(BaseModel):
    from_instance: str
    from_port: str
    to_instance: str
    to_port: str
    joint_type: Literal["fixed", "revolute", "prismatic"] = Field(default="fixed")
    twist_deg: float = Field(default=0.0)
    fixed_roll: bool = Field(default=False)
    slide_offset: float = Field(
        default=0.0,
        description="Offset in mm along the rod's main axis from the port's default position. "
                    "Only meaningful for center_axial and center_tangent ports."
    )
```

#### 2. TypeScript `Connection` interface (`frontend/src/types/parts.ts`)

```typescript
export interface Connection {
  from_instance: string
  from_port: string
  to_instance: string
  to_port: string
  joint_type?: 'fixed' | 'revolute' | 'prismatic'
  twist_deg?: number
  fixed_roll?: boolean
  slide_offset?: number  // mm offset along rod axis from port default position
}
```

#### 3. Topology solver types (`frontend/src/services/topologySolver.ts`)

Add `slide_offset` to `TopologyConnection`, `ResolvedConnection`, and pass it through in `validateAndResolveConnections` and `buildStateToTopology`.

#### 4. Determine slidable range

Add a utility function (both Python and TS) to compute the valid slide range for a given port on a rod:

```python
def get_slide_range(part: KnexPart, port_id: str) -> tuple[float, float] | None:
    """Return (min_offset, max_offset) in mm for a slidable port, or None if not slidable."""
```

The range is determined by the rod's `end1` and `end2` positions. For a 128mm rod with center ports at `[64, 0, 0]`:
- `end1` is at `[0, 0, 0]`, `end2` is at `[128, 0, 0]`
- The connector has a physical radius (~7mm for a standard connector)
- Valid range: `[-(64 - connector_clearance), +(64 - connector_clearance)]` ≈ `[-57, +57]`

The connector clearance (minimum distance from rod ends) should be read from the port's `slide_clearance_mm` field (see section 5 below).

#### 5. Data-driven clearance in part schema

Add `slide_clearance_mm` (optional, default from category) to the Port model:

**JSON schema** (`schema/knex-part.json`), inside the port properties:
```json
"slide_clearance_mm": {
  "type": "number",
  "minimum": 0,
  "description": "Minimum spacing in mm required between this port's connector and adjacent slide connections on the same rod. Defaults to 15mm for connectors."
}
```

**Python model** (`src/core/parts/models.py`):
```python
class Port(BaseModel):
    # ... existing fields ...
    slide_clearance_mm: float = Field(
        default=15.0,
        description="Minimum spacing between this connector and adjacent slide connections"
    )
```

**TypeScript type** (`frontend/src/types/parts.ts`):
```typescript
export interface Port {
  // ... existing fields ...
  slide_clearance_mm?: number  // default 15.0
}
```

This replaces all hard-coded `connectorDiameterMm = 15.0` and `CONNECTOR_END_CLEARANCE_MM = 7.0` constants.

The `get_slide_range()` utility should read `slide_clearance_mm` from the port definition to compute the valid offset range (the clearance from rod ends = `slide_clearance_mm / 2`).

---

### Constraints & Rules

- `slide_offset` only has meaning for ports whose ID starts with `center_axial` or `center_tangent`. For other ports (e.g., `end1`, `end2`, `A`, `B`), the field is ignored.
- The offset is along the rod's local X axis (the rod's main axis), measured from the port's default position.
- Positive offset = toward `end2`, negative = toward `end1`.
- The field is optional with default `0.0` — all existing connections remain valid with no changes.

---

### Files Modified

- `src/core/parts/models.py` — add `slide_offset` field to `Connection`, add `slide_clearance_mm` field to `Port`
- `frontend/src/types/parts.ts` — add `slide_offset` to `Connection` interface, add `slide_clearance_mm` to `Port` interface
- `frontend/src/services/topologySolver.ts` — add to `TopologyConnection`, `ResolvedConnection`, pass through in resolver and builder
- `src/core/parts/models.py` or new utility — add `get_slide_range()` helper
- `frontend/src/helpers/snapHelper.ts` or new utility — add TS `getSlideRange()` helper
- `schema/knex-part.json` — add `slide_clearance_mm` to port properties

### Files NOT Modified

- Part JSON files — port default positions remain at the midpoint
- Snapping logic — handled in Task 14.2
- File I/O — handled in Task 14.3
- UI — handled in Task 14.5/14.6

---

### Tests and Validation

1. Add pytest tests in `src/core/tests/test_parts.py`:
   - `Connection` with `slide_offset=0` serializes/deserializes correctly
   - `Connection` with `slide_offset=25.5` serializes/deserializes correctly
   - `Connection` without `slide_offset` key defaults to `0.0`
   - `get_slide_range` returns correct ranges for different rod lengths (16mm, 54mm, 128mm)
   - `get_slide_range` returns `None` for non-slidable ports (`end1`, `A`)

2. Run: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v`
3. Run: `cd frontend && npm run type-check`
4. Verify all existing tests pass without modification.

---

### Completion Criteria

- [ ] Python `Connection` model has `slide_offset: float` field with default `0.0`
- [ ] TypeScript `Connection` interface has `slide_offset?: number`
- [ ] `get_slide_range()` utility implemented in both Python and TypeScript
- [ ] `slide_clearance_mm` field added to Port model (Python, TypeScript, JSON schema)
- [ ] Topology solver types updated to carry `slide_offset`
- [ ] All existing tests pass unchanged (backward compatible)
- [ ] New unit tests for `slide_offset` field and range calculation
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Phase 14 / Task 14.1 status
- [ ] Committed with message `feat(core): add slide_offset to Connection model (Task 14.1)`

---

### Project Basics (for standalone agents)

- **Python**: Code lives in `src/core/`. Run tests with `.\.venv\Scripts\python.exe -m pytest src/core/tests/`
- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **Conventions**: Use pydantic v2 models, type hints, Google-style docstrings. Follow existing code style.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
