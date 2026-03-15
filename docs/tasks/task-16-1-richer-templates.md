## Task 16.1: Richer Seed Templates

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: None
**Blocked by**: None
**Estimated effort**: 4–6 hours

---

### Problem Statement

Current seed templates generate only 4–9 parts. Models never grow beyond ~16 parts because the mutation pass starts from such a small base. We need templates that begin at 15–25 parts, representing recognizable K'NEX creations.

---

### Objectives

1. Add 5 new templates: Ferris Wheel (~25 parts), Vehicle Chassis (~20 parts), Tower/Bridge (~20 parts), Crane (~18 parts), Windmill (~18 parts).
2. Each template must produce a valid `TopologyModel` that passes the existing `TopologyOracle`.
3. Templates must support `requireMotor` parameter where applicable.
4. Register all templates in the catalog index.

---

### Files

- `frontend/src/services/synthesis/templateCatalog/ferrisWheel.ts` (NEW)
- `frontend/src/services/synthesis/templateCatalog/vehicleChassis.ts` (NEW)
- `frontend/src/services/synthesis/templateCatalog/towerBridge.ts` (NEW)
- `frontend/src/services/synthesis/templateCatalog/crane.ts` (NEW)
- `frontend/src/services/synthesis/templateCatalog/windmill.ts` (NEW)
- `frontend/src/services/synthesis/templateCatalog/index.ts` (MODIFY)
- `frontend/src/services/__tests__/synthesisNewTemplates.test.ts` (NEW)

---

### Template Specs

| Template | Min Parts | Key Parts Used | Parametric Axes |
|----------|----------|----------------|-----------------|
| Ferris Wheel | 25 | 8-way white hub, blue rods (spokes), 5-way yellow (rim), red rods (rim segments) | Spoke count (4–6) |
| Vehicle Chassis | 20 | Red rods (frame), connectors (corners), green rods (axle stubs), wheels, motor | Wheelbase length |
| Tower/Bridge | 20 | Grey rods (verticals), white rods (cross-members), blue rods (diagonal braces) | Panel count |
| Crane | 18 | Base frame, grey rod (tower), yellow rod (boom), blue rod (diagonal support), motor at pivot | Boom length |
| Windmill | 18 | Grey rod (mast), motor, 5/7-way connector (hub), blue/yellow rods (blades) | Blade count (3–4) |

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisNewTemplates.test.ts src/services/__tests__/synthesisTemplates.test.ts`

Tests should verify:
- Each template has required metadata (id, name, description)
- `generate({})` produces valid topology (passes `validateTemplateOutput`)
- `generate({ requireMotor: false })` produces valid topology
- Part count ≥ 15 for all new templates
- All part IDs exist in `partDefsById` fixture

---

### Completion Criteria

- [ ] 5 new templates implemented and registered in catalog
- [ ] All templates produce valid topologies
- [ ] Template tests pass
- [ ] Existing template tests still pass
- [ ] Changes committed
