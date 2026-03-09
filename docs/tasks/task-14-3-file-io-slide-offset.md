## Task 14.3: File I/O & Serialization — Persist `slide_offset`

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (Connection model with `slide_offset`)  
**Blocked by**: Task 14.1  
**Estimated effort**: 1–2 hours

---

### Problem Statement

The `.knx` file format and the JSON serialization in `src/core/file_io.py` currently serialize connections with `from`, `to`, `joint_type`, `twist_deg`, and `fixed_roll`. The new `slide_offset` field (Task 14.1) must be persisted to disk and round-tripped correctly. Similarly, the frontend's local model storage and topology compact format must carry `slide_offset`.

This task adds `slide_offset` serialization to all persistence paths, with full backward compatibility for files that don't include it.

---

### Objectives

1. Update `_build_to_model_json()` in `src/core/file_io.py` to serialize `slide_offset` (only when non-zero, to keep files compact).
2. Update `_model_json_to_build()` to read `slide_offset` from connection data (defaulting to `0.0` if absent).
3. Update the topology compact format parser (`frontend/src/services/topologyCompactFormat.ts`) to support an optional `slide_offset` annotation.
4. Update the frontend's local model storage (`localModels.ts` or equivalent) to preserve `slide_offset`.
5. Update the shorthand parser in Python (`src/core/shorthand_parser.py`) to support `slide_offset` syntax.

---

### Implementation Details

#### 1. Python file I/O (`src/core/file_io.py`)

**Export** — in `_build_to_model_json`, add:

```python
if hasattr(conn, 'slide_offset') and conn.slide_offset != 0.0:
    c_dict["slide_offset"] = conn.slide_offset
```

**Import** — in `_model_json_to_build`, add:

```python
conn = Connection(
    from_instance=from_instance,
    from_port=_normalize_legacy_port_id(from_port),
    to_instance=to_instance,
    to_port=_normalize_legacy_port_id(to_port),
    joint_type=c_dict.get("joint_type", "fixed"),
    twist_deg=c_dict.get("twist_deg", 0.0),
    fixed_roll=c_dict.get("fixed_roll", False),
    slide_offset=c_dict.get("slide_offset", 0.0),  # NEW
)
```

**Validate** — update `validate_connection_entry()` to validate `slide_offset` if present:

```python
if "slide_offset" in conn:
    if not isinstance(conn["slide_offset"], (int, float)):
        errors.append(f"Connection {index}: 'slide_offset' must be a number")
```

#### 2. Topology compact format — unified `@` annotation syntax

The existing compact format already uses `@ <twist>[!]` for `twist_deg` and `fixed_roll`. The `slide_offset` annotation must coexist with this syntax. The `@` block is a **single annotation region** after the connection, with positional and key-value parts:

**Canonical format:**

```
# No annotations (defaults: twist=0, fixed_roll=false, slide_offset=0)
gc4_1.A -- rr_1.end1

# Twist only (backward compatible with existing @ syntax)
gc4_1.A -- rr_1.end1 @ 90

# Twist + fixed roll (backward compatible)
gc4_1.A -- rr_1.end1 @ 90!

# Slide offset only (twist=0 implied, but @ 0 required as positional anchor)
gc4_1.A -- rr_1.end1 @ 0 slide=-15

# All three: twist + fixed_roll + slide_offset
gc4_1.A -- rr_1.end1 @ 90! slide=+20
```

**Rules:**

1. `@ <twist>[!]` comes first — the positional `twist_deg` and optional `!` for `fixed_roll` (backward-compatible with existing syntax).
2. `slide=<value>` is an optional key-value pair that follows the twist annotation, separated by a space.
3. When `slide_offset` is specified but `twist_deg` is 0, the `@ 0` prefix is **still required** as a positional anchor for the `slide=` key-value pair.

**Parser regex** — update in both `topologyCompactFormat.ts` (line 105) and `shorthand_parser.py` (line 119):

```
(?:\s*@\s*(-?\d+(?:\.\d+)?)(!)?(?:\s+slide=([+-]?\d+(?:\.\d+)?))?)?$
```

This extends the existing regex by appending an optional `(?:\s+slide=([+-]?\d+(?:\.\d+)?))?` group. The existing capture groups (twist, fixed_roll) remain at the same indices, so all current parsing code stays valid.

**TypeScript parser update** (`frontend/src/services/topologyCompactFormat.ts`):

```typescript
// Line 105: updated regex
const edgeMatch = line.match(/^([A-Za-z0-9_.-]+)\s*(--|~~|=>)\s*([A-Za-z0-9_.-]+)(?:\s*@\s*(-?\d+(?:\.\d+)?)(!)?(?:\s+slide=([+-]?\d+(?:\.\d+)?))?)?$/)

// Line 110: extract new capture group
const [, fromRef, operator, toRef, twistStr, fixedRollMark, slideStr] = edgeMatch
const slide_offset = slideStr ? parseFloat(slideStr) : 0

// Line 118: include in connection object
connections.push({
  from: `${from.instance_id}.${from.port_id}`,
  to: `${to.instance_id}.${to.port_id}`,
  joint_type: JOINT_OPERATOR_TO_TYPE[operator as keyof typeof JOINT_OPERATOR_TO_TYPE],
  twist_deg: twist_deg ?? 0,
  fixed_roll: fixed_roll ?? false,
  slide_offset,
})
```

**TypeScript stringify update** (`topologyCompactFormat.ts` ~line 159):

```typescript
// Emit annotation block
if (connection.slide_offset) {
  // When slide_offset is present, always emit full @ block (even if twist is 0)
  line += ` @ ${connection.twist_deg}${connection.fixed_roll ? '!' : ''} slide=${connection.slide_offset > 0 ? '+' : ''}${connection.slide_offset}`
} else if (connection.twist_deg || connection.fixed_roll) {
  line += ` @ ${connection.twist_deg}${connection.fixed_roll ? '!' : ''}`
}
```

**Python parser update** (`src/core/shorthand_parser.py`):

```python
# Line 118-119: updated regex and comment
# 3. Connection: <inst>.<port> <op> <inst>.<port> [@ <twist>[!] [slide=<offset>]]
edge_match = re.match(
    r"^([A-Za-z0-9_.-]+)\s*(--|~~|=>)\s*([A-Za-z0-9_.-]+)"
    r"(?:\s*@\s*(-?\d+(?:\.\d+)?)(!)?(?:\s+slide=([+-]?\d+(?:\.\d+)?))?)?$",
    line
)

# Extract groups (slide_str is the new 6th group)
from_ref, operator, to_ref, twist_str, fixed_roll_mark, slide_str = edge_match.groups()

connections.append(TopologyConnection(
    **{
        "from": from_ref,
        "to": to_ref,
        "joint_type": JOINT_OPERATOR_TO_TYPE[operator],
        "twist_deg": float(twist_str) if twist_str else 0.0,
        "fixed_roll": fixed_roll_mark == "!",
        "slide_offset": float(slide_str) if slide_str else 0.0,
    }
))
```

**Python stringify update** (`shorthand_parser.py` ~line 177):

```python
slide_val = getattr(conn, 'slide_offset', 0.0) or 0.0
if slide_val != 0.0:
    twist_val = f"{conn.twist_deg:g}"
    slide_fmt = f"+{slide_val:g}" if slide_val > 0 else f"{slide_val:g}"
    line += f" @ {twist_val}{'!' if conn.fixed_roll else ''} slide={slide_fmt}"
elif conn.twist_deg != 0 or conn.fixed_roll:
    twist_val = f"{conn.twist_deg:g}"
    line += f" @ {twist_val}{'!' if conn.fixed_roll else ''}"
```

#### 3. Frontend `ExportedBuildData` connection type (`frontend/src/services/sidecarBridge.ts`)

The `ExportedBuildData` interface (line 84) currently defines connection entries with only `from`, `to`, and `joint_type`. Add optional fields for `twist_deg`, `fixed_roll`, and `slide_offset`:

```typescript
connections: Array<{
  from: string
  to: string
  joint_type: string
  twist_deg?: number
  fixed_roll?: boolean
  slide_offset?: number   // NEW
}>
```

Without this change, `slide_offset` would be silently stripped during save/load via the sidecar bridge.

#### 4. Frontend local model storage (`frontend/src/services/localModels.ts`)

**`createExportData`** (line 137) — currently maps connections to `{ from, to, joint_type }`. Add `slide_offset` (and `twist_deg`, `fixed_roll` if not already present):

```typescript
connections: connections.map(c => ({
  from: `${c.from_instance}.${c.from_port}`,
  to: `${c.to_instance}.${c.to_port}`,
  joint_type: c.joint_type || 'fixed',
  ...(c.twist_deg ? { twist_deg: c.twist_deg } : {}),
  ...(c.fixed_roll ? { fixed_roll: c.fixed_roll } : {}),
  ...(c.slide_offset ? { slide_offset: c.slide_offset } : {}),
}))
```

**`parseExportedBuildData`** (line 102) — currently maps connections without `slide_offset`. Add it:

```typescript
const connections: Connection[] = data.model.connections.map((c) => {
  const fromLastDot = c.from.lastIndexOf('.')
  const toLastDot = c.to.lastIndexOf('.')
  return {
    from_instance: c.from.substring(0, fromLastDot),
    from_port: normalizeLegacyRodSidePortId(c.from.substring(fromLastDot + 1)),
    to_instance: c.to.substring(0, toLastDot),
    to_port: normalizeLegacyRodSidePortId(c.to.substring(toLastDot + 1)),
    joint_type: (c.joint_type as 'fixed' | 'revolute' | 'prismatic') || 'fixed',
    slide_offset: (c as any).slide_offset ?? 0,  // NEW — cast needed until ExportedBuildData is updated
  }
})
```

#### 5. Frontend cloud model storage (`frontend/src/services/cloudModels.ts`)

This file uses `createExportData` and `parseExportedBuildData` from `localModels.ts`. No code changes needed in `cloudModels.ts` itself — it inherits `slide_offset` support automatically once the functions it calls are updated. However, verify that no intermediate serialization step strips unknown fields.

---

### Backward Compatibility

- Files without `slide_offset` in connections load correctly (defaults to `0.0`).
- Files with `slide_offset` in connections are only written by new versions.
- No `format_version` bump needed — the field is purely additive and optional.
- The topology compact format `slide=` key-value pair extends the existing `@` annotation. Older parsers that only match the original `@ <twist>[!]` regex will fail to parse lines with `slide=` — this is acceptable since `slide_offset` is a new feature and the compact format is not a migration concern.

---

### Files Modified

- `src/core/file_io.py` — export/import/validate `slide_offset` in JSON
- `frontend/src/services/topologyCompactFormat.ts` — parse/emit `@ <twist>[!] slide=<offset>` annotation
- `src/core/shorthand_parser.py` — parse/emit `@ <twist>[!] slide=<offset>` annotation
- `frontend/src/services/sidecarBridge.ts` — add `slide_offset` to `ExportedBuildData` connection type
- `frontend/src/services/localModels.ts` — preserve `slide_offset` in `createExportData` and `parseExportedBuildData`
- `frontend/src/services/cloudModels.ts` — verify passthrough (no code changes expected, uses `localModels.ts` functions)

### Files NOT Modified

- Part JSON files
- Snapping logic (Task 14.2)
- UI (Task 14.5/14.6)
- `.knx` ZIP structure (just new field in `model.json`)
- `frontend/src/services/cloudModels.ts` — no direct changes (inherits via `localModels.ts`)

---

### Tests and Validation

1. **Python round-trip tests** (`src/core/tests/test_file_io.py`):
   - Export a build with `slide_offset=25.0`, re-import, verify offset preserved
   - Export a build with `slide_offset=0.0`, verify field is omitted from JSON
   - Import a legacy file without `slide_offset`, verify defaults to `0.0`
   - Validate `slide_offset` with non-numeric value raises validation error

2. **Shorthand parser tests** (`src/core/tests/test_shorthand.py`):
   - Parse `gc4_1.A -- rr_1.end1 @ 0 slide=+20` → `twist_deg=0, slide_offset=20.0`
   - Parse `gc4_1.A -- rr_1.end1 @ 90! slide=+20` → `twist_deg=90, fixed_roll=True, slide_offset=20.0`
   - Parse `gc4_1.A -- rr_1.end1 @ 90!` → `twist_deg=90, fixed_roll=True, slide_offset=0.0` (backward compat)
   - Parse `gc4_1.A -- rr_1.end1` → `twist_deg=0, slide_offset=0.0` (no annotation)
   - Stringify round-trip: parse → stringify → parse produces identical data

3. **Frontend tests**: Topology compact format parse/emit with `@ <twist>[!] slide=<offset>`.
   - Parse all annotation variants (no annotation, twist only, twist+fixed_roll, slide only, all three)
   - Stringify emits `slide=` only when `slide_offset != 0`
   - Stringify omits entire `@` block when all defaults

4. Run: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v`
5. Run: `cd frontend && npm run type-check && npm run test`
6. All existing tests pass unchanged.

---

### Completion Criteria

- [ ] `slide_offset` is serialized to `.knx` / JSON when non-zero
- [ ] `slide_offset` is deserialized from `.knx` / JSON (defaults to 0.0 when absent)
- [ ] `validate_connection_entry()` validates `slide_offset` type
- [ ] Topology compact format supports `@ <twist>[!] slide=<offset>` unified annotation
- [ ] Python shorthand parser supports `@ <twist>[!] slide=<offset>` unified annotation
- [ ] Both parsers backward-compatible with existing `@ <twist>[!]` syntax (no `slide=`)
- [ ] `ExportedBuildData` connection type in `sidecarBridge.ts` includes `slide_offset`
- [ ] `createExportData` in `localModels.ts` preserves `slide_offset`
- [ ] `parseExportedBuildData` in `localModels.ts` reads `slide_offset`
- [ ] Legacy files without `slide_offset` load correctly
- [ ] Round-trip tests pass (export → import → export produces identical data)
- [ ] All existing file I/O tests pass unchanged
- [ ] `PLAN.md` updated with Task 14.3 status
- [ ] Committed with message `feat(io): persist slide_offset in connections (Task 14.3)`

---

### Project Basics (for standalone agents)

- **Python**: Code lives in `src/core/`. Run tests with `.\.venv\Scripts\python.exe -m pytest src/core/tests/`
- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **File format**: `.knx` files are ZIP packages containing `manifest.json` and `model.json`. See `src/core/file_io.py`.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
