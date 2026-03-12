## Task 16.8: Integration Testing & Documentation

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: All previous Phase 16 tasks
**Blocked by**: Tasks 16.1–16.7
**Estimated effort**: 2–3 hours

---

### Problem Statement

After all individual components are built, we need to verify that the full pipeline works end-to-end: user prompt → prompt matching → template selection → evolutionary generation → Rapier fitness → ranked candidates with 20+ parts. We also need to update documentation to reflect the new architecture.

---

### Objectives

1. Write integration tests exercising the full pipeline.
2. Verify determinism across seeded runs.
3. Update `goal-driven-synthesis.md` with new architecture details.

---

### Files

- `frontend/src/services/__tests__/synthesisPhase16Integration.test.ts` (NEW)
- `docs/goal-driven-synthesis.md` (MODIFY)

---

### Integration Test Scenarios

1. **Prompt-guided windmill generation:**
   - Goal: `{ prompt: "build a windmill", objectives: ["stability"], candidate_count: 3, seed: 42 }`
   - Assert: candidates have ≥15 parts, summary references windmill template, stability scores are non-trivial (> 0.3).

2. **Prompt-guided vehicle generation:**
   - Goal: `{ prompt: "make a race car", objectives: ["stability", "compactness"], candidate_count: 3, seed: 123 }`
   - Assert: candidates have ≥15 parts, summary references vehicle template.

3. **No-keyword fallback:**
   - Goal: `{ prompt: "something cool", objectives: ["stability"], candidate_count: 3, seed: 456 }`
   - Assert: still produces valid candidates (random template), ≥10 parts.

4. **Determinism:**
   - Run same goal with same seed twice → identical candidate scores and part counts.

5. **Large model capability:**
   - Goal: `{ prompt: "build a tower", constraints: { max_parts: 100 }, candidate_count: 2, seed: 789 }`
   - Assert: at least one candidate has ≥30 parts.

---

### Documentation Updates

Update `docs/goal-driven-synthesis.md` to reflect:

1. **Templates**: now includes Ferris Wheel, Vehicle Chassis, Tower/Bridge, Crane, Windmill alongside original 4.
2. **Mutations**: describes compound growth mutations (triangle brace, base frame, wheel assembly, etc.).
3. **Generation**: evolutionary loop with configurable population/generations.
4. **Physics**: Rapier fitness evaluation integrated into evolutionary scoring.
5. **Prompt Matching**: keyword-based template affinity system.
6. **Limitations**: update to reflect remaining limitations (e.g., Rapier eval adds generation time, very complex models may still timeout).

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisPhase16Integration.test.ts`

Full regression suite: `cd frontend && npx vitest run`

---

### Completion Criteria

- [ ] Integration test file created and passing
- [ ] 5 integration test scenarios implemented
- [ ] Determinism verified
- [ ] `goal-driven-synthesis.md` updated with new architecture
- [ ] Full test suite passes (`cd frontend && npx vitest run`)
- [ ] Changes committed
