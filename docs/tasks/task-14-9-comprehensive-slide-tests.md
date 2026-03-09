## Task 14.9: Comprehensive Slide Offset Test Suite

**Phase**: 14 — Sliding Connectors Along Rods  
**Depends on**: Tasks 14.1–14.8  
**Blocked by**: Task 14.8  
**Estimated effort**: 2–3 hours

---

### Problem Statement

With `slide_offset` touching the Connection model, snapping engine, file I/O, topology solver, build store, physics engines, and UI, a comprehensive integration test suite is needed to verify correctness across all layers and catch regressions.

This task creates end-to-end tests that exercise the full slide offset pipeline, from placement through serialization and physics simulation.

---

### Objectives

1. Create integration tests that verify the full pipeline: place → serialize → deserialize → solve → simulate.
2. Create cross-layer consistency tests: Python core and TypeScript frontend produce the same results for the same inputs.
3. Create regression tests for edge cases identified in Tasks 14.1–14.8.
4. Create visual regression fixtures for common slide offset configurations.

---

### Test Categories

#### Category 1: Model & Serialization Round-Trip

1. **Basic round-trip**: Create a connection with `slide_offset=25.0`, export to JSON, import, verify offset preserved.
2. **Zero offset round-trip**: `slide_offset=0.0` is omitted from JSON, re-imported as `0.0`.
3. **Negative offset**: `slide_offset=-30.0` round-trips correctly.
4. **Legacy compatibility**: Import a `.knx` file from before Phase 14 — all connections have `slide_offset=0.0`.
5. **Topology compact format**: `@slide=+20` annotation round-trips through parse → emit → parse.

#### Category 2: Snapping & Alignment

6. **Center offset alignment**: Place a connector at `slide_offset=+20` on a 128mm rod. Verify the connector's world position is 20mm toward end2 from center.
7. **Negative offset alignment**: `slide_offset=-20` places the connector 20mm toward end1.
8. **Maximum offset**: `slide_offset=+57` (near end2) — connector is positioned near the rod end.
9. **Clamped offset**: `slide_offset=+100` is clamped to the valid range (~57mm).
10. **Zero offset equivalence**: `slide_offset=0` produces the exact same result as no offset at all.

#### Category 3: Multiple Connectors

11. **Two connectors, same rod, different offsets**: Both placed successfully, both at correct positions.
12. **Collision rejection**: Two connectors at offsets 5mm apart — rejected (within connector diameter).
13. **Different tangent sides, same offset**: `center_tangent_y_pos` and `center_tangent_z_pos` at the same offset — both accepted.
14. **Three connectors on a long rod**: Offsets -40, 0, +40 on a 128mm rod — all placed correctly.

#### Category 4: Topology Solver

15. **Chain with offset**: Solve a 3-part chain (rod-connector-rod) where the connector is offset +20mm on the first rod.
16. **Loop with offset**: Solve a loop where one connection has `slide_offset`. Loop should close if geometry allows.
17. **Residual with offset**: Verify `connectionResidual` correctly uses the offset position.

#### Category 5: Physics

18. **Gravity slide test (`center_axial`)**: Rod + `center_axial` offset connector under gravity — verify the connector slides along the rod axis to the expected equilibrium (bottom of vertical rod, stays at offset on horizontal rod). For `center_tangent`, verify **static stability** — connector stays at the user-set offset position (fixed joint).
19. **Two connectors on same rod**: Both maintain their offset positions after simulation (`center_tangent`), or slide to equilibrium (`center_axial`).
20. **Motor with offset**: `center_axial` compound joint (dummy body with prismatic + revolute) with offset — motor drives rotation via the revolute joint while the prismatic joint allows independent axial slide under gravity.
21. **`center_axial` on horizontal rod — offset preserved**: Place a `center_axial` connector at `slide_offset=+20` on a horizontal rod. Simulate with gravity. Verify the connector stays near +20mm (no gravity component along the rod axis).

#### Category 6: UI Integration (Manual)

22. **Slide during placement**: Arrow keys move ghost along rod, HUD shows offset.
23. **Post-placement editing**: Select connector, right-click, "Slide Along Rod", arrow keys reposition.
24. **Undo/redo**: Undo a slide edit, connector returns to original position.
25. **Save/load**: Save a build with offset connectors, reload, positions preserved.

---

### Implementation

Create test files:
- `src/core/tests/test_slide_offset.py` — Python integration tests (categories 1, 2, 3 partially)
- `frontend/src/services/__tests__/slideOffset.test.ts` — TypeScript integration tests (categories 2, 3, 4)
- `frontend/src/services/__tests__/slideOffsetPhysics.test.ts` — Physics tests (category 5)

Use existing test fixtures from `frontend/src/services/__tests__/partFixtures.ts` and extend with slide-offset configurations.

---

### Test Infrastructure

For Python tests, create a helper:
```python
def make_slide_connection(
    from_inst: str, from_port: str,
    to_inst: str, to_port: str,
    slide_offset: float = 0.0,
    **kwargs,
) -> Connection:
    return Connection(
        from_instance=from_inst,
        from_port=from_port,
        to_instance=to_inst,
        to_port=to_port,
        slide_offset=slide_offset,
        **kwargs,
    )
```

For TypeScript tests, create topology shorthand fixtures with `@slide` annotations.

---

### Files Created

- `src/core/tests/test_slide_offset.py` — NEW
- `frontend/src/services/__tests__/slideOffset.test.ts` — NEW
- `frontend/src/services/__tests__/slideOffsetPhysics.test.ts` — NEW (optional, if physics tests are feasible in Vitest)

### Files Modified

- `frontend/src/services/__tests__/partFixtures.ts` — extend with slide configurations (if needed)

---

### Completion Criteria

- [ ] ≥ 21 tests covering categories 1–5
- [ ] All tests pass
- [ ] Coverage ≥ 90% on slide-offset-related code paths
- [ ] No regressions in existing test suites
- [ ] Manual testing checklist (category 6) documented and verified
- [ ] `PLAN.md` updated with Task 14.9 status
- [ ] Committed with message `test: comprehensive slide offset test suite (Task 14.9)`

---

### Project Basics (for standalone agents)

- **Python tests**: `.\.venv\Scripts\python.exe -m pytest src/core/tests/ -v --cov`
- **Frontend tests**: `cd frontend && npx vitest run`
- **Test conventions**: pytest for Python, Vitest for TypeScript. Each test <100ms. Use shared fixtures.
- **After completing**: Update `PLAN.md`, commit with Conventional Commits format.
