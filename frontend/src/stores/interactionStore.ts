/**
 * Interaction store — manages UI interaction state for the 3D builder.
 *
 * Tracks the current tool mode (select, place), the part type being placed,
 * ghost preview position, and hover state.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolMode = 'select' | 'place'

/** Metadata about the current snap variant state, for the HUD to display. */
export interface SnapVariantInfo {
  portLabel: string
  portIndex: number
  totalPorts: number
  allPortLabels: string[]
  sideLabel: string
  sideIndex: number
  totalSides: number
  allSideLabels: string[]
  angleDeg: number
  angleIndex: number
  totalAngles: number
}

export interface InteractionStore {
  // --- State ---
  /** Current tool mode. */
  mode: ToolMode
  /** Part ID selected for placement (only when mode === 'place'). */
  placingPartId: string | null
  /** Instance ID of the selected part we are targeting to attach to. */
  matchTargetId: string | null
  /** Ghost preview position in world space. */
  ghostPosition: [number, number, number] | null
  /** Ghost preview rotation (quaternion). */
  ghostRotation: [number, number, number, number]
  /** ID of the port being snapped to, if any. */
  snapTargetInstanceId: string | null
  snapTargetPortId: string | null
  /** Port ID on the placing part that would connect. */
  snapPlacingPortId: string | null
  /** Whether the ghost is currently snapped to a valid port. */
  isSnapped: boolean
  /** Index of the active port group (Tab cycles this). */
  activePortIndex: number
  /** Index of the active rotation within the current port group (R cycles this). */
  activeAngleIndex: number
  /** Index of the active rod-side choice within the current port group (X cycles this). */
  activeSideIndex: number
  /** Current slide offset in mm (0 = center). */
  slideOffset: number
  /** Valid range for the current slide offset [min, max], or null if not slidable. */
  slideRange: [number, number] | null
  /** Metadata for the snap variant HUD (written by PortIndicators). */
  snapVariantInfo: SnapVariantInfo | null
  /** Hovered part instance ID. */
  hoveredPartId: string | null

  // --- Simulation State ---
  isSimulating: boolean
  motorSpeed: number

  // --- Context Menu State ---
  contextMenu: { x: number; y: number; partId: string } | null

  // --- Actions ---
  /** Start placing a part type. Switches to place mode. targetId specifies a specific instance to snap to. */
  startPlacing: (partId: string, targetId?: string) => void
  /** Cancel placement. Returns to select mode. */
  cancelPlacing: () => void
  /** Update ghost preview position. */
  setGhostPosition: (pos: [number, number, number] | null) => void
  /** Update ghost preview rotation. */
  setGhostRotation: (rot: [number, number, number, number]) => void
  /** Set snap target (port on an existing part + port on placing part). */
  setSnapTarget: (instanceId: string | null, portId: string | null, placingPortId?: string | null) => void
  /** Set hovered part. */
  setHoveredPart: (instanceId: string | null) => void
  /** Set the target part for placing mode. */
  setMatchTargetId: (instanceId: string | null) => void
  /** Rotate the ghost 90° around Y axis. */
  rotateGhost: () => void
  /** Cycle to the next port group (Tab key). */
  cyclePort: () => void
  /** Cycle to the next rotation angle within the current port group (R key when snapped). */
  cycleAngle: () => void
  /** Cycle to the next rod-side option within the current port group (X key when snapped). */
  cycleSide: () => void
  /** Set the exact slide offset. */
  setSlideOffset: (offset: number) => void
  /** Adjust the slide offset by a delta, clamping to range. */
  adjustSlideOffset: (delta: number) => void
  /** Reset slide offset to 0. */
  resetSlideOffset: () => void
  /** Set the allowable slide range. */
  setSlideRange: (range: [number, number] | null) => void
  /** Set snap variant HUD metadata (called by PortIndicators). */
  setSnapVariantInfo: (info: SnapVariantInfo | null) => void
  
  // --- Simulation Actions ---
  toggleSimulation: () => void
  setMotorSpeed: (speed: number) => void

  // --- Context Menu Actions ---
  openContextMenu: (x: number, y: number, partId: string) => void
  closeContextMenu: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Multiply two quaternions (a * b). */
function multiplyQuaternions(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** 90° rotation around Y axis as quaternion. */
const ROTATE_Y_90: [number, number, number, number] = [
  0,
  Math.sin(Math.PI / 4),
  0,
  Math.cos(Math.PI / 4),
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useInteractionStore = create<InteractionStore>()(
  immer((set, get) => ({
    // --- Initial state ---
    mode: 'select',
    placingPartId: null,
    matchTargetId: null,
    ghostPosition: null,
    ghostRotation: [0, 0, 0, 1],
    snapTargetInstanceId: null,
    snapTargetPortId: null,
    snapPlacingPortId: null,
    isSnapped: false,
    activePortIndex: 0,
    activeAngleIndex: 0,
    activeSideIndex: 0,
    slideOffset: 0,
    slideRange: null,
    snapVariantInfo: null,
    hoveredPartId: null,
    isSimulating: false,
    motorSpeed: 10.0,
    contextMenu: null,

    // --- Actions ---
    startPlacing: (partId: string, targetId?: string) => {
      set((state) => {
        state.mode = 'place'
        state.placingPartId = partId
        state.matchTargetId = targetId ?? null
        state.ghostPosition = null
        state.ghostRotation = [0, 0, 0, 1]
        state.snapTargetInstanceId = null
        state.snapTargetPortId = null
        state.snapPlacingPortId = null
        state.isSnapped = false
        state.activePortIndex = 0
        state.activeAngleIndex = 0
        state.activeSideIndex = 0
        state.slideOffset = 0
        state.slideRange = null
        ;(state as any)._lastCycleTime = 0
        state.snapVariantInfo = null
      })
    },

    cancelPlacing: () => {
      set((state) => {
        state.mode = 'select'
        state.placingPartId = null
        state.matchTargetId = null
        state.ghostPosition = null
        state.ghostRotation = [0, 0, 0, 1]
        state.snapTargetInstanceId = null
        state.snapTargetPortId = null
        state.snapPlacingPortId = null
        state.isSnapped = false
        state.activePortIndex = 0
        state.activeAngleIndex = 0
        state.activeSideIndex = 0
        state.slideOffset = 0
        state.slideRange = null
        ;(state as any)._lastCycleTime = 0
        state.snapVariantInfo = null
      })
    },

    setGhostPosition: (pos: [number, number, number] | null) => {
      set((state) => {
        state.ghostPosition = pos
      })
    },

    setGhostRotation: (rot: [number, number, number, number]) => {
      set((state) => {
        state.ghostRotation = rot
      })
    },

    setSnapTarget: (instanceId: string | null, portId: string | null, placingPortId?: string | null) => {
      set((state) => {
        // Only reset indices if we're snapping to a DIFFERENT instance.
        if (state.snapTargetInstanceId !== instanceId) {
          state.activePortIndex = 0
          state.activeAngleIndex = 0
          state.activeSideIndex = 0
          state.slideOffset = 0
          state.slideRange = null
          state.snapVariantInfo = null
        }
        state.snapTargetInstanceId = instanceId
        state.snapTargetPortId = portId
        state.snapPlacingPortId = placingPortId ?? null
        state.isSnapped = instanceId !== null && portId !== null
      })
    },

    setHoveredPart: (instanceId: string | null) => {
      set((state) => {
        state.hoveredPartId = instanceId
      })
    },

    setMatchTargetId: (instanceId: string | null) => {
      set((state) => {
        state.matchTargetId = instanceId
      })
    },

    rotateGhost: () => {
      set((state) => {
        state.ghostRotation = multiplyQuaternions(state.ghostRotation, ROTATE_Y_90)
      })
    },

    cyclePort: () => {
      const now = Date.now()
      const last = (get() as any)._lastCycleTime || 0
      if (now - last < 100) return

      set((state) => {
        state.activePortIndex += 1
        state.activeSideIndex = 0
        state.activeAngleIndex = 0
        state.slideOffset = 0
        ;(state as any)._lastCycleTime = now
      })
    },

    cycleSide: () => {
      set((state) => {
        state.activeSideIndex += 1
        state.activeAngleIndex = 0
        // We DO NOT reset slideOffset when cycling sides, as the position along the rod is preserved.
      })
    },

    cycleAngle: () => {
      set((state) => {
        state.activeAngleIndex += 1
      })
    },

    setSlideOffset: (offset: number) => {
      set((state) => {
        state.slideOffset = offset
      })
    },

    adjustSlideOffset: (delta: number) => {
      set((state) => {
        if (!state.slideRange) return
        const [min, max] = state.slideRange
        state.slideOffset = Math.max(min, Math.min(state.slideOffset + delta, max))
      })
    },

    resetSlideOffset: () => {
      set((state) => {
        state.slideOffset = 0
      })
    },

    setSlideRange: (range: [number, number] | null) => {
      set((state) => {
        state.slideRange = range
      })
    },

    setSnapVariantInfo: (info: SnapVariantInfo | null) => {
      set((state) => {
        state.snapVariantInfo = info
      })
    },

    toggleSimulation: () => {
      set((state) => {
        state.isSimulating = !state.isSimulating
      })
    },

    setMotorSpeed: (speed: number) => {
      set((state) => {
        state.motorSpeed = speed
      })
    },

    openContextMenu: (x: number, y: number, partId: string) => {
      set((state) => {
        state.contextMenu = { x, y, partId }
      })
    },

    closeContextMenu: () => {
      set((state) => {
        state.contextMenu = null
      })
    },
  })),
)
