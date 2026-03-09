import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractionStore } from '../interactionStore'

describe('interactionStore - slide controls', () => {
  beforeEach(() => {
    // Reset store before each test
    useInteractionStore.setState({
      slideOffset: 0,
      slideRange: null,
      mode: 'select',
      isSnapped: false,
    })
  })

  it('adjustSlideOffset clamps to slideRange', () => {
    const store = useInteractionStore.getState()
    
    // Set range to [-50, 50]
    store.setSlideRange([-50, 50])
    
    // Adjust by +10
    useInteractionStore.getState().adjustSlideOffset(10)
    expect(useInteractionStore.getState().slideOffset).toBe(10)
    
    // Adjust by +100 (should clamp to 50)
    useInteractionStore.getState().adjustSlideOffset(100)
    expect(useInteractionStore.getState().slideOffset).toBe(50)
    
    // Adjust by -200 (should clamp to -50)
    useInteractionStore.getState().adjustSlideOffset(-200)
    expect(useInteractionStore.getState().slideOffset).toBe(-50)
  })

  it('adjustSlideOffset does nothing if slideRange is null', () => {
    const store = useInteractionStore.getState()
    store.setSlideRange(null)
    
    useInteractionStore.getState().adjustSlideOffset(10)
    expect(useInteractionStore.getState().slideOffset).toBe(0)
  })

  it('resetSlideOffset sets offset to 0', () => {
    const store = useInteractionStore.getState()
    store.setSlideRange([-50, 50])
    store.adjustSlideOffset(20)
    expect(useInteractionStore.getState().slideOffset).toBe(20)
    
    useInteractionStore.getState().resetSlideOffset()
    expect(useInteractionStore.getState().slideOffset).toBe(0)
  })

  it('resets slide offset when cycling ports', () => {
    const store = useInteractionStore.getState()
    store.setSlideRange([-50, 50])
    store.adjustSlideOffset(10)
    
    // Cycle port
    useInteractionStore.getState().cyclePort()
    
    expect(useInteractionStore.getState().slideOffset).toBe(0)
  })

  it('retains slide offset when cycling sides', () => {
    const store = useInteractionStore.getState()
    store.setSlideRange([-50, 50])
    store.adjustSlideOffset(10)
    
    // Cycle side
    useInteractionStore.getState().cycleSide()
    
    expect(useInteractionStore.getState().slideOffset).toBe(10)
  })
})
