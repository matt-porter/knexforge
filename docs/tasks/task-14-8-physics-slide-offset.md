## Task 14.8: Physics Engines — Cylindrical Joints for Axial & Fixed Joints for Tangent

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (model), Task 14.2 (snapping)  
**Blocked by**: Task 14.2  
**Estimated effort**: 3–4 hours

---

### Problem Statement

Both physics engines (Rapier.js in the frontend and PyBullet in the Python core) currently model `center_axial` connections as **revolute joints** (free rotation, locked translation). This is physically wrong: a connector threaded onto a rod through its center hole should be free to **slide along the rod axis under gravity** — it's a **cylindrical joint** (revolute + prismatic along the same axis).

In contrast, `center_tangent` (side-clip) connections are physically friction-held — the connector clips onto the rod's side and should **not** slide under gravity. These should remain **fixed joints** with the `slide_offset` determining only the initial anchor position.

This task:
1. Changes the physics joint type for `center_axial` from revolute to cylindrical (rotation + axial translation).
2. Keeps `center_tangent` as fixed, but shifts the anchor position by `slide_offset`.
3. Ensures connectors on `center_axial` ports fall freely under gravity along the rod axis.
4. Ensures connectors on `center_tangent` ports stay locked at their `slide_offset` position.

---

### Objectives

1. Implement **cylindrical joints** for `center_axial` connections in both Rapier.js and PyBullet.
2. Keep `center_tangent` connections as **fixed joints** with offset anchors.
3. Apply `slide_offset` as the initial position along the axis for both joint types.
4. Ensure both engines produce equivalent behavior.
5. Update `infer_joint_type` / `inferJointType` if needed (or add a separate physics-level classification).

---

### Physics Behavior Summary

| Connection Type | Joint Model | Rotation | Axial Slide | Gravity Behavior |
|---|---|---|---|---|
| `center_axial` | Cylindrical (revolute + prismatic) | Free spin around rod X | Free slide along rod X | Falls/slides under gravity |
| `center_tangent` | Fixed | Locked | Locked at `slide_offset` | Stays in place (friction-held) |
| `end1` / `end2` | Fixed | Locked | N/A | Stays in place |
| `rotational_hole` (A/B/C/D) | Revolute | Free spin around port direction | Locked | Stays in place |

---

### Implementation Details

#### 1. Rapier.js — Cylindrical Joint for `center_axial` (`rapierSimulator.ts`)

Rapier.js has a `PrismaticImpulseJoint` type. A cylindrical joint can be approximated by combining a prismatic joint (with free limits) along the rod axis. However, Rapier **does not have a native cylindrical joint**. The recommended approach:

**Approach — Compound joint via dummy body** (revolute + prismatic):

A `center_axial` connection needs two DOFs: free rotation around the rod axis AND free translation along it. Rapier has no native cylindrical joint, and `PrismaticImpulseJoint` constrains off-axis rotation by default (effectively locking spin). Therefore, we use a **compound joint** with an intermediate dummy body — the same pattern already used for revolute workarounds elsewhere in the codebase:

1. Create a **dummy rigid body** at the connector's initial position.
2. Attach the dummy to the rod with a `PrismaticImpulseJoint` along rod local X (for axial slide).
3. Attach the connector to the dummy with a `RevoluteImpulseJoint` around rod local X (for spin).

This gives full cylindrical behavior (2 DOFs) using Rapier's native joint types.

```typescript
if (isCenterAxial) {
  // Compound joint: dummy body bridges prismatic (slide) + revolute (spin)
  const rodLocalX = { x: 1, y: 0, z: 0 }

  // 1. Create dummy body at connector's initial position
  const dummyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(connectorPos.x, connectorPos.y, connectorPos.z)
    .setLinearDamping(0.3)
    .setAngularDamping(0.3)
  const dummyBody = this.world.createRigidBody(dummyDesc)

  // 2. Prismatic: rod ↔ dummy (axial slide)
  const prismaticParams = RAPIER.JointData.prismatic(a1, a2, rodLocalX)
  const prismaticJoint = this.world.createImpulseJoint(prismaticParams, fromBody, dummyBody, true)
  const prismatic = prismaticJoint as RAPIER.PrismaticImpulseJoint
  prismatic.setLimits(-rodHalfLength + clearance, rodHalfLength - clearance)
  prismaticJoint.setContactsEnabled(false)

  // 3. Revolute: dummy ↔ connector (spin around rod axis)
  const revoluteParams = RAPIER.JointData.revolute(
    { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, rodLocalX
  )
  const revoluteJoint = this.world.createImpulseJoint(revoluteParams, dummyBody, toBody, true)
  revoluteJoint.setContactsEnabled(false)
}
```

> **Note**: If future Rapier versions add a native cylindrical joint, the compound approach can be simplified. The dummy-body pattern is proven stable in this codebase (see existing revolute workaround).

#### 2. PyBullet — Cylindrical Joint for `center_axial` (`pybullet.py`)

PyBullet doesn't have native cylindrical joints either. Currently uses 2 P2P constraints along the rotation axis for revolute. To allow axial sliding:

**Approach**: Use a single P2P constraint at one end of the anchor arm (perpendicular to the rod axis), which constrains off-axis translation and tilt but allows both rotation AND axial translation along the rod axis.

```python
if is_center_axial:
    # Single P2P perpendicular to rod axis — constrains off-axis motion
    # but allows rotation AND axial sliding (cylindrical behavior).
    perp = np.cross(axis_world, [0, 1, 0])
    if np.linalg.norm(perp) < 1e-6:
        perp = np.cross(axis_world, [1, 0, 0])
    perp = perp / np.linalg.norm(perp)
    
    anchor_world = pivot_world + perp * ARM_MM
    # ... create single P2P constraint
```

Actually, a single P2P allows too many DOFs (3 rotational + swing around the anchor). Better approach:

**Use 2 P2P constraints perpendicular to the rod axis** (both at the same X position but offset in Y and Z). This locks off-axis translation and tilt while leaving the rod-axis DOFs (rotation + translation) free.

```python
if is_center_axial:
    # Two P2P constraints perpendicular to rod axis
    # This locks off-axis translation and tilt
    # but allows rotation AND axial sliding
    perp1 = np.cross(axis_world, [0, 1, 0])
    if np.linalg.norm(perp1) < 1e-6:
        perp1 = np.cross(axis_world, [1, 0, 0])
    perp1 = perp1 / np.linalg.norm(perp1)
    perp2 = np.cross(axis_world, perp1)
    perp2 = perp2 / np.linalg.norm(perp2)
    
    anchors_world = [
        pivot_world + perp1 * ARM_MM,
        pivot_world + perp2 * ARM_MM,
    ]
```

Wait — this is the same as the current revolute approach (2 P2P along the axis). The key difference is that for a **revolute** joint the 2 anchors are placed **along the rotation axis** (locking axial translation), whereas for a **cylindrical** joint they should be placed **perpendicular to the axis** (allowing axial translation but preventing off-axis drift).

**Current revolute (locks translation):**
```python
anchors_world = [pivot_world, pivot_world + axis_world * ARM_MM]
# ^ Both on the axis → constrains translation along axis
```

**New cylindrical (allows translation):**
```python
anchors_world = [
    pivot_world + perp1 * ARM_MM,
    pivot_world + perp2 * ARM_MM,
]
# ^ Both perpendicular to axis → constrains off-axis motion
# but axis-aligned translation is FREE
```

This is elegant: same number of constraints, just different anchor placement geometry.

#### 3. `center_tangent` — Fixed with offset anchor

For `center_tangent` connections, the joint remains **fixed** (3 P2P in PyBullet, `FixedImpulseJoint` in Rapier). The only change is shifting the anchor position by `slide_offset`:

```typescript
// Rapier — shift anchor along rod local X
function getOffsetAnchor(port: Port, slideOffset: number): Vec3 {
  return {
    x: port.position[0] + slideOffset,
    y: port.position[1],
    z: port.position[2],
  }
}
```

```python
# PyBullet — shift anchor along rod local X
def _offset_port_position(port, slide_offset):
    return (port.position[0] + slide_offset, port.position[1], port.position[2])
```

#### 4. Joint type classification

The existing `infer_joint_type` returns `'revolute'` for `center_axial`. This is used across the codebase (serialization, UI, datasets). Rather than changing this public API, add a **physics-internal** classification:

```typescript
// Physics-internal: determines actual DOFs for simulation
function physicsJointType(
  fromPort: Port, toPort: Port
): 'fixed' | 'revolute' | 'cylindrical' {
  if (fromPort.id.startsWith('center_axial') || toPort.id.startsWith('center_axial')) {
    return 'cylindrical'
  }
  const mateTypes = new Set([fromPort.mate_type, toPort.mate_type])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  return 'fixed'
}
```

The public `inferJointType` continues to return `'revolute'` for `center_axial` — this is correct for serialization, topology solver, and UI. The physics engines use the internal `physicsJointType` for actual joint creation.

---

### Interaction with User-Set Offset

Phase 14 is framed as "user-controlled positioning" — the user places a connector at a specific `slide_offset` on a rod. However, physics simulation may change that position for `center_axial` connections. The rules:

- **`center_axial`**: The `slide_offset` sets the **initial position** of the prismatic joint. Under gravity, the connector may slide along the rod axis to a new equilibrium. The user's intent is the starting point, not a hard constraint. On a horizontal rod, there is no gravity component along the axis, so the connector stays at the user-set offset. On a vertical rod, the connector slides to the lowest reachable point.

- **`center_tangent`**: The `slide_offset` is a **locked position**. The connector stays exactly where placed, regardless of gravity. The fixed joint prevents any movement.

> **Future enhancement (Phase 15)**: For `center_axial`, the user could optionally "lock" the offset via a UI toggle. This would convert the cylindrical joint to a fixed joint at the specified offset, making the connector stay in place under gravity. This is out of scope for Phase 14 but is a natural extension.

---

### Motor Compatibility with Compound Joints

Currently, motors use `RevoluteImpulseJoint.configureMotorVelocity()` on revolute joints. With the compound joint approach for `center_axial`, motor driving works differently:

- **Motor torque** on `center_axial` connections still drives rotation around the rod axis.
- In the compound joint, the **revolute joint** (dummy ↔ connector) handles rotation. Motor velocity is configured on this revolute joint, exactly as before.
- The **prismatic joint** (rod ↔ dummy) handles axial slide and is unaffected by the motor.

```typescript
// Motor on center_axial compound joint:
// Drive rotation via the revolute joint (dummy ↔ connector)
const revoluteJoint = compoundJoint.revolute as RAPIER.RevoluteImpulseJoint
revoluteJoint.configureMotorVelocity(targetVelocity, dampingFactor)
// The prismatic joint (rod ↔ dummy) is independent — connector slides freely
```

This means **motor-driven `center_axial` connectors will spin AND slide simultaneously** — the motor drives rotation while gravity determines axial position. This is physically correct: think of a spinning wheel on a vertical axle that can also slide up and down.

The implementation must track both joints in the compound pair. Add a `compoundJoints` map alongside the existing `joints` map in `rapierSimulator.ts`:

```typescript
interface CompoundJoint {
  dummyBody: RAPIER.RigidBody
  prismatic: RAPIER.PrismaticImpulseJoint  // rod ↔ dummy (slide)
  revolute: RAPIER.RevoluteImpulseJoint    // dummy ↔ connector (spin + motor)
}
private compoundJoints = new Map<string, CompoundJoint>()
```

---

### Edge Cases

1. **`slide_offset = 0` on `center_axial`**: The connector starts at the midpoint but is free to slide. Under gravity, it will slide to the lowest point on the rod. This is physically correct.
2. **`slide_offset = 0` on `center_tangent`**: The connector stays at the midpoint (fixed joint). Identical to current behavior.
3. **Motor-driven `center_axial`**: Motor torque is applied via `configureMotorVelocity()` on the **revolute joint** of the compound pair (dummy ↔ connector). The prismatic joint (rod ↔ dummy) remains free — axial position is gravity-determined. See "Motor Compatibility with Compound Joints" section above.
4. **Multiple `center_axial` connectors on the same rod**: Each has its own cylindrical joint. Under gravity, they'll all slide to the same lowest point and stack. Connector-to-connector collision prevents overlap.
5. **Vertical rod with `center_axial`**: Connector slides to the bottom of the rod. The prismatic limits prevent it from falling off.
6. **Horizontal rod with `center_axial`**: No gravity component along the axis, so the connector stays at `slide_offset`.
7. **Large offsets near rod ends**: The prismatic limits clamp movement, so the connector can't fall off.
8. **Backward compatibility**: Existing `center_axial` connections with `slide_offset=0` **WILL behave differently** in simulation after this change. Previously, `center_axial` used a revolute joint (locked translation), so connectors stayed at center. Now they use a cylindrical joint (free translation), so connectors slide under gravity to the lowest point on the rod. This is intentional and physically correct, but existing builds will look different in simulation. **Migration note**: When loading builds saved before Phase 14, inform the user that `center_axial` connectors now slide under gravity. No data migration is needed (the `slide_offset=0` default is correct), but simulation results will differ from pre-Phase 14 behavior.

---

### Files Modified

- `frontend/src/services/rapierSimulator.ts` — cylindrical joint for `center_axial`, offset anchors for `center_tangent`
- `src/core/physics/pybullet.py` — cylindrical constraints for `center_axial`, offset anchors for `center_tangent`

### Files NOT Modified

- `src/core/snapping.py` — `infer_joint_type` unchanged (still returns `'revolute'`)
- `frontend/src/helpers/snapHelper.ts` — `inferJointType` unchanged
- Part JSON files
- UI components
- Topology solver

---

### Tests and Validation

1. **Gravity slide test (both engines)**:
   - Create a vertical rod + `center_axial` connector at center. Simulate with gravity. Verify the connector slides downward along the rod axis.
   - Same test with `center_tangent` connector. Verify it stays at center (fixed).

2. **Offset preservation test**:
   - `center_tangent` with `slide_offset=+20`: connector stays at +20mm after 120 simulation frames.
   - `center_axial` with `slide_offset=+20` on a horizontal rod: connector stays near +20mm (no gravity component along axis).

3. **Prismatic limits test**:
   - `center_axial` on a 128mm rod: connector cannot slide past the rod ends (limits at ±~57mm from center).

4. **Motor test**:
   - Motor-driven `center_axial`: connector spins around the rod axis while potentially sliding along it.

5. **Regression test**:
   - All existing physics tests pass (side-on clip, end-on clip, motor chain from Task 3.10).

6. **Cross-engine consistency**:
   - Same configuration in Rapier and PyBullet produces equivalent behavior (connector slides in both, stays fixed in both).

7. Run: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v`
8. Run: `cd frontend && npm run type-check && npm run test`

---

### Completion Criteria

- [ ] `center_axial` connections use cylindrical joints (free rotation + free axial slide)
- [ ] `center_tangent` connections use fixed joints with offset anchors (locked in place)
- [ ] Connector on `center_axial` slides under gravity along the rod axis
- [ ] Connector on `center_tangent` stays fixed at `slide_offset` position under gravity
- [ ] Prismatic limits prevent connectors from sliding off rod ends
- [ ] Both engines (Rapier + PyBullet) produce equivalent behavior
- [ ] Existing physics tests pass unchanged
- [ ] New tests for cylindrical vs fixed behavior
- [ ] `PLAN.md` updated with Task 14.8 status
- [ ] Committed with message `feat(physics): cylindrical joints for center_axial, fixed for center_tangent (Task 14.8)`

---

### Project Basics (for standalone agents)

- **Rapier.js**: `frontend/src/services/rapierSimulator.ts` — uses native joint types (`FixedImpulseJoint`, `RevoluteImpulseJoint`, `PrismaticImpulseJoint`). For `center_axial`, uses a **compound joint** (dummy body with prismatic + revolute) to achieve cylindrical behavior.
- **PyBullet**: `src/core/physics/pybullet.py` — uses multi-P2P constraints (2 for revolute, 3 for fixed). Constraint geometry determines DOFs.
- **Critical rule**: Never import Rapier in Python or PyBullet in TypeScript.
- **Critical rule**: The public `inferJointType` / `infer_joint_type` returns `'revolute'` for `center_axial` — do NOT change this. Use a physics-internal classification for joint creation.
- **Key physics insight**: PyBullet revolute uses 2 P2P anchors **along** the rotation axis (locks translation). Cylindrical uses 2 P2P anchors **perpendicular** to the axis (allows translation).
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
