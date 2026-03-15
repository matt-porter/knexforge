## Task 16.6: Rapier Physics Post-Filter

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: Task 16.5 (evolutionary loop must exist to integrate into)
**Blocked by**: None
**Estimated effort**: 5–8 hours

---

### Problem Statement

Stability scoring currently uses crude geometric heuristics (bounding-box footprint, center-of-mass height). These can't detect that a properly triangulated frame is stable or that a top-heavy build will topple. We need to run actual physics simulations to validate stability.

The Rapier.js WASM engine is already integrated (`rapierSimulator.ts`) but is never used during synthesis. This task creates a lightweight Rapier evaluator for synthesis candidates and integrates it into the evolutionary fitness scoring.

---

### Objectives

1. Create a standalone Rapier stability evaluator that accepts a `SolvedTopologyBuild`.
2. Run a short physics sim: place model above ground, apply gravity, observe behavior.
3. Score stability based on: does it stay upright? Do joints hold?
4. Integrate Rapier scores into the evolutionary loop's fitness function.
5. Only evaluate top survivors (not entire population) to bound performance.

---

### Files

- `frontend/src/services/synthesis/rapierFitnessEval.ts` (NEW)
- `frontend/src/services/synthesis/evolutionaryGenerator.ts` (MODIFY)
- `frontend/src/services/synthesis/scoring.ts` (MODIFY — accept optional Rapier score)
- `frontend/src/services/__tests__/synthesisRapierFitness.test.ts` (NEW)

---

### Rapier Evaluator Design

```typescript
interface RapierFitnessResult {
  stabilityScore: number    // 0–1, based on final COM position vs initial
  jointIntegrity: number    // 0–1, based on max joint displacement
  isStable: boolean         // true if model stayed upright
  simTimeMs: number         // actual wall-clock time taken
}

async function evaluateRapierFitness(
  build: SolvedTopologyBuild,
  partDefsById: Map<string, KnexPartDef>,
  options?: { simDurationSec?: number; timestep?: number }
): Promise<RapierFitnessResult>
```

**Simulation setup:**
- Create fresh Rapier `World` with gravity `(0, -9.81, 0)`.
- Create a static ground plane at y=0.
- For each part in `build.parts`, create a `RigidBody` (dynamic) at its position/orientation.
- For each connection, create appropriate Rapier joint (`FixedImpulseJoint` or `RevoluteImpulseJoint`).
- Place model 10mm above ground (shift all y positions up by 10mm).
- Step simulation for 2s (480 steps at 1/240s timestep).

**Scoring logic:**
- `stabilityScore`: compare final COM height vs initial COM height. If model maintained height (±20%), score = 1.0. If COM dropped to ground, score ≈ 0.
- `jointIntegrity`: measure largest joint displacement. If joints held within tolerance, score = 1.0. If joints separated by > 50mm, score = 0 (explosion).
- `isStable`: `stabilityScore > 0.5 && jointIntegrity > 0.3`.

**Cleanup:** Destroy Rapier world after evaluation.

---

### Evolutionary Integration

In `evolutionaryGenerator.ts`:
- After the ranking step in each generation, run Rapier eval on the top `survivors` only.
- Blend Rapier stability into total score:
  - If `stability` objective is set: `totalScore = 0.5 * rapierStability + 0.3 * geometricScore + 0.2 * otherMetrics`
  - Otherwise: `totalScore = 0.3 * rapierStability + 0.4 * geometricScore + 0.3 * otherMetrics`
- Reject candidates where `jointIntegrity < 0.3`.

---

### Performance Constraints

- Each Rapier eval should take < 200ms (480 steps runs quickly with simple geometries).
- Only top 5 survivors per generation are evaluated = max 25 Rapier evals total (5 survivors × 5 generations).
- Estimated total Rapier time: ~5s worst case, well within the 120s timeout.

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisRapierFitness.test.ts`

> **Note:** Tests require `@dimforge/rapier3d-compat` WASM to be available in Vitest. The existing `rapierSimulator.test.ts` infrastructure should already handle WASM loading.

Tests:
- Stable flat build (rectangular frame) gets `stabilityScore > 0.7`
- Unstable build (single tall rod) gets `stabilityScore < 0.3`
- Joint explosion is detected (`jointIntegrity < 0.5`)
- `isStable` correctly reflects pass/fail
- Rapier world is cleaned up (no memory leak)

---

### Completion Criteria

- [ ] `rapierFitnessEval.ts` implemented
- [ ] Rapier scoring integrated into evolutionary loop
- [ ] Scoring weights updated for Rapier blend
- [ ] Joint explosion rejection works
- [ ] Rapier fitness tests pass
- [ ] Existing scoring tests still pass
- [ ] Changes committed
