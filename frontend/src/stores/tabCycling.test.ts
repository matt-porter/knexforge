import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractionStore } from '../stores/interactionStore'

describe('Port/angle cycling (Tab/R keys)', () => {
  beforeEach(() => {
    useInteractionStore.getState().cancelPlacing()
  })

  it('setSnapTarget does NOT reset indices when instance stays the same', () => {
    const store = useInteractionStore.getState()

    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.setSnapTarget('rod-1', 'center_axial_1', 'center')
    expect(useInteractionStore.getState().activePortIndex).toBe(0)
    expect(useInteractionStore.getState().activeSideIndex).toBe(0)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)

    // User presses Tab → cycles port
    store.cyclePort()
    expect(useInteractionStore.getState().activePortIndex).toBe(1)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)

    // PortIndicators effect fires → sets snap to different port, SAME instance
    useInteractionStore.getState().setSnapTarget('rod-1', 'center_axial_2', 'A')

    // Indices should NOT reset
    expect(useInteractionStore.getState().activePortIndex).toBe(1)
  })

  it('setSnapTarget DOES reset indices when instance changes', () => {
    const store = useInteractionStore.getState()

    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.setSnapTarget('rod-1', 'center_axial_1', 'center')
    store.cyclePort()
    expect(useInteractionStore.getState().activePortIndex).toBe(1)

    // User moves to a completely different part → should reset
    useInteractionStore.getState().setSnapTarget('rod-2', 'end1', 'A')
    expect(useInteractionStore.getState().activePortIndex).toBe(0)
    expect(useInteractionStore.getState().activeSideIndex).toBe(0)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)
  })

  it('cyclePort increments port index and resets angle index', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')

    // Cycle angle a few times first
    store.cycleAngle()
    store.cycleAngle()
    expect(useInteractionStore.getState().activeAngleIndex).toBe(2)

    // Cycle port → resets angle
    store.cyclePort()
    expect(useInteractionStore.getState().activePortIndex).toBe(1)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)
  })

  it('cycleAngle increments angle index without affecting port index', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')

    store.cyclePort()
    expect(useInteractionStore.getState().activePortIndex).toBe(1)

    store.cycleAngle()
    store.cycleAngle()
    expect(useInteractionStore.getState().activeAngleIndex).toBe(2)
    expect(useInteractionStore.getState().activePortIndex).toBe(1)
  })

  it('startPlacing resets both indices', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.cyclePort()
    store.cycleAngle()

    store.startPlacing('connector-3way-red-v1', 'rod-2')
    expect(useInteractionStore.getState().activePortIndex).toBe(0)
    expect(useInteractionStore.getState().activeSideIndex).toBe(0)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)
  })

  it('cancelPlacing resets both indices', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.cyclePort()
    store.cycleAngle()

    store.cancelPlacing()
    expect(useInteractionStore.getState().activePortIndex).toBe(0)
    expect(useInteractionStore.getState().activeSideIndex).toBe(0)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)
  })

  it('cycleSide increments side index and resets angle index', () => {
    const store = useInteractionStore.getState()
    store.startPlacing('connector-4way-green-v1', 'rod-1')
    store.cycleAngle()
    store.cycleAngle()

    store.cycleSide()
    expect(useInteractionStore.getState().activeSideIndex).toBe(1)
    expect(useInteractionStore.getState().activeAngleIndex).toBe(0)
  })
})
