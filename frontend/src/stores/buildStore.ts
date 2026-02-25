/**
 * Zustand build store — mirrors Python core's Build state on the frontend.
 *
 * Uses Immer for immutable mutations and maintains a patch-based undo/redo stack.
 * Communicates with the Python sidecar via Tauri commands (bridged through
 * the `SidecarBridge` abstraction).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PartInstance, Connection } from '../types/parts'
import { sidecarBridge } from '../services/sidecarBridge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A recorded action for undo/redo. */
export interface BuildAction {
  type: 'add_part' | 'remove_part' | 'snap'
  /** Snapshot before the action was applied (for undo). */
  before: BuildSnapshot
}

/** Minimal snapshot of the build state for undo/redo. */
export interface BuildSnapshot {
  parts: PartInstance[]
  connections: Connection[]
  stabilityScore: number
}

export interface BuildStore {
  // --- State ---
  /** All placed part instances, keyed by instance_id. */
  parts: Record<string, PartInstance>
  /** All connections between parts. */
  connections: Connection[]
  /** Current stability score (0–100, from Python core). */
  stabilityScore: number
  /** Tension / stress data for parts (0-1). */
  stressData: Record<string, number>
  /** Currently selected part instance ID, if any. */
  selectedPartId: string | null
  /** Undo stack (most recent action at end). */
  undoStack: BuildAction[]
  /** Redo stack (most recent undone action at end). */
  redoStack: BuildAction[]
  /** Whether the sidecar bridge is connected. */
  sidecarConnected: boolean

  // --- Actions ---
  /** Add a part instance to the build. */
  addPart: (instance: PartInstance) => void
  /** Remove a part instance by ID. */
  removePart: (instanceId: string) => void
  /** Add a connection (snap) between two ports. */
  addConnection: (connection: Connection) => void
  /** Select a part by instance ID (null to deselect). */
  selectPart: (instanceId: string | null) => void
  /** Undo the last action. Returns true if an action was undone. */
  undo: () => boolean
  /** Redo the last undone action. Returns true if an action was redone. */
  redo: () => boolean
  /** Replace the entire build state (e.g., from loading a .knx file). */
  loadBuild: (parts: PartInstance[], connections: Connection[], stabilityScore?: number) => void
  /** Clear the build completely. */
  clearBuild: () => void
  /** Set stability score (from sidecar response). */
  setStabilityScore: (score: number) => void
  /** Set stress data. */
  setStressData: (data: Record<string, number>) => void
  /** Recalculate stability using the backend bridge. */
  recalculateStability: () => Promise<void>
  /** Set sidecar connection status. */
  setSidecarConnected: (connected: boolean) => void

  // --- Derived ---
  /** Get the number of placed parts. */
  partCount: () => number
  /** Check if undo is available. */
  canUndo: () => boolean
  /** Check if redo is available. */
  canRedo: () => boolean
  /** Get a snapshot of the current state. */
  getSnapshot: () => BuildSnapshot
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSnapshot(state: {
  parts: Record<string, PartInstance>
  connections: Connection[]
  stabilityScore: number
}): BuildSnapshot {
  return {
    parts: Object.values(state.parts),
    connections: [...state.connections],
    stabilityScore: state.stabilityScore,
  }
}

function applySnapshot(
  draft: {
    parts: Record<string, PartInstance>
    connections: Connection[]
    stabilityScore: number
  },
  snapshot: BuildSnapshot,
): void {
  draft.parts = {}
  for (const p of snapshot.parts) {
    draft.parts[p.instance_id] = p
  }
  draft.connections = [...snapshot.connections]
  draft.stabilityScore = snapshot.stabilityScore
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBuildStore = create<BuildStore>()(
  immer((set, get) => ({
    // --- Initial state ---
    parts: {},
    connections: [],
    stabilityScore: 100,
    stressData: {},
    selectedPartId: null,
    undoStack: [],
    redoStack: [],
    sidecarConnected: false,

    // --- Actions ---
    addPart: (instance: PartInstance) => {
      set((state) => {
        if (state.parts[instance.instance_id]) return // already exists

        const before = createSnapshot(state)
        state.parts[instance.instance_id] = instance
        state.undoStack.push({ type: 'add_part', before })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    removePart: (instanceId: string) => {
      set((state) => {
        if (!state.parts[instanceId]) return // doesn't exist

        const before = createSnapshot(state)
        delete state.parts[instanceId]
        // Remove connections involving this part
        state.connections = state.connections.filter(
          (c) => c.from_instance !== instanceId && c.to_instance !== instanceId,
        )
        // Deselect if this was the selected part
        if (state.selectedPartId === instanceId) {
          state.selectedPartId = null
        }
        state.undoStack.push({ type: 'remove_part', before })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    addConnection: (connection: Connection) => {
      set((state) => {
        // Check both parts exist
        if (!state.parts[connection.from_instance] || !state.parts[connection.to_instance]) return

        // Don't add duplicate connections
        const exists = state.connections.some(
          (c) =>
            c.from_instance === connection.from_instance &&
            c.from_port === connection.from_port &&
            c.to_instance === connection.to_instance &&
            c.to_port === connection.to_port,
        )
        if (exists) return

        const before = createSnapshot(state)
        state.connections.push(connection)
        state.undoStack.push({ type: 'snap', before })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    selectPart: (instanceId: string | null) => {
      set((state) => {
        state.selectedPartId = instanceId
      })
    },

    undo: () => {
      const { undoStack } = get()
      if (undoStack.length === 0) return false

      set((state) => {
        const action = state.undoStack.pop()!
        const currentSnapshot = createSnapshot(state)
        applySnapshot(state, action.before)
        state.redoStack.push({ type: action.type, before: currentSnapshot })
      })
      get().recalculateStability()
      return true
    },

    redo: () => {
      const { redoStack } = get()
      if (redoStack.length === 0) return false

      set((state) => {
        const action = state.redoStack.pop()!
        const currentSnapshot = createSnapshot(state)
        applySnapshot(state, action.before)
        state.undoStack.push({ type: action.type, before: currentSnapshot })
      })
      get().recalculateStability()
      return true
    },

    loadBuild: (
      parts: PartInstance[],
      connections: Connection[],
      stabilityScore: number = 100,
    ) => {
      set((state) => {
        state.parts = {}
        for (const p of parts) {
          state.parts[p.instance_id] = p
        }
        state.connections = connections
        state.stabilityScore = stabilityScore
        state.stressData = {}
        state.selectedPartId = null
        state.undoStack = []
        state.redoStack = []
      })
      get().recalculateStability()
    },

    clearBuild: () => {
      set((state) => {
        const before = createSnapshot(state)
        state.parts = {}
        state.connections = []
        state.stabilityScore = 100
        state.stressData = {}
        state.selectedPartId = null
        // Keep undo so user can undo the clear
        state.undoStack.push({ type: 'remove_part', before })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    setStabilityScore: (score: number) => {
      set((state) => {
        state.stabilityScore = score
      })
    },

    setStressData: (data: Record<string, number>) => {
      set((state) => {
        state.stressData = data
      })
    },

    recalculateStability: async () => {
      const state = get()
      const partsList = Object.values(state.parts)
      if (partsList.length === 0) {
        state.setStabilityScore(100)
        state.setStressData({})
        return
      }
      try {
        const result = await sidecarBridge.requestStability(partsList, state.connections)
        state.setStabilityScore(result.stability)
        if (result.stress_data) {
          state.setStressData(result.stress_data)
        }
      } catch (err) {
        console.error('Failed to recalculate stability', err)
      }
    },

    setSidecarConnected: (connected: boolean) => {
      set((state) => {
        state.sidecarConnected = connected
      })
    },

    // --- Derived ---
    partCount: () => Object.keys(get().parts).length,
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,
    getSnapshot: () => createSnapshot(get()),
  })),
)
