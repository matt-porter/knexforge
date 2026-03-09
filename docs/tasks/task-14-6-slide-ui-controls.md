## Task 14.6: UI — Slide Offset Controls During Placement

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.1 (model), Task 14.2 (snapping), Task 14.5 (multi-connector)  
**Blocked by**: Task 14.5  
**Estimated effort**: 3–4 hours

---

### Problem Statement

With `slide_offset` implemented in the connection model, snapping engine, and topology solver, the user needs UI controls to set the offset when placing a connector on a rod. Currently, when a user hovers a rod's center port during placement, the connector snaps to the midpoint. The user needs a way to slide the connector along the rod to their desired position.

This task adds:
1. A keyboard-driven slide control (arrow keys or scroll wheel) during snap preview
2. A visual indicator on the rod showing the slide position
3. A HUD display of the current offset value
4. Snapping the offset to discrete increments (e.g., 1mm steps, with shift for finer control)

---

### Objectives

1. Add `slideOffset` state to the interaction store.
2. Add keyboard/scroll handlers for adjusting `slideOffset` during snap preview.
3. Update the ghost preview to render at the offset position.
4. Add a visual "slide guide" along the rod showing valid range and current position.
5. Update the SnapVariantHUD to show the current offset value.
6. When the user commits the placement (click), store the `slideOffset` in the connection.

---

### Implementation Details

#### 1. Interaction store changes (`interactionStore.ts`)

Add to the store state:
```typescript
slideOffset: number  // current slide offset in mm (0 = center)
slideRange: [number, number] | null  // [min, max] valid range, null if not slidable
```

Add actions:
```typescript
setSlideOffset: (offset: number) => void
adjustSlideOffset: (delta: number) => void  // clamps to range
resetSlideOffset: () => void
setSlideRange: (range: [number, number] | null) => void
```

Reset `slideOffset` to `0` whenever the user:
- Changes the hovered port indicator
- Changes the active port group (Tab)
- Cancels placement

#### 2. Keyboard/scroll handlers

In the component that handles keyboard events during placement (likely `SceneInteraction.tsx` or a dedicated keyboard handler):

- **Arrow Left/Right** or **Mouse Scroll Wheel**: Adjust `slideOffset` by ±5mm (coarse)
- **Shift + Arrow/Scroll**: Adjust by ±1mm (fine)
- **Home**: Reset to 0 (center)
- These only activate when hovering a slidable port (check `isSlidablePort`)

```typescript
// In the keyboard event handler:
if (isSnapped && isSlidablePort(snapPlacingPortId ?? '')) {
  if (e.key === 'ArrowRight') {
    const step = e.shiftKey ? 1 : 5
    useInteractionStore.getState().adjustSlideOffset(step)
    e.preventDefault()
  }
  if (e.key === 'ArrowLeft') {
    const step = e.shiftKey ? 1 : 5
    useInteractionStore.getState().adjustSlideOffset(-step)
    e.preventDefault()
  }
  if (e.key === 'Home') {
    useInteractionStore.getState().resetSlideOffset()
    e.preventDefault()
  }
}
```

For scroll wheel, add a handler in `PortIndicators.tsx` or `SceneInteraction.tsx`:
```typescript
const handleWheel = (e: WheelEvent) => {
  if (!isSnapped || !isSlidablePort(snapPlacingPortId ?? '')) return
  const step = e.shiftKey ? 1 : 5
  const delta = e.deltaY > 0 ? -step : step
  useInteractionStore.getState().adjustSlideOffset(delta)
  e.preventDefault()
}
```

#### 3. Ghost preview with offset

In `PortIndicators.tsx`, when computing the ghost transform for a slidable port, pass the `slideOffset` to `computeGhostTransform`:

```typescript
// In the useEffect that updates ghost position:
const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
  placingPort,
  targetPort,
  targetWorldPos,
  targetWorldDir,
  variant.angle,
  targetInstance,
  placingDef,
  targetDef,
  isPlacingRod,
  slideOffset,  // from interaction store
)
```

The `slideOffset` must also be passed when computing `worldPosition` — the port's world position changes with the offset. Recalculate the target world position with the offset applied.

#### 4. Visual slide guide

Create a new component `SlideGuide.tsx` in `frontend/src/components/Viewer/`:

```tsx
function SlideGuide({ rodInstance, portId, currentOffset, range }: SlideGuideProps) {
  // Render a line along the rod's axis showing the valid slide range
  // Highlight the current offset position with a marker
  // Show the rod endpoints as bounds
}
```

This renders:
- A semi-transparent line along the rod from min to max slide range
- A bright marker at the current offset position
- Optional tick marks at regular intervals (every 10mm)

Add `<SlideGuide>` to the `BuildScene` render when a slidable snap is active.

#### 5. SnapVariantHUD update

Add a "Slide" section to the HUD when the current snap is on a slidable port:

```tsx
{isSlidablePort && (
  <>
    <div style={HUD_STYLES.divider} />
    <div style={HUD_STYLES.section}>
      <span style={HUD_STYLES.label}>Slide</span>
      <span style={HUD_STYLES.value}>
        {slideOffset > 0 ? '+' : ''}{slideOffset.toFixed(0)} mm
      </span>
    </div>
  </>
)}
```

Add keyboard hints:
```tsx
<span style={HUD_STYLES.hint}>
  <span style={HUD_STYLES.kbd}>←→</span> slide
</span>
```

#### 6. Commit placement with offset

In `PortIndicators.tsx` `handleClick`, pass `slideOffset` to the connection:

```typescript
useBuildStore.getState().addConnection({
  from_instance: instanceId,
  from_port: variant.placingPortId,
  to_instance: matchTargetId,
  to_port: variant.targetPortId,
  joint_type: variant.joint_type,
  twist_deg: variant.angle,
  fixed_roll: variant.fixed_roll,
  slide_offset: slideOffset,  // NEW
})
```

---

### Edge Cases

1. **Non-slidable ports**: Arrow keys / scroll wheel do nothing when hovering a non-slidable port.
2. **Range clamping**: `adjustSlideOffset` must clamp to `slideRange`. If range is `[-57, +57]`, offset can't exceed these bounds.
3. **Range calculation**: When hovering a slidable port, compute the range using `getSlideRange()` and store it. The range depends on the rod's length.
4. **Existing connectors**: The slide range should account for existing connectors on the same rod (from Task 14.5's collision detection). The user can't slide into a position that would collide.
5. **Port group cycling**: When the user presses Tab to cycle port groups, reset `slideOffset` to 0.
6. **Side cycling**: When the user presses X to cycle rod sides, keep the current `slideOffset` (the offset is along the rod axis, independent of which tangent direction).

---

### Files Modified

- `frontend/src/stores/interactionStore.ts` — add `slideOffset`, `slideRange`, actions
- `frontend/src/components/Viewer/PortIndicators.tsx` — pass `slideOffset` to ghost transform, set slide range
- `frontend/src/components/Viewer/SnapVariantHUD.tsx` — show slide offset in HUD
- `frontend/src/components/Viewer/SceneInteraction.tsx` — keyboard/scroll handlers
- `frontend/src/components/Viewer/SlideGuide.tsx` — NEW: visual slide guide component
- `frontend/src/components/Viewer/BuildScene.tsx` — render `SlideGuide` when active

### Files NOT Modified

- Python core (no UI in Python)
- Part JSON files
- Snapping math (already handles offset from Task 14.2)
- Topology solver (already handles offset from Task 14.4)

---

### Tests and Validation

1. **Manual testing**:
   - Place a rod, then attach a connector to its center_tangent port
   - Use arrow keys to slide the ghost along the rod — ghost position updates
   - Commit placement — connector is at the offset position
   - The connection in the build store has the correct `slide_offset`
   - HUD shows "Slide: +20 mm" (or similar)
   - Visual guide line appears along the rod

2. **Automated tests** (Vitest):
   - `adjustSlideOffset(5)` with range `[-57, 57]` and current offset `0` → offset becomes `5`
   - `adjustSlideOffset(100)` with range `[-57, 57]` → offset clamps to `57`
   - `adjustSlideOffset(-100)` → clamps to `-57`
   - `resetSlideOffset()` → offset becomes `0`

3. Run: `cd frontend && npm run type-check && npm run test`

---

### Completion Criteria

- [ ] `slideOffset` and `slideRange` in interaction store
- [ ] Arrow keys / scroll wheel adjust offset during snap preview
- [ ] Ghost preview renders at the offset position
- [ ] SnapVariantHUD shows current offset
- [ ] Visual slide guide renders on the rod
- [ ] Committed placement stores `slide_offset` in the connection
- [ ] Range clamping works correctly
- [ ] All existing tests pass unchanged
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 14.6 status
- [ ] Committed with message `feat(ui): add slide offset controls for rod placement (Task 14.6)`

---

### Project Basics (for standalone agents)

- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **React/Three.js**: Use functional components + hooks. Three.js via react-three-fiber (`useFrame`, `useThree`).
- **State management**: Zustand with Immer. See `frontend/src/stores/`.
- **Conventions**: TypeScript strict mode, eslint + prettier.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
