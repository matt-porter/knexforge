import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { featureFlags } from '../../config/featureFlags'

describe('Feature Flags Service', () => {
  beforeEach(() => {
    // Reset flags to defaults
    featureFlags.set('enableAiSynthesis', false)
    featureFlags.set('enableSlideOffset', true)
  })

  it('provides default values correctly', () => {
    expect(featureFlags.get('enableAiSynthesis')).toBe(false)
    expect(featureFlags.get('enableSlideOffset')).toBe(true)
  })

  it('allows programmatic overriding of flags', () => {
    featureFlags.set('enableAiSynthesis', true)
    expect(featureFlags.get('enableAiSynthesis')).toBe(true)
  })

  it('can return all flags as an object', () => {
    featureFlags.set('enableAiSynthesis', true)
    featureFlags.set('enableSlideOffset', false)
    
    const all = featureFlags.getAll()
    expect(all).toEqual({
      enableAiSynthesis: true,
      enableSlideOffset: false
    })
  })
})
