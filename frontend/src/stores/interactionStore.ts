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
  /** Index of the active snap variant when multiple are possible. */
  activeSnapVariantIndex: number
  /** Hovered part instance ID. */
  hoveredPartId: string | null

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
  /** Rotate the ghost 90° around Y axis. */
  rotateGhost: () => void
  /** Cycles to the next snap configuration when multiple are available. */
  cycleSnapVariant: (maxVariants: number) => void
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
  immer((set) => ({
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
    activeSnapVariantIndex: 0,
    hoveredPartId: null,

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
        state.activeSnapVariantIndex = 0
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
        state.activeSnapVariantIndex = 0
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
        // Only reset the variant index if we're snapping to a DIFFERENT port
        if (state.snapTargetInstanceId !== instanceId || state.snapTargetPortId !== portId) {
          state.activeSnapVariantIndex = 0
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

    rotateGhost: () => {
      set((state) => {
        state.ghostRotation = multiplyQuaternions(state.ghostRotation, ROTATE_Y_90)
      })
    },

    cycleSnapVariant: (maxVariants: number) => {
      set((state) => {
        if (maxVariants > 1) {
          state.activeSnapVariantIndex = (state.activeSnapVariantIndex + 1) % maxVariants
        }
      })
    },
  })),
)
