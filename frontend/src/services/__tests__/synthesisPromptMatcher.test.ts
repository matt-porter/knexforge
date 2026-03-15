import { describe, it, expect } from 'vitest'
import { scoreTemplateAffinity, selectTemplateByPrompt } from '../synthesis/promptMatcher'
import { DeterministicRandom } from '../synthesis/mutations'

describe('Prompt-Guided Template Selection (Phase 16.4)', () => {
  describe('scoreTemplateAffinity', () => {
    it('scores windmill keywords correctly', () => {
      const scores = scoreTemplateAffinity('build a windmill')
      expect(scores.get('windmill-v1') ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('scores vehicle keywords correctly', () => {
      const scores = scoreTemplateAffinity('make a race car')
      expect(scores.get('vehicle-chassis-v1') ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('scores crane keywords correctly', () => {
      const scores = scoreTemplateAffinity('a big construction crane')
      expect(scores.get('crane-v1') ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('scores tower keywords correctly', () => {
      const scores = scoreTemplateAffinity('tall tower bridge')
      expect(scores.get('tower-bridge-v1') ?? 0).toBeGreaterThanOrEqual(2)
    })

    it('scores ferris wheel keywords correctly', () => {
      const scores = scoreTemplateAffinity('spinning ferris wheel')
      // 'spin' + 'ferris' + 'wheel' all map to ferris-wheel-v1
      expect(scores.get('ferris-wheel-v1') ?? 0).toBeGreaterThanOrEqual(2)
    })

    it('returns empty scores for unrelated prompt', () => {
      const scores = scoreTemplateAffinity('something totally random xyz')
      expect(scores.size).toBe(0)
    })

    it('handles simple stemming (plurals, -ing, -ed)', () => {
      const scores = scoreTemplateAffinity('spinning wheels')
      expect(scores.get('ferris-wheel-v1') ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('normalizes ing forms with doubled consonants', () => {
      const scores = scoreTemplateAffinity('spinning top')
      expect(scores.get('spinner-v1') ?? 0).toBeGreaterThanOrEqual(1)
    })
  })

  describe('selectTemplateByPrompt', () => {
    it('heavily favors matched template on keyword match', () => {
      // Use one deterministic RNG stream so the distribution reflects weighted picks
      // instead of seed-first-value artifacts.
      const templateCounts = new Map<string, number>()
      const random = new DeterministicRandom(42)

      for (let i = 0; i < 100; i++) {
        const template = selectTemplateByPrompt('build a crane', random)
        templateCounts.set(template.id, (templateCounts.get(template.id) ?? 0) + 1)
      }

      const craneCount = templateCounts.get('crane-v1') ?? 0
      const towerCount = templateCounts.get('tower-bridge-v1') ?? 0

      expect(craneCount).toBeGreaterThan(20)
      expect(craneCount).toBeGreaterThan(towerCount)
    })

    it('falls back to random selection when no keywords match', () => {
      const templateCounts = new Map<string, number>()
      const random = new DeterministicRandom(1337)

      for (let i = 0; i < 100; i++) {
        const template = selectTemplateByPrompt('something random xyz', random)
        templateCounts.set(template.id, (templateCounts.get(template.id) ?? 0) + 1)
      }

      // Random fallback should spread across the catalog.
      expect(templateCounts.size).toBeGreaterThan(3)
    })

    it('falls back to random selection on empty prompt', () => {
      const random = new DeterministicRandom(42)
      const template = selectTemplateByPrompt('', random)
      expect(template).toBeDefined()
      expect(template.id).toBeTruthy()
    })

    it('falls back to random selection on undefined prompt', () => {
      const random = new DeterministicRandom(42)
      const template = selectTemplateByPrompt(undefined, random)
      expect(template).toBeDefined()
      expect(template.id).toBeTruthy()
    })

    it('is deterministic with same seed', () => {
      const r1 = new DeterministicRandom(42)
      const r2 = new DeterministicRandom(42)
      const t1 = selectTemplateByPrompt('windmill', r1)
      const t2 = selectTemplateByPrompt('windmill', r2)
      expect(t1.id).toBe(t2.id)
    })
  })
})
