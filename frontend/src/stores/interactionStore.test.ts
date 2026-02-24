import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractionStore } from '../stores/interactionStore'

describe('interactionStore', () => {
  beforeEach(() => {
    useInteractionStore.setState({
      mode: 'select',
      placingPartId: null,
      ghostPosition: null,
      ghostRotation: [0, 0, 0, 1],
      snapTargetInstanceId: null,
      snapTargetPortId: null,
      snapPlacingPortId: null,
      isSnapped: false,
      hoveredPartId: null,
    })
  })

  // -------------------------------------------------------------------------
  // startPlacing / cancelPlacing
  // -------------------------------------------------------------------------

  describe('startPlacing', () => {
    it('switches to place mode with the given part ID', () => {
      useInteractionStore.getState().startPlacing('rod-54-blue-v1')

      const state = useInteractionStore.getState()
      expect(state.mode).toBe('place')
      expect(state.placingPartId).toBe('rod-54-blue-v1')
    })

    it('resets ghost state when starting placement', () => {
      // Set some ghost state first
      useInteractionStore.getState().setGhostPosition([10, 20, 30])
      useInteractionStore.getState().setSnapTarget('inst-1', 'A')

      useInteractionStore.getState().startPlacing('rod-54-blue-v1')

      const state = useInteractionStore.getState()
      expect(state.ghostPosition).toBeNull()
      expect(state.ghostRotation).toEqual([0, 0, 0, 1])
      expect(state.snapTargetInstanceId).toBeNull()
      expect(state.isSnapped).toBe(false)
    })

    it('can switch between part types', () => {
      useInteractionStore.getState().startPlacing('rod-54-blue-v1')
      useInteractionStore.getState().startPlacing('connector-8way-white-v1')

      expect(useInteractionStore.getState().placingPartId).toBe('connector-8way-white-v1')
    })
  })

  describe('cancelPlacing', () => {
    it('returns to select mode', () => {
      useInteractionStore.getState().startPlacing('rod-54-blue-v1')
      useInteractionStore.getState().cancelPlacing()

      const state = useInteractionStore.getState()
      expect(state.mode).toBe('select')
      expect(state.placingPartId).toBeNull()
    })

    it('clears ghost state', () => {
      useInteractionStore.getState().startPlacing('rod-54-blue-v1')
      useInteractionStore.getState().setGhostPosition([10, 0, 20])

      useInteractionStore.getState().cancelPlacing()

      expect(useInteractionStore.getState().ghostPosition).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Ghost position / rotation
  // -------------------------------------------------------------------------

  describe('setGhostPosition', () => {
    it('updates ghost position', () => {
      useInteractionStore.getState().setGhostPosition([10, 20, 30])
      expect(useInteractionStore.getState().ghostPosition).toEqual([10, 20, 30])
    })

    it('can be set to null', () => {
      useInteractionStore.getState().setGhostPosition([10, 20, 30])
      useInteractionStore.getState().setGhostPosition(null)
      expect(useInteractionStore.getState().ghostPosition).toBeNull()
    })
  })

  describe('setGhostRotation', () => {
    it('updates ghost rotation', () => {
      useInteractionStore.getState().setGhostRotation([0.5, 0, 0, 0.866])
      expect(useInteractionStore.getState().ghostRotation).toEqual([0.5, 0, 0, 0.866])
    })
  })

  describe('rotateGhost', () => {
    it('rotates ghost by 90° around Y', () => {
      useInteractionStore.getState().rotateGhost()

      const rot = useInteractionStore.getState().ghostRotation
      // After one 90° Y rotation from identity:
      // Expected: [0, sin(π/4), 0, cos(π/4)] ≈ [0, 0.707, 0, 0.707]
      expect(rot[0]).toBeCloseTo(0, 5)
      expect(rot[1]).toBeCloseTo(Math.sin(Math.PI / 4), 5)
      expect(rot[2]).toBeCloseTo(0, 5)
      expect(rot[3]).toBeCloseTo(Math.cos(Math.PI / 4), 5)
    })

    it('two rotations give 180°', () => {
      useInteractionStore.getState().rotateGhost()
      useInteractionStore.getState().rotateGhost()

      const rot = useInteractionStore.getState().ghostRotation
      // 180° around Y: [0, 1, 0, 0]
      expect(rot[0]).toBeCloseTo(0, 5)
      expect(Math.abs(rot[1])).toBeCloseTo(1, 5)
      expect(rot[2]).toBeCloseTo(0, 5)
      expect(rot[3]).toBeCloseTo(0, 4)
    })

    it('four rotations return to identity', () => {
      useInteractionStore.getState().rotateGhost()
      useInteractionStore.getState().rotateGhost()
      useInteractionStore.getState().rotateGhost()
      useInteractionStore.getState().rotateGhost()

      const rot = useInteractionStore.getState().ghostRotation
      // 360° ≡ identity, but quaternion may be [0,0,0,-1] (equivalent)
      // Check that it's equivalent to identity: either [0,0,0,1] or [0,0,0,-1]
      expect(rot[0]).toBeCloseTo(0, 4)
      expect(rot[1]).toBeCloseTo(0, 4)
      expect(rot[2]).toBeCloseTo(0, 4)
      expect(Math.abs(rot[3])).toBeCloseTo(1, 4)
    })
  })

  // -------------------------------------------------------------------------
  // Snap target
  // -------------------------------------------------------------------------

  describe('setSnapTarget', () => {
    it('sets snap target and isSnapped flag', () => {
      useInteractionStore.getState().setSnapTarget('inst-1', 'A', 'end1')

      const state = useInteractionStore.getState()
      expect(state.snapTargetInstanceId).toBe('inst-1')
      expect(state.snapTargetPortId).toBe('A')
      expect(state.snapPlacingPortId).toBe('end1')
      expect(state.isSnapped).toBe(true)
    })

    it('clears snap with nulls', () => {
      useInteractionStore.getState().setSnapTarget('inst-1', 'A', 'end1')
      useInteractionStore.getState().setSnapTarget(null, null, null)

      const state = useInteractionStore.getState()
      expect(state.isSnapped).toBe(false)
      expect(state.snapTargetInstanceId).toBeNull()
      expect(state.snapPlacingPortId).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Hover
  // -------------------------------------------------------------------------

  describe('setHoveredPart', () => {
    it('sets hovered part ID', () => {
      useInteractionStore.getState().setHoveredPart('part-1')
      expect(useInteractionStore.getState().hoveredPartId).toBe('part-1')
    })

    it('clears with null', () => {
      useInteractionStore.getState().setHoveredPart('part-1')
      useInteractionStore.getState().setHoveredPart(null)
      expect(useInteractionStore.getState().hoveredPartId).toBeNull()
    })
  })
})
