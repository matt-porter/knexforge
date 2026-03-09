## Task 14.5: Allow Multiple Connectors on the Same Rod

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (model), Task 14.2 (snapping)  
**Blocked by**: Task 14.2  
**Estimated effort**: 2–3 hours

---

### Problem Statement

Currently, the port occupancy system prevents more than one connector from attaching to the same center port on a rod. In `PortIndicators.tsx` (line ~146), a port is considered "occupied" if any existing connection references it, which means once a connector is attached to `center_tangent_y_pos`, no other connector can use that port.

With `slide_offset`, multiple connectors CAN coexist on the same rod as long as they don't physically occupy the same slot. This task replaces the blanket `port_reused` check for slidable ports with a precise **connection uniqueness key** model and adds collision detection between connectors on the same rod.

A slidable port connection is uniquely identified by the tuple `(rod_instance_id, slide_family, slide_offset)` where `slide_family` groups ports that physically occupy the same space:

- `"axial"` — for `center_axial_1`, `center_axial_2` (through the center hole)
- `"tangent_y"` — for `center_tangent_y_pos`, `center_tangent_y_neg` (same clip axis)
- `"tangent_z"` — for `center_tangent_z_pos`, `center_tangent_z_neg` (same clip axis)

**Collision rules**:
| Condition | Result |
|-----------|--------|
| Same rod, same family, same offset | **REJECTED** — two connectors in the same slot (`port_reused`) |
| Same rod, same family, different offsets, `abs(Δoffset) < min_spacing` | **REJECTED** — connectors physically overlap (`slide_collision`) |
| Same rod, same family, different offsets, `abs(Δoffset) ≥ min_spacing` | **Allowed** |
| Same rod, different families (both tangent), same offset | **Allowed** — connectors clip from orthogonal directions |
| Same rod, axial family + any tangent family, same offset | **REJECTED** — axial goes through the hole, tangent clips the side; they physically interfere (`slide_collision`) |

---

### Objectives

1. Implement `getSlideFamily(portId)` and `slideKey(instanceId, portId, slideOffset)` helpers.
2. Replace the `port_reused` check for slidable ports in the topology solver with key-based uniqueness + collision rules.
3. Add a new `slide_collision` error code for spacing and axial/tangent interference violations.
4. Allow `PortIndicators.tsx` to show slidable ports even when they have existing connections.
5. Add connector-on-rod collision detection in the build store's `addConnection`.
6. Add Python-side equivalents in `src/core/snapping.py`.

---

### Implementation Details

#### 1. Slide family helpers (`frontend/src/helpers/snapHelper.ts`)

```typescript
type SlideFamily = 'axial' | 'tangent_y' | 'tangent_z'

function isSlidablePort(portId: string): boolean {
  return portId.startsWith('center_axial') || portId.startsWith('center_tangent')
}

function getSlideFamily(portId: string): SlideFamily | null {
  if (portId.startsWith('center_axial'))     return 'axial'
  if (portId.startsWith('center_tangent_y')) return 'tangent_y'
  if (portId.startsWith('center_tangent_z')) return 'tangent_z'
  return null
}

/** Uniqueness key: same key = same physical slot on the rod. */
function slideKey(instanceId: string, portId: string, slideOffset: number): string {
  const family = getSlideFamily(portId) ?? portId
  return `${instanceId}:${family}:${slideOffset}`
}

/**
 * Returns true if two slide families physically interfere at the same offset.
 * - Same family → always interferes (identical slot)
 * - Axial + any tangent → interferes (axial goes through the hole)
 * - tangent_y + tangent_z → no interference (orthogonal clip directions)
 */
function familiesInterfere(a: SlideFamily, b: SlideFamily): boolean {
  if (a === b) return true
  if (a === 'axial' || b === 'axial') return true
  return false // tangent_y vs tangent_z — orthogonal, no conflict
}
```

#### 2. Topology solver validation (`topologySolver.ts`)

Replace the `usedPorts` set for slidable ports with a **slide occupancy map**. For non-slidable ports, the existing `port_reused` check is unchanged.

```typescript
// Per-rod occupancy: rodInstanceId → list of { family, offset }
const slideOccupancy = new Map<string, { family: SlideFamily, offset: number }[]>()

for (const conn of connections) {
  // --- Non-slidable ports: existing port_reused logic (unchanged) ---
  if (!isSlidablePort(endpoints.fromPort)) {
    if (usedPorts.has(fromEndpoint)) {
      issues.push({ code: 'port_reused', ... })
      continue
    }
    usedPorts.add(fromEndpoint)
  }
  // (same for toPort)

  // --- Slidable ports: key-based uniqueness + collision rules ---
  if (isSlidablePort(endpoints.fromPort)) {
    const family = getSlideFamily(endpoints.fromPort)!
    const offset = conn.slide_offset ?? 0
    const rodKey = conn.from_instance
    const existing = slideOccupancy.get(rodKey) ?? []

    // Rule 1: Same family, same offset → duplicate slot
    if (existing.some(e => e.family === family && e.offset === offset)) {
      issues.push({ code: 'port_reused', ... })
      continue
    }

    // Rule 2: Cross-family interference at same offset (axial vs tangent)
    if (existing.some(e =>
        e.offset === offset && familiesInterfere(family, e.family))) {
      issues.push({ code: 'slide_collision',
        message: 'Axial/tangent interference at same offset' })
      continue
    }

    // Rule 3: Same family, insufficient spacing
    const MIN_SPACING_MM = 15.0
    if (existing.some(e =>
        e.family === family && Math.abs(e.offset - offset) < MIN_SPACING_MM)) {
      issues.push({ code: 'slide_collision',
        message: 'Connectors too close on same axis' })
      continue
    }

    // Record occupancy
    if (!slideOccupancy.has(rodKey)) slideOccupancy.set(rodKey, [])
    slideOccupancy.get(rodKey)!.push({ family, offset })
  }
}
```

#### 3. Relax port occupancy in `PortIndicators.tsx`

Currently (line ~146):
```typescript
const isOccupied = connections.some(conn => 
    (conn.from_instance === matchTargetId && conn.from_port === targetPort.id) ||
    (conn.to_instance === matchTargetId && conn.to_port === targetPort.id)
)
if (isOccupied) continue
```

Change to skip the occupancy gate for slidable ports (collision is enforced by the solver and build store):
```typescript
if (!isSlidablePort(targetPort.id)) {
  const isOccupied = connections.some(conn => 
    (conn.from_instance === matchTargetId && conn.from_port === targetPort.id) ||
    (conn.to_instance === matchTargetId && conn.to_port === targetPort.id)
  )
  if (isOccupied) continue
}
```

#### 4. Build store validation (`buildStore.ts`)

In `addConnection`, use the same `familiesInterfere` + spacing logic:

```typescript
if (isSlidablePort(normalizedConnection.from_port) || isSlidablePort(normalizedConnection.to_port)) {
  const rodId = isSlidablePort(normalizedConnection.from_port)
    ? normalizedConnection.from_instance
    : normalizedConnection.to_instance
  const portId = isSlidablePort(normalizedConnection.from_port)
    ? normalizedConnection.from_port
    : normalizedConnection.to_port
  const newFamily = getSlideFamily(portId)!
  const newOffset = normalizedConnection.slide_offset ?? 0
  const MIN_SPACING_MM = 15.0

  const collision = state.connections.some(conn => {
    const existingRodId = conn.from_instance === rodId ? conn.from_instance
                        : conn.to_instance === rodId ? conn.to_instance : null
    if (!existingRodId) return false
    const existingPortId = conn.from_instance === rodId ? conn.from_port : conn.to_port
    if (!isSlidablePort(existingPortId)) return false
    const existingFamily = getSlideFamily(existingPortId)!
    const existingOffset = conn.slide_offset ?? 0

    // Same family, same offset → duplicate
    if (existingFamily === newFamily && existingOffset === newOffset) return true
    // Axial/tangent interference at same offset
    if (existingOffset === newOffset && familiesInterfere(newFamily, existingFamily)) return true
    // Same family, too close
    if (existingFamily === newFamily && Math.abs(existingOffset - newOffset) < MIN_SPACING_MM) return true
    return false
  })

  if (collision) {
    console.warn('Slide collision on rod — placement rejected')
    return
  }
}
```

Python equivalent in `src/core/snapping.py` using the same `get_slide_family()` + `families_interfere()` helpers.

---

### Edge Cases

1. **Same offset, different tangent families** (`tangent_y` + `tangent_z`): Allowed — connectors clip from orthogonal directions and don't physically interfere. `familiesInterfere('tangent_y', 'tangent_z')` returns `false`.
2. **Same offset, same tangent family** (`tangent_y_pos` + `tangent_y_neg`): Rejected — both map to `tangent_y` family and occupy the same physical clip slot. Reports `port_reused`.
3. **Axial + tangent at same offset**: Rejected (conservative) — the axial connector passes through the center hole, physically blocking tangent clips at that position. Reports `slide_collision`.
4. **Same family, close but not overlapping** (e.g., offsets 10mm and 20mm with `MIN_SPACING_MM=15`): Rejected — `abs(10 - 20) = 10 < 15`. Reports `slide_collision`.
5. **Same family, sufficient spacing** (e.g., offsets 0mm and 20mm): Allowed — `abs(0 - 20) = 20 ≥ 15`.
6. **Rod end proximity**: Connectors near the rod ends must not extend past the end. The `get_slide_range()` from Task 14.1 enforces this (orthogonal to collision checks).
7. **Undo/redo**: The collision check runs on `addConnection`. Undo/redo restores snapshots directly, bypassing the check — this is correct since the restored state was previously valid.

---

### Files Modified

- `frontend/src/helpers/snapHelper.ts` — add `isSlidablePort()`, `getSlideFamily()`, `slideKey()`, `familiesInterfere()` exports
- `frontend/src/services/topologySolver.ts` — replace `port_reused` with key-based uniqueness + `slide_collision` error code
- `frontend/src/components/Viewer/PortIndicators.tsx` — skip occupancy gate for slidable ports
- `frontend/src/stores/buildStore.ts` — add family-aware collision check in `addConnection`
- `src/core/snapping.py` — Python `get_slide_family()`, `families_interfere()`, collision check

---

### Tests and Validation

1. **Unit tests for helpers** (`snapHelper.test.ts`):
   - `getSlideFamily('center_axial_1')` → `'axial'`
   - `getSlideFamily('center_tangent_y_pos')` → `'tangent_y'`
   - `getSlideFamily('end_1')` → `null`
   - `familiesInterfere('tangent_y', 'tangent_z')` → `false`
   - `familiesInterfere('axial', 'tangent_y')` → `true`
   - `familiesInterfere('tangent_y', 'tangent_y')` → `true`

2. **Topology solver tests** (each rule from the collision table):
   - Same rod, same family (`tangent_y`), same offset → `port_reused`
   - Same rod, same family (`tangent_y`), offsets 0 and 20mm → validates successfully
   - Same rod, same family (`tangent_y`), offsets 0 and 10mm → `slide_collision` (too close)
   - Same rod, `tangent_y` + `tangent_z`, same offset → validates successfully (orthogonal)
   - Same rod, `axial` + `tangent_y`, same offset → `slide_collision` (axial/tangent interference)
   - Non-slidable port reuse → `port_reused` (existing behavior unchanged)

3. **Build store tests**:
   - `addConnection` with collision returns without adding
   - `addConnection` with valid spacing adds successfully

4. **PortIndicators tests**:
   - Slidable port remains visible after one connection exists

5. Run: `cd frontend && npm run type-check && npm run test`
6. Run: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v`

---

### Completion Criteria

- [ ] `getSlideFamily()`, `slideKey()`, `familiesInterfere()` helpers implemented and exported
- [ ] Topology solver uses key-based uniqueness with `port_reused` and `slide_collision` error codes
- [ ] Slidable ports are not marked as "occupied" in PortIndicators
- [ ] Build store validates family-aware collisions before adding connections
- [ ] All existing tests pass unchanged
- [ ] New tests for multi-connector scenarios
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 14.5 status
- [ ] Committed with message `feat(build): allow multiple connectors per rod (Task 14.5)`

---

### Project Basics (for standalone agents)

- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **Python**: Code lives in `src/core/`. Run tests with `.\.venv\Scripts\python.exe -m pytest src/core/tests/`
- **Port indicators**: `frontend/src/components/Viewer/PortIndicators.tsx` — renders interactive snap points.
- **Build store**: `frontend/src/stores/buildStore.ts` — Zustand store with Immer mutations.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
