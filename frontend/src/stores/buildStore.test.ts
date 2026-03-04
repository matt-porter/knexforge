import { describe, it, expect, beforeEach } from 'vitest'
import { useBuildStore } from '../stores/buildStore'
import type { PartInstance, Connection } from '../types/parts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePart(id: string, partId: string = 'rod-54-blue-v1'): PartInstance {
  return {
    instance_id: id,
    part_id: partId,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  }
}

function makeConnection(
  fromInst: string,
  fromPort: string,
  toInst: string,
  toPort: string,
): Connection {
  return {
    from_instance: fromInst,
    from_port: fromPort,
    to_instance: toInst,
    to_port: toPort,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useBuildStore.setState({
      parts: {},
      connections: [],
      stabilityScore: 100,
      selectedPartId: null,
      undoStack: [],
      redoStack: [],
      sidecarConnected: false,
    })
  })

  // -------------------------------------------------------------------------
  // addPart
  // -------------------------------------------------------------------------

  describe('addPart', () => {
    it('adds a part to the store', () => {
      const { addPart } = useBuildStore.getState()
      const part = makePart('rod-1')

      addPart(part)

      const state = useBuildStore.getState()
      expect(state.parts['rod-1']).toEqual(part)
      expect(Object.keys(state.parts)).toHaveLength(1)
    })

    it('adds multiple parts', () => {
      const { addPart } = useBuildStore.getState()

      addPart(makePart('rod-1'))
      addPart(makePart('rod-2'))
      addPart(makePart('conn-1', 'connector-8way-white-v1'))

      const state = useBuildStore.getState()
      expect(Object.keys(state.parts)).toHaveLength(3)
    })

    it('ignores duplicate instance IDs', () => {
      const { addPart } = useBuildStore.getState()
      const part = makePart('rod-1')

      addPart(part)
      addPart(part) // should be ignored

      expect(Object.keys(useBuildStore.getState().parts)).toHaveLength(1)
    })

    it('pushes to undo stack', () => {
      const { addPart } = useBuildStore.getState()

      addPart(makePart('rod-1'))

      const state = useBuildStore.getState()
      expect(state.undoStack).toHaveLength(1)
      expect(state.undoStack[0].type).toBe('add_part')
    })

    it('clears redo stack on new action', () => {
      const { addPart, undo } = useBuildStore.getState()

      addPart(makePart('rod-1'))
      undo()
      expect(useBuildStore.getState().redoStack).toHaveLength(1)

      // New action should clear redo
      useBuildStore.getState().addPart(makePart('rod-2'))
      expect(useBuildStore.getState().redoStack).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // removePart
  // -------------------------------------------------------------------------

  describe('removePart', () => {
    it('removes a part from the store', () => {
      const { addPart, removePart } = useBuildStore.getState()

      addPart(makePart('rod-1'))
      removePart('rod-1')

      expect(useBuildStore.getState().parts['rod-1']).toBeUndefined()
      expect(Object.keys(useBuildStore.getState().parts)).toHaveLength(0)
    })

    it('removes connections involving the part', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))
      store.addPart(makePart('rod-2'))
      store.addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))
      store.addConnection(makeConnection('rod-2', 'end1', 'conn-1', 'B'))

      useBuildStore.getState().removePart('conn-1')

      const state = useBuildStore.getState()
      expect(state.connections).toHaveLength(0)
    })

    it('deselects the part if it was selected', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.selectPart('rod-1')
      expect(useBuildStore.getState().selectedPartId).toBe('rod-1')

      useBuildStore.getState().removePart('rod-1')
      expect(useBuildStore.getState().selectedPartId).toBeNull()
    })

    it('is a no-op for non-existent parts', () => {
      const { removePart } = useBuildStore.getState()
      removePart('non-existent')

      const state = useBuildStore.getState()
      expect(Object.keys(state.parts)).toHaveLength(0)
      // Should NOT push to undo stack for non-existent parts
      expect(state.undoStack).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // addConnection
  // -------------------------------------------------------------------------

  describe('addConnection', () => {
    it('adds a connection between two existing parts', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))

      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))

      const state = useBuildStore.getState()
      expect(state.connections).toHaveLength(1)
      expect(state.connections[0].from_instance).toBe('rod-1')
    })

    it('rejects connections to non-existent parts', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))

      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'ghost', 'A'))

      expect(useBuildStore.getState().connections).toHaveLength(0)
    })

    it('rejects duplicate connections', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))

      const conn = makeConnection('rod-1', 'end1', 'conn-1', 'A')
      useBuildStore.getState().addConnection(conn)
      useBuildStore.getState().addConnection(conn) // duplicate

      expect(useBuildStore.getState().connections).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // selectPart
  // -------------------------------------------------------------------------

  describe('selectPart', () => {
    it('selects a part', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      useBuildStore.getState().selectPart('rod-1')

      expect(useBuildStore.getState().selectedPartId).toBe('rod-1')
    })

    it('deselects with null', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      useBuildStore.getState().selectPart('rod-1')
      useBuildStore.getState().selectPart(null)

      expect(useBuildStore.getState().selectedPartId).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // undo / redo
  // -------------------------------------------------------------------------

  describe('undo', () => {
    it('undoes addPart', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      expect(useBuildStore.getState().partCount()).toBe(1)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(0)
    })

    it('undoes removePart (restores part)', () => {
      const store = useBuildStore.getState()
      const part = makePart('rod-1')

      store.addPart(part)
      useBuildStore.getState().removePart('rod-1')
      expect(useBuildStore.getState().partCount()).toBe(0)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(1)
      expect(useBuildStore.getState().parts['rod-1']).toEqual(part)
    })

    it('undoes removePart and restores connections', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))
      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))

      // Remove the connector (kills the connection)
      useBuildStore.getState().removePart('conn-1')
      expect(useBuildStore.getState().connections).toHaveLength(0)

      // Undo restores both part and connection
      useBuildStore.getState().undo()
      const state = useBuildStore.getState()
      expect(state.parts['conn-1']).toBeDefined()
      expect(state.connections).toHaveLength(1)
    })

    it('undoes addConnection', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))
      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))
      expect(useBuildStore.getState().connections).toHaveLength(1)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().connections).toHaveLength(0)
    })

    it('returns false when nothing to undo', () => {
      const result = useBuildStore.getState().undo()
      expect(result).toBe(false)
    })

    it('returns true when undo succeeds', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      const result = useBuildStore.getState().undo()
      expect(result).toBe(true)
    })

    it('multiple undos work correctly', () => {
      const store = useBuildStore.getState()

      store.addPart(makePart('rod-1'))
      useBuildStore.getState().addPart(makePart('rod-2'))
      useBuildStore.getState().addPart(makePart('rod-3'))
      expect(useBuildStore.getState().partCount()).toBe(3)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(2)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(1)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(0)

      // No more undos
      expect(useBuildStore.getState().undo()).toBe(false)
    })
  })

  describe('redo', () => {
    it('redoes an undone addPart', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(0)

      useBuildStore.getState().redo()
      expect(useBuildStore.getState().partCount()).toBe(1)
    })

    it('redoes an undone removePart', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().removePart('rod-1')
      useBuildStore.getState().undo() // restores rod-1
      expect(useBuildStore.getState().partCount()).toBe(1)

      useBuildStore.getState().redo() // re-removes rod-1
      expect(useBuildStore.getState().partCount()).toBe(0)
    })

    it('returns false when nothing to redo', () => {
      expect(useBuildStore.getState().redo()).toBe(false)
    })

    it('undo then redo is a no-op', () => {
      const part = makePart('rod-1')
      useBuildStore.getState().addPart(part)

      useBuildStore.getState().undo()
      useBuildStore.getState().redo()

      const state = useBuildStore.getState()
      expect(state.partCount()).toBe(1)
      expect(state.parts['rod-1']).toEqual(part)
    })

    it('multiple undo/redo cycles work', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().addPart(makePart('rod-2'))

      // Undo both
      useBuildStore.getState().undo()
      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(0)

      // Redo both
      useBuildStore.getState().redo()
      expect(useBuildStore.getState().partCount()).toBe(1)
      useBuildStore.getState().redo()
      expect(useBuildStore.getState().partCount()).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // canUndo / canRedo
  // -------------------------------------------------------------------------

  describe('canUndo / canRedo', () => {
    it('canUndo is false initially', () => {
      expect(useBuildStore.getState().canUndo()).toBe(false)
    })

    it('canRedo is false initially', () => {
      expect(useBuildStore.getState().canRedo()).toBe(false)
    })

    it('canUndo is true after an action', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      expect(useBuildStore.getState().canUndo()).toBe(true)
    })

    it('canRedo is true after undo', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().undo()
      expect(useBuildStore.getState().canRedo()).toBe(true)
    })

    it('canRedo is false after new action invalidates redo', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().undo()
      useBuildStore.getState().addPart(makePart('rod-2'))
      expect(useBuildStore.getState().canRedo()).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // loadBuild
  // -------------------------------------------------------------------------

  describe('loadBuild', () => {
    it('replaces entire build state', () => {
      // Start with something
      useBuildStore.getState().addPart(makePart('rod-1'))

      const parts: PartInstance[] = [makePart('new-1'), makePart('new-2')]
      const connections: Connection[] = [makeConnection('new-1', 'end1', 'new-2', 'end2')]

      useBuildStore.getState().loadBuild(parts, connections, 85)

      const state = useBuildStore.getState()
      expect(Object.keys(state.parts)).toHaveLength(2)
      expect(state.connections).toHaveLength(1)
      expect(state.stabilityScore).toBe(85)
    })

    it('clears undo/redo stacks', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().undo()

      useBuildStore.getState().loadBuild([], [])

      const state = useBuildStore.getState()
      expect(state.undoStack).toHaveLength(0)
      expect(state.redoStack).toHaveLength(0)
    })

    it('clears selection', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().selectPart('rod-1')

      useBuildStore.getState().loadBuild([], [])

      expect(useBuildStore.getState().selectedPartId).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // clearBuild
  // -------------------------------------------------------------------------

  describe('clearBuild', () => {
    it('removes all parts and connections', () => {
      const store = useBuildStore.getState()
      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))
      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))

      useBuildStore.getState().clearBuild()

      const state = useBuildStore.getState()
      expect(Object.keys(state.parts)).toHaveLength(0)
      expect(state.connections).toHaveLength(0)
    })

    it('is undoable (restores parts and connections)', () => {
      const store = useBuildStore.getState()
      store.addPart(makePart('rod-1'))
      store.addPart(makePart('conn-1', 'connector-8way-white-v1'))
      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))

      useBuildStore.getState().clearBuild()
      expect(useBuildStore.getState().partCount()).toBe(0)
      expect(useBuildStore.getState().connections).toHaveLength(0)

      useBuildStore.getState().undo()
      const state = useBuildStore.getState()
      expect(state.partCount()).toBe(2)
      expect(state.parts['rod-1']).toBeDefined()
      expect(state.parts['conn-1']).toBeDefined()
      expect(state.connections).toHaveLength(1)
    })

    it('is redoable after undo', () => {
      const store = useBuildStore.getState()
      store.addPart(makePart('rod-1'))
      store.addPart(makePart('rod-2'))

      // Clear the build
      useBuildStore.getState().clearBuild()
      expect(useBuildStore.getState().partCount()).toBe(0)

      // Undo the clear (restores parts)
      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(2)

      // Redo the clear (removes parts again)
      useBuildStore.getState().redo()
      expect(useBuildStore.getState().partCount()).toBe(0)
    })

    it('resets stability score', () => {
      useBuildStore.getState().setStabilityScore(42)
      useBuildStore.getState().clearBuild()
      expect(useBuildStore.getState().stabilityScore).toBe(100)
    })

    it('can undo/redo multiple times with clear', () => {
      const store = useBuildStore.getState()
      store.addPart(makePart('rod-1'))
      store.addPart(makePart('rod-2'))

      // Clear, undo, redo - should work smoothly
      useBuildStore.getState().clearBuild()
      expect(useBuildStore.getState().partCount()).toBe(0)

      useBuildStore.getState().undo()
      expect(useBuildStore.getState().partCount()).toBe(2)

      useBuildStore.getState().redo()
      const afterRedo = useBuildStore.getState()
      expect(afterRedo.partCount()).toBe(0)

      // Now add a new part (clear was redone, so only this part should exist)
      store.addPart(makePart('rod-3'))
      const finalState = useBuildStore.getState()
      expect(finalState.partCount()).toBe(1) // only rod-3 since clear was redone
    })
  })

  // -------------------------------------------------------------------------
  // setStabilityScore / setSidecarConnected
  // -------------------------------------------------------------------------

  describe('setStabilityScore', () => {
    it('updates the stability score', () => {
      useBuildStore.getState().setStabilityScore(75.5)
      expect(useBuildStore.getState().stabilityScore).toBe(75.5)
    })

    it('clamps scores to the valid 0-100 range', () => {
      useBuildStore.getState().setStabilityScore(135)
      expect(useBuildStore.getState().stabilityScore).toBe(100)

      useBuildStore.getState().setStabilityScore(-10)
      expect(useBuildStore.getState().stabilityScore).toBe(0)
    })

    it('ignores non-finite scores', () => {
      useBuildStore.getState().setStabilityScore(55)
      useBuildStore.getState().setStabilityScore(Number.NaN)
      expect(useBuildStore.getState().stabilityScore).toBe(55)
    })
  })

  describe('setSidecarConnected', () => {
    it('updates connected status', () => {
      useBuildStore.getState().setSidecarConnected(true)
      expect(useBuildStore.getState().sidecarConnected).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // partCount
  // -------------------------------------------------------------------------

  describe('partCount', () => {
    it('returns 0 for empty build', () => {
      expect(useBuildStore.getState().partCount()).toBe(0)
    })

    it('returns correct count', () => {
      useBuildStore.getState().addPart(makePart('a'))
      useBuildStore.getState().addPart(makePart('b'))
      useBuildStore.getState().addPart(makePart('c'))
      expect(useBuildStore.getState().partCount()).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // getSnapshot
  // -------------------------------------------------------------------------

  describe('getSnapshot', () => {
    it('returns a snapshot of the current state', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      useBuildStore.getState().addPart(makePart('conn-1', 'connector-8way-white-v1'))
      useBuildStore.getState().addConnection(makeConnection('rod-1', 'end1', 'conn-1', 'A'))
      useBuildStore.getState().setStabilityScore(88)

      const snap = useBuildStore.getState().getSnapshot()
      expect(snap.parts).toHaveLength(2)
      expect(snap.connections).toHaveLength(1)
      expect(snap.stabilityScore).toBe(88)
    })

    it('snapshot is independent of store mutations', () => {
      useBuildStore.getState().addPart(makePart('rod-1'))
      const snap = useBuildStore.getState().getSnapshot()

      useBuildStore.getState().addPart(makePart('rod-2'))

      expect(snap.parts).toHaveLength(1) // unchanged
      expect(useBuildStore.getState().partCount()).toBe(2)
    })
  })
})
