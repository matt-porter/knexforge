## Task 15.1: Product Contract, Scope, and Shared TS Data Models

**Phase**: 15 — Goal-Driven Mechanism Synthesizer (Physics-Validated AI Design)
**Depends on**: None
**Blocked by**: None
**Estimated effort**: 2–4 hours

---

### Problem Statement

Phase 15 requires a stable data contract before worker orchestration, generation, scoring, and persistence can be built safely. Without a shared model layer, each synthesis component risks drifting on payload shape and field semantics, causing hard-to-debug runtime failures between UI, worker runtime, and persisted artifacts.

This task establishes the baseline TypeScript contracts for:

1. Goal authoring payloads.
2. Candidate/scoring payloads.
3. Worker request/response envelopes.
4. Persisted candidate artifact records.

It also adds backward-compatibility normalization for legacy field names (camelCase and prior aliases) so future migrations are less brittle.

---

### Objectives

1. Define strongly typed synthesis models in `frontend/src/types/synthesis.ts`.
2. Define explicit worker JSON contracts and persisted record contracts in `frontend/src/services/synthesis/contracts.ts`.
3. Add runtime parsing/normalization helpers for goal payloads, worker requests, and persisted records.
4. Add regression tests for modern payloads and legacy compatibility cases.

---

### Model Scope

The initial model set includes:

- `SynthesisGoal`
- `SynthesisConstraintSet`
- `SynthesisCandidate`
- `SynthesisScoreBreakdown`
- `SynthesisJobStatus`

And contract envelopes for:

- `SynthesisWorkerRequest`
- `SynthesisWorkerResponse`
- `PersistedSynthesisCandidateRecord`

---

### Validation + Compatibility Rules

1. `SynthesisGoal.objectives` must only contain supported values (`stability`, `part_efficiency`, `smooth_rotation`, `compactness`, `structural_simplicity`, `motion_range`).
2. `constraints.required_joint_types` only accepts `fixed`, `revolute`, `prismatic`.
3. Legacy aliases are accepted and normalized:
   - `goal_prompt` → `prompt`
   - `optimize_for` → `objectives`
   - `maxParts` → `max_parts`
   - `maxEnvelopeMm` → `max_envelope_mm`
   - `candidateCount` → `candidate_count`
   - `random_seed` → `seed`
4. Persisted candidate records accept both:
   - `schema_version` and `schemaVersion`
   - `saved_at` and `savedAt`
   - `candidates` and legacy `results`

---

### Files

- `frontend/src/types/synthesis.ts` (NEW)
- `frontend/src/services/synthesis/contracts.ts` (NEW)
- `frontend/src/services/__tests__/synthesisContracts.test.ts` (NEW)

---

### Test Plan

1. Verify modern goal payload parsing.
2. Verify legacy goal payload normalization.
3. Verify worker generate/cancel request parsing.
4. Verify invalid objective rejection.
5. Verify persisted v1 candidate record create/parse round-trip.
6. Verify legacy persisted record normalization.

Run:

- `python -m pytest src/core/tests/ --cov`
- `cd frontend && npm run test`

---

### Completion Criteria

- [ ] Shared synthesis models are typed and documented.
- [ ] Worker and persistence JSON contracts are explicit and versioned.
- [ ] Runtime normalization handles expected legacy payload aliases.
- [ ] Comprehensive unit/regression tests cover modern and legacy fixtures.
- [ ] Core and frontend required test suites pass.
- [ ] `PLAN.md` Task 15.1 is marked complete with status note.
- [ ] Changes are committed cleanly with a Conventional Commit and pushed to the feature branch.
