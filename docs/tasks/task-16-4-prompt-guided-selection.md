## Task 16.4: Prompt-Guided Template Selection

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: Task 16.1 (templates must exist to match against)
**Blocked by**: None
**Estimated effort**: 2–3 hours

---

### Problem Statement

The user's text prompt is currently **ignored** — template selection is purely random. Users expect "build me a car" to produce a vehicle, not a random spinner. This task wires prompt text into template selection via keyword matching.

---

### Objectives

1. Build a keyword-to-template affinity engine.
2. Each template declares associated keywords.
3. Prompt text is matched against keywords to bias template selection.
4. Multi-keyword prompts aggregate scores.
5. No-match prompts fall back to uniform random.
6. Case-insensitive, handles basic plurals.

---

### Files

- `frontend/src/services/synthesis/promptMatcher.ts` (NEW)
- `frontend/src/services/synthesis/generator.ts` (MODIFY)
- `frontend/src/services/synthesis/templates.ts` (MODIFY — add `keywords` field to `SynthesisTemplate`)
- `frontend/src/services/synthesis/templateCatalog/*.ts` (MODIFY — add keywords to each template)
- `frontend/src/services/__tests__/synthesisPromptMatcher.test.ts` (NEW)

---

### Keyword Registry

| Template | Keywords |
|----------|----------|
| Spinner | spin, spinner, top, propeller, rotate, rotation |
| Crank Slider | crank, slider, piston, oscillate, linear |
| Linkage Loop | linkage, 4-bar, four-bar, loop, parallel, mechanism |
| Motor Chain | chain, power, transfer, gear, transmission |
| Ferris Wheel | ferris, wheel, ride, carousel, amusement |
| Vehicle Chassis | car, vehicle, truck, buggy, racer, chassis, kart |
| Tower/Bridge | tower, bridge, truss, structure, skyscraper, building |
| Crane | crane, lift, hoist, boom, construction, jib |
| Windmill | windmill, turbine, wind, fan, blades, generator |

---

### Matching Algorithm

```typescript
interface TemplateAffinity {
  template: SynthesisTemplate
  score: number // 0 = no match, higher = stronger match
}

function matchPromptToTemplates(
  prompt: string,
  templates: SynthesisTemplate[]
): TemplateAffinity[]

function promptWeightedPick(
  prompt: string,
  templates: SynthesisTemplate[],
  random: DeterministicRandom
): SynthesisTemplate
```

- Tokenize prompt into words (split on whitespace/punctuation).
- Normalize: lowercase, strip trailing 's' for simple plural handling.
- For each template, count keyword matches → assign score.
- `promptWeightedPick`: if any template has score > 0, do weighted random pick proportional to scores. Otherwise uniform random.

---

### Test Plan

Run: `cd frontend && npx vitest run src/services/__tests__/synthesisPromptMatcher.test.ts`

Tests:
- "build a car" → vehicle chassis has highest affinity
- "spinning windmill" → windmill highest, spinner secondary
- "make something cool" → no matches, uniform fallback
- Case insensitivity: "CRANE" → crane template
- Multi-word: "a crane that spins" → crane highest
- Integration: verify generator with prompt "car" produces vehicle-chassis-based candidates

---

### Completion Criteria

- [ ] `promptMatcher.ts` implemented with keyword matching
- [ ] `SynthesisTemplate` interface updated with `keywords` field
- [ ] All 9 templates have keyword lists
- [ ] Generator uses prompt-weighted template selection
- [ ] Unit tests pass
- [ ] Integration test with real generator passes
- [ ] Changes committed
