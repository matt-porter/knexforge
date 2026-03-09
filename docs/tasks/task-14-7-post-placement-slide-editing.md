## Task 14.7: UI — Post-Placement Slide Editing

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Task 14.6 (placement UI)  
**Blocked by**: Task 14.6  
**Estimated effort**: 2–3 hours

---

### Problem Statement

Task 14.6 allows users to set the `slide_offset` when first placing a connector on a rod. But users also need to adjust the offset of already-placed connectors — to fine-tune a build or to make room for additional connectors. This task adds a post-placement editing mode where the user can select a placed connector and drag/nudge it along the rod it's attached to.

---

### Objectives

1. Add a "Slide" mode to the context menu or toolbar that activates when a placed connector has a slidable connection.
2. Allow the user to drag the connector along the rod axis (constrained to 1D movement).
3. Show the slide guide (from Task 14.6) during editing.
4. Update the connection's `slide_offset` in the build store as the user moves the connector.
5. Reposition the connector part instance to match the new offset.
6. Support undo/redo for slide edits.

---

### Implementation Details

#### 1. Detect slidable connections on selected part

When a part is selected, check if it has any connections with slidable ports:

```typescript
function getSlidableConnection(
  instanceId: string,
  connections: Connection[],
): Connection | null {
  return connections.find(conn => {
    const isFrom = conn.from_instance === instanceId && isSlidablePort(conn.from_port)
    const isTo = conn.to_instance === instanceId && isSlidablePort(conn.to_port)
    return isFrom || isTo
  }) ?? null
}
```

#### 2. Context menu integration

Add a "Slide Along Rod" option to the right-click context menu (in the component that renders `contextMenu`). This option only appears when the selected part has a slidable connection.

When clicked, enter "slide edit" mode — a new sub-mode of `select` mode.

#### 3. Slide edit mode

Add to the interaction store:
```typescript
isSlideEditing: boolean
slideEditInstanceId: string | null
slideEditConnectionIndex: number  // index in connections array
slideEditRodInstanceId: string | null
```

When in slide edit mode:
- Show the slide guide on the connected rod
- Capture arrow key / scroll input (same as Task 14.6)
- Update the connection's `slide_offset` and the part's `position` in real-time
- Click or press Enter to confirm; Escape to cancel (revert to original position)

#### 4. Reposition the part

When `slide_offset` changes, recompute the connector's position using `computeGhostTransform` with the new offset, then update the part instance in the build store:

```typescript
function updateSlidePosition(
  connection: Connection,
  newOffset: number,
  parts: Record<string, PartInstance>,
  partDefs: Map<string, KnexPartDef>,
) {
  // Determine which part is the connector and which is the rod
  // Recompute the connector's position using the new offset
  // Update the part's position and rotation in the store
}
```

#### 5. Build store action

Add a new action to the build store:

```typescript
updateSlideOffset: (connectionIndex: number, newOffset: number) => void
```

This action:
1. Snapshots the current state for undo
2. Updates `connections[index].slide_offset`
3. Recomputes and updates the connector part's position/rotation
4. Triggers stability recalculation

#### 6. Drag interaction (optional enhancement)

For mouse-based dragging, project the mouse position onto the rod's world-space axis and compute the corresponding `slide_offset`:

```typescript
function projectOntoRodAxis(
  mouseRay: Ray,
  rodWorldStart: Vector3,
  rodWorldEnd: Vector3,
): number {
  // Find closest point on the rod axis to the mouse ray
  // Convert to slide_offset relative to the port's default position
}
```

This is more complex and can be a stretch goal — keyboard-only editing is acceptable for MVP.

---

### Edge Cases

1. **Multiple slidable connections**: If a connector is attached to multiple rods via slidable ports (unlikely but possible), the context menu should let the user choose which connection to edit.
2. **Collision during editing**: As the user slides the connector, check for collisions with other connectors on the same rod (Task 14.5). Prevent sliding past a neighboring connector.
3. **Connected subgraph**: Moving a connector along a rod may invalidate other connections. For MVP, only allow slide editing on connectors that have exactly one connection (leaf nodes). For connectors with multiple connections, warn the user.
4. **Undo granularity**: Each distinct slide position should NOT create a separate undo entry. Instead, batch the entire slide edit (from start to confirm) into a single undo action.

---

### Files Modified

- `frontend/src/stores/interactionStore.ts` — slide edit mode state
- `frontend/src/stores/buildStore.ts` — `updateSlideOffset` action
- `frontend/src/components/Viewer/PartContextMenu.tsx` (or equivalent) — "Slide Along Rod" option
- `frontend/src/components/Viewer/SceneInteraction.tsx` — keyboard handlers for slide edit mode
- `frontend/src/components/Viewer/BuildScene.tsx` — render slide guide during editing

### Files NOT Modified

- Python core (no UI changes)
- Part JSON files
- Topology solver
- Snapping engine

---

### Tests and Validation

1. **Manual testing**:
   - Place a connector on a rod → select it → right-click → "Slide Along Rod"
   - Arrow keys move the connector along the rod
   - The connector's position updates in real-time
   - Pressing Enter commits the new position
   - Pressing Escape reverts to the original position
   - Undo reverts the entire slide edit

2. **Automated tests** (Vitest):
   - `updateSlideOffset` correctly updates connection and part position
   - `updateSlideOffset` creates a single undo entry
   - Collision detection prevents sliding past neighboring connectors
   - `getSlidableConnection` correctly identifies slidable connections

3. Run: `cd frontend && npm run type-check && npm run test`

---

### Completion Criteria

- [ ] Context menu shows "Slide Along Rod" for parts with slidable connections
- [ ] Slide edit mode allows keyboard-driven repositioning
- [ ] Part position updates in real-time during editing
- [ ] Connection's `slide_offset` is updated on confirm
- [ ] Undo/redo works correctly for slide edits
- [ ] Slide guide renders during editing
- [ ] Collision detection prevents overlapping connectors
- [ ] All existing tests pass unchanged
- [ ] TypeScript type-check passes
- [ ] `PLAN.md` updated with Task 14.7 status
- [ ] Committed with message `feat(ui): add post-placement slide editing (Task 14.7)`

---

### Project Basics (for standalone agents)

- **Frontend**: Code lives in `frontend/src/`. Run type-check with `cd frontend && npm run type-check`. Run tests with `cd frontend && npm run test`.
- **State management**: Zustand with Immer. Build store in `frontend/src/stores/buildStore.ts`.
- **Conventions**: Functional components + hooks, TypeScript strict mode.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
