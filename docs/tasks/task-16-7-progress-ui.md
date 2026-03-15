## Task 16.7: Progress UI Improvements

**Phase**: 16 — Synthesis Panel Improvements
**Depends on**: Task 16.5 (evolutionary loop with progress callback)
**Blocked by**: None
**Estimated effort**: 2–3 hours

---

### Problem Statement

The current UI shows only a simple spinner during generation. With the evolutionary loop potentially running for 10–30 seconds, users need real feedback: how far along is generation? Which generation are we on? What's the best score so far?

---

### Objectives

1. Replace the simple spinner with a progress bar showing 0–100%.
2. Display current evolutionary generation (e.g., "Generation 3/5").
3. Show the best candidate score found so far.
4. Increase default `max_generation_time_ms` to 120s.
5. Hook into the `onProgress` callback from the runtime.

---

### Files

- `frontend/src/components/Synthesis/SynthesisPanel.tsx` (MODIFY)
- `frontend/src/stores/synthesisStore.ts` (MODIFY)

---

### Store Changes

Add new state fields to `SynthesisState`:
```typescript
progress: number           // 0.0 – 1.0
currentGeneration: number  // e.g. 3
totalGenerations: number   // e.g. 5
bestScoreSoFar: number     // best candidate total score seen

setProgress: (p: number) => void
setEvolutionInfo: (current: number, total: number, bestScore: number) => void
resetProgress: () => void
```

### Panel Changes

- Replace the SVG spinner animation with a styled progress bar:
  - Horizontal bar, full width of the panel
  - Blue fill (`PANEL_COLORS.accent`) animating left to right
  - Smooth CSS transition on width changes
- Below the progress bar, show text info:
  - "Generation 3 / 5 • Best Score: 0.72"
- In `handleGenerate`, pass an `onProgress` callback to `runtime.startJob` that parses the `SynthesisJobStatus.progress` and any extended metadata to update the store.

### Default Timeout

- Change `max_generation_time_ms` constraint default from `undefined` (30s in worker) to `120000` in the store's initial state.

---

### Test Plan

Run: `cd frontend && npx vitest run src/components/Synthesis/__tests__/SynthesisPanel.test.tsx`

Tests:
- Progress bar renders when `isGenerating` is true
- Progress bar width tracks `progress` state
- Generation info text shows correct values
- Spinner/progress bar hidden when not generating

---

### Completion Criteria

- [ ] Progress bar replaces spinner
- [ ] Generation count and best score displayed
- [ ] Default timeout increased to 120s
- [ ] Store state extended with progress fields
- [ ] Panel tests pass
- [ ] Changes committed
