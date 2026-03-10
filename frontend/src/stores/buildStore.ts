/**
 * Zustand build store — mirrors Python core's Build state on the frontend.
 *
 * Uses Immer for immutable mutations and maintains a patch-based undo/redo stack.
 * Communicates with the Python sidecar via Tauri commands (bridged through
 * the `SidecarBridge` abstraction).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PartInstance, Connection, KnexPartDef } from '../types/parts'
import { sidecarBridge } from '../services/sidecarBridge'
import { isSlidablePort, getSlideFamily, familiesInterfere, computeGhostTransform, getPortWorldPose } from '../helpers/snapHelper'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A recorded action for undo/redo. */
export interface BuildAction {
  type: 'add_part' | 'remove_part' | 'snap' | 'center_build'
  /** Snapshot before the action was applied (for undo). */
  before: BuildSnapshot
  /** Snapshot after the action was applied (for redo). Optional for backward compatibility. */
  after?: BuildSnapshot
}

/** Minimal snapshot of the build state for undo/redo. */
export interface BuildSnapshot {
  parts: PartInstance[]
  connections: Connection[]
  stabilityScore: number
}

export interface BuildStore {
  // --- State ---
  /** Current local model ID (if loaded from/saved to local storage) */
  currentModelId: string | null
  /** Current local model Title */
  currentModelTitle: string
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
  /** Append parts and connections to the current build. */
  appendBuild: (parts: PartInstance[], connections: Connection[]) => void
  /** Clear the build completely. */
  clearBuild: () => void
  /** Update color of a specific part instance. */
  updatePartColor: (instanceId: string, color: string) => void
  /** Toggle pinned status of a specific part instance. */
  togglePinPart: (instanceId: string) => void
  /** Center the entire build above ground plane and horizontally centered. */
  centerBuild: () => void
  /** Set stability score (from sidecar response). */
  setStabilityScore: (score: number) => void
  /** Set stress data. */
  setStressData: (data: Record<string, number>) => void
  /** Recalculate stability using the backend bridge. */
  recalculateStability: () => Promise<void>
  /** Run a rapid physics-based stability check (gravity collapse). */
  testStability: () => Promise<void>
  /** Set sidecar connection status. */
  setSidecarConnected: (connected: boolean) => void
  /** Update current model metadata */
  setCurrentModelMeta: (id: string | null, title?: string) => void
  /** Update the slide offset of an existing connection and reposition the attached part. */
  updateSlideOffset: (connectionIndex: number, newOffset: number, partDefs: Map<string, KnexPartDef>) => void
  /** End a slide edit operation and commit the undo snapshot. */
  commitSlideEdit: (beforeSnapshot: BuildSnapshot) => void
  /** Revert a slide edit operation to the original snapshot. */
  revertSlideEdit: (snapshot: BuildSnapshot) => void

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

function normalizeStabilityScore(score: number): number | null {
  if (!Number.isFinite(score)) return null
  return Math.max(0, Math.min(100, score))
}

function normalizeLegacyRodSidePortId(portId: string): string {
  return portId === 'center_tangent' ? 'center_tangent_y_pos' : portId
}

function normalizeConnectionPorts(connection: Connection): Connection {
  return {
    ...connection,
    from_port: normalizeLegacyRodSidePortId(connection.from_port),
    to_port: normalizeLegacyRodSidePortId(connection.to_port),
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBuildStore = create<BuildStore>()(
  immer((set, get) => ({
    // --- Initial state ---
    currentModelId: null,
    currentModelTitle: 'Untitled Build',
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
        const after = createSnapshot(state)
        state.undoStack.push({ type: 'add_part', before, after })
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
        const after = createSnapshot(state)
        state.undoStack.push({ type: 'remove_part', before, after })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    addConnection: (connection: Connection) => {
      set((state) => {
        const normalizedConnection = normalizeConnectionPorts(connection)

        // Check both parts exist
        if (!state.parts[normalizedConnection.from_instance] || !state.parts[normalizedConnection.to_instance]) return

        // Don't add duplicate connections
        const exists = state.connections.some(
          (c) =>
            c.from_instance === normalizedConnection.from_instance &&
            c.from_port === normalizedConnection.from_port &&
            c.to_instance === normalizedConnection.to_instance &&
            c.to_port === normalizedConnection.to_port,
        )
        if (exists) return

        if (isSlidablePort(normalizedConnection.from_port) || isSlidablePort(normalizedConnection.to_port)) {
          const rodId = isSlidablePort(normalizedConnection.from_port)
            ? normalizedConnection.from_instance
            : normalizedConnection.to_instance
          const portId = isSlidablePort(normalizedConnection.from_port)
            ? normalizedConnection.from_port
            : normalizedConnection.to_port
          const newFamily = getSlideFamily(portId)!
          const newOffset = normalizedConnection.slide_offset ?? 0
          const MIN_SPACING_MM = 15.0

          const collision = state.connections.some(conn => {
            const existingRodId = conn.from_instance === rodId ? conn.from_instance
                                : conn.to_instance === rodId ? conn.to_instance : null
            if (!existingRodId) return false
            const existingPortId = conn.from_instance === rodId ? conn.from_port : conn.to_port
            if (!isSlidablePort(existingPortId)) return false
            const existingFamily = getSlideFamily(existingPortId)!
            const existingOffset = conn.slide_offset ?? 0

            // Same family, same offset -> duplicate
            if (existingFamily === newFamily && existingOffset === newOffset) return true
            // Axial/tangent interference at same offset
            if (existingOffset === newOffset && familiesInterfere(newFamily, existingFamily)) return true
            // Same family, too close
            if (existingFamily === newFamily && Math.abs(existingOffset - newOffset) < MIN_SPACING_MM) return true
            return false
          })

          if (collision) {
            console.warn('Slide collision on rod — placement rejected')
            return
          }
        }

        const before = createSnapshot(state)
        state.connections.push(normalizedConnection)
        const after = createSnapshot(state)
        state.undoStack.push({ type: 'snap', before, after })
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
        // Handle backward compatibility for old actions without 'after' field
        const afterSnapshot = action.after ?? createSnapshot(state)
        
        // Capture current state BEFORE undo (this becomes the "before" for redo)
        const currentStateBeforeUndo = createSnapshot(state)
        
        // Apply the undo (restore to state before original action)
        applySnapshot(state, action.before)
        
        // After undoing:
        // - before = state before this undo operation  
        // - after = state after this undo operation (which is what we just applied)
        state.redoStack.push({ type: action.type, before: currentStateBeforeUndo, after: afterSnapshot })
      })
      get().recalculateStability()
      return true
    },

    redo: () => {
      const { redoStack } = get()
      if (redoStack.length === 0) return false

      set((state) => {
        const action = state.redoStack.pop()!
        // Handle backward compatibility: if no 'after' snapshot, use before as fallback
        const afterSnapshot = action.after ?? action.before
        
        // Capture current state BEFORE applying redo (this becomes the new "before")
        const currentStateBeforeRedo = createSnapshot(state)
        
        // Apply the redo (restore to state after original action)
        applySnapshot(state, afterSnapshot)
        
        // After redoing:
        // - before = state before this redo operation
        // - after = state after this redo operation (which is what we just applied)
        state.undoStack.push({ type: action.type, before: currentStateBeforeRedo, after: afterSnapshot })
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
        state.connections = connections.map(normalizeConnectionPorts)
        state.stabilityScore = stabilityScore
        state.stressData = {}
        state.selectedPartId = null
        state.undoStack = []
        state.redoStack = []
      })
      get().recalculateStability()
    },

    appendBuild: (parts: PartInstance[], connections: Connection[]) => {
      set((state) => {
        const before = createSnapshot(state)
        
        // Map old IDs to new IDs to avoid conflicts
        const idMap: Record<string, string> = {}
        
        for (const p of parts) {
          let newId = p.instance_id
          // If collision, generate new ID
          if (state.parts[newId]) {
            newId = `${p.part_id}-${Math.random().toString(36).substring(2, 10)}`
          }
          idMap[p.instance_id] = newId
          
          state.parts[newId] = {
            ...p,
            instance_id: newId,
            // rotation is expected as [x,y,z,w] in the store, 
            // but coming from PartInstance which has rotation property.
          }
        }
        
        // Add connections with remapped IDs
        for (const c of connections) {
          const normalizedConnection = normalizeConnectionPorts(c)
          const newFrom = idMap[c.from_instance]
          const newTo = idMap[c.to_instance]

          // Only add if both sides of the connection were part of the appended set
          // OR if they already existed in the store (idMap handles the mapping)
          if (newFrom && newTo) {
            state.connections.push({
              ...normalizedConnection,
              from_instance: newFrom,
              to_instance: newTo
            })
          }
        }
        
        state.undoStack.push({ type: 'add_part', before })
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
        const after = createSnapshot(state)
        // Keep undo so user can undo the clear
        state.undoStack.push({ type: 'remove_part', before, after })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    updatePartColor: (instanceId: string, color: string) => {
      set((state) => {
        const part = state.parts[instanceId]
        if (part) {
          const before = createSnapshot(state)
          part.color = color
          const after = createSnapshot(state)
          // Store as an add_part mutation for undo
          state.undoStack.push({ type: 'add_part', before, after })
          state.redoStack = []
        }
      })
    },

    togglePinPart: (instanceId: string) => {
      set((state) => {
        const part = state.parts[instanceId]
        if (part) {
          const before = createSnapshot(state)
          part.is_pinned = !part.is_pinned
          const after = createSnapshot(state)
          state.undoStack.push({ type: 'add_part', before, after })
          state.redoStack = []
        }
      })
    },

    /** Center the entire build above ground plane and horizontally centered. */
    centerBuild: () => {
      set((state) => {
        const partsList = Object.values(state.parts)
        if (partsList.length === 0) return

        // Calculate bounding box in world space
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        let minY = Infinity

        // Use a 50mm buffer or similar if we want it strictly on ground.
        // Actually, the solver uses groundOffsetMm=50.
        // We just need the center of the build at X=0, Z=0.

        for (const part of partsList) {
          const [x, y, z] = part.position
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minZ = Math.min(minZ, z)
          maxZ = Math.max(maxZ, z)
          minY = Math.min(minY, y)
        }

        const centerX = (minX + maxX) / 2
        const centerZ = (minZ + maxZ) / 2
        
        // Offset needed to move current center to origin
        const dx = -centerX
        const dz = -centerZ
        
        // solver places first part at y=50.
        // If we want the *lowest* point at y=50:
        const groundOffsetMM = 50
        const dy = groundOffsetMM - minY

        const before = createSnapshot(state)
        for (const part of partsList) {
          part.position[0] += dx
          part.position[1] += dy
          part.position[2] += dz
        }

        const after = createSnapshot(state)
        state.undoStack.push({ type: 'center_build', before, after })
        state.redoStack = []
      })
    },

    setStabilityScore: (score: number) => {
      set((state) => {
        const normalized = normalizeStabilityScore(score)
        if (normalized === null) return
        state.stabilityScore = normalized
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

    testStability: async () => {
      const state = get()
      const partsList = Object.values(state.parts)
      if (partsList.length === 0) return

      const { RapierSimulator } = await import('../services/rapierSimulator')
      const sim = new RapierSimulator()
      
      try {
        await sim.init(state.parts, state.connections, 0)
        const { score, unstableParts } = await sim.checkStability(120)
        
        state.setStabilityScore(score)
        const stress: Record<string, number> = {}
        for (const id of unstableParts) stress[id] = 1.0
        state.setStressData(stress)
      } catch (err) {
        console.error('Stability test failed', err)
      } finally {
        sim.destroy()
      }
    },

    setSidecarConnected: (connected: boolean) => {
      set((state) => {
        state.sidecarConnected = connected
      })
    },

    setCurrentModelMeta: (id: string | null, title?: string) => {
      set((state) => {
        state.currentModelId = id
        if (title !== undefined) {
          state.currentModelTitle = title
        }
      })
    },

    updateSlideOffset: (connectionIndex: number, newOffset: number, partDefs: Map<string, KnexPartDef>) => {
      set((state) => {
        const conn = state.connections[connectionIndex]
        if (!conn) return
        
        // Find which part is the slidable rod and which is the connector
        const isFromSlidable = isSlidablePort(conn.from_port)
        const isToSlidable = isSlidablePort(conn.to_port)
        
        if (!isFromSlidable && !isToSlidable) return
        
        const rodId = isFromSlidable ? conn.from_instance : conn.to_instance
        const rodPortId = isFromSlidable ? conn.from_port : conn.to_port
        const connId = isFromSlidable ? conn.to_instance : conn.from_instance
        const connPortId = isFromSlidable ? conn.to_port : conn.from_port
        
        const rodInst = state.parts[rodId]
        const connInst = state.parts[connId]
        if (!rodInst || !connInst) return
        
        const rodDef = partDefs.get(rodInst.part_id)
        const connDef = partDefs.get(connInst.part_id)
        if (!rodDef || !connDef) return
        
        const rodPort = rodDef.ports.find((p: any) => p.id === rodPortId)
        const connPort = connDef.ports.find((p: any) => p.id === connPortId)
        if (!rodPort || !connPort) return

        // Check for collisions before accepting the new offset
        const newFamily = getSlideFamily(rodPortId)!
        const MIN_SPACING_MM = 15.0

        const collision = state.connections.some((otherConn, idx) => {
          if (idx === connectionIndex) return false // Skip self
          const existingRodId = otherConn.from_instance === rodId ? otherConn.from_instance
                              : otherConn.to_instance === rodId ? otherConn.to_instance : null
          if (!existingRodId) return false
          const existingPortId = otherConn.from_instance === rodId ? otherConn.from_port : otherConn.to_port
          if (!isSlidablePort(existingPortId)) return false
          const existingFamily = getSlideFamily(existingPortId)!
          const existingOffset = otherConn.slide_offset ?? 0

          if (existingFamily === newFamily && existingOffset === newOffset) return true
          if (existingOffset === newOffset && familiesInterfere(newFamily, existingFamily)) return true
          if (existingFamily === newFamily && Math.abs(existingOffset - newOffset) < MIN_SPACING_MM) return true
          return false
        })

        if (collision) {
          // Sync interaction store back to current valid state
          window.dispatchEvent(new CustomEvent('knexforge:slide-edit-rejected', {
            detail: { validOffset: conn.slide_offset ?? 0 }
          }))
          return
        }

        conn.slide_offset = newOffset
        
        // We need the rod's world pos and dir without any slide offset to base the new computation on
        // But wait, computeGhostTransform expects the targetWorldPos and Dir.
        const { position: rodWorldPos, direction: rodWorldDir } = getPortWorldPose(rodInst, rodPort, 0)
        
        const { position, rotation } = computeGhostTransform(
          connPort,
          rodPort,
          rodWorldPos,
          rodWorldDir,
          conn.twist_deg ?? 0,
          rodInst,
          connDef,
          rodDef,
          false, // assume connector is being placed on rod
          newOffset
        )
        
        connInst.position = [position.x, position.y, position.z]
        connInst.rotation = [rotation.x, rotation.y, rotation.z, rotation.w]
      })
    },

    commitSlideEdit: (beforeSnapshot: BuildSnapshot) => {
      set((state) => {
        const after = createSnapshot(state)
        state.undoStack.push({ type: 'add_part', before: beforeSnapshot, after })
        state.redoStack = []
      })
      get().recalculateStability()
    },

    revertSlideEdit: (snapshot: BuildSnapshot) => {
      set((state) => {
        const partsDict: Record<string, PartInstance> = {}
        snapshot.parts.forEach(p => { partsDict[p.instance_id] = p })
        state.parts = partsDict
        state.connections = snapshot.connections
      })
      get().recalculateStability()
    },

    // --- Derived ---
    partCount: () => Object.keys(get().parts).length,
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,
    getSnapshot: () => createSnapshot(get()),
  })),
)
