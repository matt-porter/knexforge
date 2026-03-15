## Task 16.3: Scaled Mutation Count

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: Task 16.2
**Blocked by**: None
**Estimated effort**: 30 minutes

---

### Problem Statement

The generator currently applies only 5–15 mutations per candidate. With compound mutations that add multi-part patterns, we need a higher range to let models grow to 30–50+ parts.

---

### Objectives

1. Increase mutation range from `(5, 15)` to `(15, 40)`.
2. Extract mutation range as named constants for clarity.
3. Add a regression test asserting generated candidates average ≥15 parts.

---

### Files

- `frontend/src/services/synthesis/generator.ts` (MODIFY)
- `frontend/src/services/__tests__/synthesisGenerator.test.ts` (MODIFY)

---

### Changes

In `generator.ts`:
```diff
+const MIN_MUTATIONS = 15
+const MAX_MUTATIONS = 40
+
 // 2. Structural Growth & Refinement Phase
-const mutationCount = random.nextInt(5, 15)
+const mutationCount = random.nextInt(MIN_MUTATIONS, MAX_MUTATIONS)
```

In `synthesisGenerator.test.ts`, add:
```typescript
it('generates candidates with at least 15 parts on average', () => {
  const goal = { ... seed: 42, candidate_count: 5 }
  const result = generator.generate(goal)
  const avgParts = result.candidates.reduce((s, c) => s + c.metrics.part_count, 0) / result.candidates.length
  expect(avgParts).toBeGreaterThanOrEqual(15)
})
```

---

### Completion Criteria

- [ ] Mutation range increased to (15, 40) with named constants
- [ ] Regression test for minimum part count added
- [ ] All existing generator tests still pass
- [ ] Changes committed
