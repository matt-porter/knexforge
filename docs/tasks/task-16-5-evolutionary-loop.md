## Task 16.5: Evolutionary Generation Loop

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: Task 16.1, 16.2, 16.3, 16.4
**Blocked by**: None (can develop concurrently but should be tested after dependencies)
**Estimated effort**: 4–6 hours

---

### Problem Statement

The current generator runs a **single pass**: pick template → mutate → validate → score → accept/reject. There is no iteration, no hill-climbing, no survival-of-the-fittest. A multi-generation evolutionary strategy would dramatically improve quality by testing far more variants and keeping only the best.

---

### Objectives

1. Implement `EvolutionaryGenerator` as a replacement for single-pass generation.
2. Support configurable population size, survivor count, children per survivor, and generation count.
3. Report progress after each generation via a callback (for progress bar integration).
4. Maintain determinism with seeded PRNG.

---

### Files

- `frontend/src/services/synthesis/evolutionaryGenerator.ts` (NEW)
- `frontend/src/workers/synthesisWorker.ts` (MODIFY)
- `frontend/src/types/synthesis.ts` (MODIFY — add `'evolving'` stage)
- `frontend/src/services/__tests__/synthesisEvolutionary.test.ts` (NEW)

---

### Algorithm

```
Parameters (configurable via SynthesisConstraintSet or defaults):
  populationSize = 20
  survivors = 5
  childrenPerSurvivor = 4
  generations = 5

1. INITIAL POPULATION
   - Generate `populationSize` candidates using existing pipeline:
     template (prompt-guided) → mutations → oracle → score
   - Reject invalid topologies (keep only oracle-valid candidates)

2. EVOLUTIONARY LOOP (repeat for `generations` rounds)
   a. RANK: sort population by total score descending
   b. SELECT: keep top `survivors`
   c. BREED: for each survivor, produce `childrenPerSurvivor` children:
      - Deep-clone survivor's topology
      - Apply 3–8 additional mutations
      - Validate through oracle
      - Score child
   d. MERGE: combine survivors + valid children into new population
   e. REPORT: call progress callback with (generation number, best score, candidate count)

3. FINAL SELECTION
   - Sort final population by score
   - Return top `candidate_count` candidates
```

### Worker Integration

In `synthesisWorker.ts`:
- Replace `CandidateGenerator` usage with `EvolutionaryGenerator`.
- The evolutionary loop calls `postProgress` after each generation with updated stage `'evolving'` and progress = `generation / totalGenerations`.
- Increase default timeout from 30s to 120s.

### Type Changes

Add `'evolving'` to `SynthesisJobStage`:
```typescript
export type SynthesisJobStage =
  | 'queued'
  | 'generating'
  | 'evolving'     // NEW
  | 'validating'
  | 'scoring'
  | 'ranking'
  | 'complete'
  | 'failed'
  | 'cancelled'
```

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisEvolutionary.test.ts`

Tests:
- Population grows over generations (more total candidates evaluated)
- Best score in final generation ≥ best score in generation 1
- Respects `candidate_count` in output
- Deterministic with same seed
- Progress callback fires once per generation
- Handles zero-valid-candidate gracefully (empty initial population)

---

### Completion Criteria

- [x] `EvolutionaryGenerator` implemented
- [x] Worker uses evolutionary generator
- [x] `'evolving'` stage added to types
- [x] Default timeout increased
- [x] Evolutionary tests pass
- [x] Existing worker/runtime tests still pass
- [x] Changes committed
