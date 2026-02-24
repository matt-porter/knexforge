import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractionStore } from '../stores/interactionStore'

describe('Tab cycling does not reset activeSnapVariantIndex', () => {
  beforeEach(() => {
    // Reset store
    useInteractionStore.getState().cancelPlacing()
  })

  it('setSnapTarget does NOT reset index when instance stays the same', () => {
    const store = useInteractionStore.getState()

    // Start placement targeting rod-1
    store.startPlacing('connector-4way-green-v1', 'rod-1')

    // Initial snap to center_axial_1 (variant 0)
    store.setSnapTarget('rod-1', 'center_axial_1', 'center')
    expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(0)

    // User presses Tab → cycles to variant 1
    store.cycleSnapVariant()
    expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(1)

    // PortIndicators effect fires → sets snap to center_axial_2 (different port, SAME instance)
    useInteractionStore.getState().setSnapTarget('rod-1', 'center_axial_2', 'center')

    // BUG FIX: variant index should NOT reset to 0
    expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(1)
  })

  it('setSnapTarget DOES reset index when instance changes', () => {
    const store = useInteractionStore.getState()

    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.setSnapTarget('rod-1', 'center_axial_1', 'center')
    store.cycleSnapVariant()
    expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(1)

    // User moves to a completely different part → should reset
    useInteractionStore.getState().setSnapTarget('rod-2', 'end1', 'A')
    expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(0)
  })

  it('Tab can cycle through all 8 variants without resetting', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')

    // Simulate hovering center indicator → initial snap
    store.setSnapTarget('rod-1', 'center_axial_1', 'center')

    // Simulate pressing Tab 7 times (cycling through 8 variants)
    const portSequence = [
      'center_axial_2',    // variant 1
      'center_tangent',    // variant 2 (SIDE CLIP!)
      'center_tangent',    // variant 3
      'center_tangent',    // variant 4
      'center_tangent',    // variant 5
      'center_tangent',    // variant 6
      'center_tangent',    // variant 7
    ]

    for (let i = 0; i < 7; i++) {
      store.cycleSnapVariant()
      const idx = useInteractionStore.getState().activeSnapVariantIndex
      expect(idx).toBe(i + 1)

      // Simulate PortIndicators effect calling setSnapTarget with the variant's port
      useInteractionStore.getState().setSnapTarget('rod-1', portSequence[i], 'A')

      // Index must NOT have been reset
      expect(useInteractionStore.getState().activeSnapVariantIndex).toBe(i + 1)
    }
  })
})
