## Task 16.2: Compound Growth Mutations

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: None
**Blocked by**: None
**Estimated effort**: 4–6 hours

---

### Problem Statement

Only 2 of the current 4 mutations add parts, and each adds only a single part. Growth is pure random noise with no structural patterns. Real K'NEX builds use repeating motifs (triangulated braces, frames, star patterns) that the synthesizer should emulate.

---

### Objectives

1. Implement 6 compound growth mutations that add multi-part structural patterns.
2. Weight growth mutations higher (~60%) than tweak mutations (~40%) in `allMutations`.
3. Each mutation must handle edge cases (no free ports, missing part defs) gracefully by returning `false`.

---

### Files

- `frontend/src/services/synthesis/mutations.ts` (MODIFY)
- `frontend/src/services/__tests__/synthesisCompoundMutations.test.ts` (NEW)

---

### Mutation Specs

| Function | Parts Added | Logic |
|----------|-------------|-------|
| `mutateAddTriangleBrace` | 2 rods + 1 connector | Find two connectors with free ports at distance ≤ rod length, bridge them with two rods meeting at a new connector |
| `mutateAddBaseFrame` | 4 rods + 4 connectors | Find lowest connector, build a rectangle beneath it using 4 rods and 4 corner connectors |
| `mutateAddWheelAssembly` | 1 rod + 1 wheel + 1 connector | Find free connector port, attach axle rod + wheel |
| `mutateExtendChain` | 3–5 rod-connector pairs | From a free port, extend a linear chain of alternating rods and connectors |
| `mutateBranchStar` | N rods | Find a high-port connector (5+way) with ≥2 free ports, fill them all with rods |
| `mutateAddSymmetricArms` | 2 rods + 1–2 connectors | Find a hub connector with ≥1 rod attached, mirror the rod on the opposite port |

---

### Weighting Strategy

The `allMutations` array should include growth mutations with 2x frequency:

```typescript
export const allMutations: MutationOp[] = [
  // Tweak mutations (1x weight each)
  mutateRetwist,
  mutateSlideOffset,
  // Simple growth (2x weight)
  mutateAddRod, mutateAddRod,
  mutateAddConnector, mutateAddConnector,
  // Compound growth (2x weight)
  mutateAddTriangleBrace, mutateAddTriangleBrace,
  mutateAddBaseFrame, mutateAddBaseFrame,
  mutateAddWheelAssembly, mutateAddWheelAssembly,
  mutateExtendChain, mutateExtendChain,
  mutateBranchStar, mutateBranchStar,
  mutateAddSymmetricArms, mutateAddSymmetricArms,
]
```

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisCompoundMutations.test.ts`

For each mutation, test:
- Returns `true` and increases part count when applied to a valid model with free ports
- Returns `false` gracefully when no free ports are available
- Output topology passes oracle validation
- Part IDs are valid

---

### Completion Criteria

- [ ] 6 compound mutations implemented
- [ ] Weighting applied in `allMutations`
- [ ] Unit tests pass for all mutations
- [ ] Existing mutation/generator tests still pass
- [ ] Changes committed
