/**
 * Simulation orientation diagnostics — tracks quaternion changes per-frame
 * to detect unexpected 90° connector flips when simulation starts.
 *
 * Pure math, no Three.js dependency. Designed to run at 60fps with minimal overhead.
 */

import type { PartInstance } from '../types/parts'

type Quat = [number, number, number, number]
type Transform = { position: [number, number, number]; quaternion: Quat }

// ---------------------------------------------------------------------------
// Quaternion math helpers (pure, no allocations beyond return tuples)
// ---------------------------------------------------------------------------

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

function quatMagnitudeDeg(q: Quat): number {
  return (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI
}

/** Convert quaternion [x, y, z, w] to Euler angles [rx, ry, rz] in degrees. */
export function quatToEulerDeg(q: Quat): [number, number, number] {
  const [x, y, z, w] = q

  // Roll (X)
  const sinr = 2 * (w * x + y * z)
  const cosr = 1 - 2 * (x * x + y * y)
  const rx = Math.atan2(sinr, cosr)

  // Pitch (Y) — clamp to avoid NaN
  const sinp = 2 * (w * y - z * x)
  const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)

  // Yaw (Z)
  const siny = 2 * (w * z + x * y)
  const cosy = 1 - 2 * (y * y + z * z)
  const rz = Math.atan2(siny, cosy)

  const toDeg = 180 / Math.PI
  return [rx * toDeg, ry * toDeg, rz * toDeg]
}

/** Angle between two quaternions in degrees (shortest path). */
export function quatAngleDeg(q1: Quat, q2: Quat): number {
  const delta = quatMultiply(quatConjugate(q1), q2)
  return quatMagnitudeDeg(delta)
}

/** Per-axis Euler difference in degrees between two quaternions. */
export function quatDeltaEulerDeg(q1: Quat, q2: Quat): [number, number, number] {
  const e1 = quatToEulerDeg(q1)
  const e2 = quatToEulerDeg(q2)
  return [e2[0] - e1[0], e2[1] - e1[1], e2[2] - e1[2]]
}

// ---------------------------------------------------------------------------
// Flip event
// ---------------------------------------------------------------------------

export interface FlipEvent {
  frame: number
  instanceId: string
  angleDeg: number
  euler: [number, number, number]
}

// ---------------------------------------------------------------------------
// SimOrientationDiagnostics
// ---------------------------------------------------------------------------

export class SimOrientationDiagnostics {
  /** Orientations captured from build store at simulation start. */
  private readonly initialQuats = new Map<string, Quat>()
  /** Previous frame's quaternions (for frame-over-frame delta). */
  private prevQuats = new Map<string, Quat>()
  /** All detected flip events. */
  private flips: FlipEvent[] = []
  /** Current frame counter. */
  private frame = 0
  /** How many initial frames to log verbosely. */
  private readonly logFrames: number

  /** Flip threshold in degrees — any single-frame rotation above this is flagged. */
  private static readonly FLIP_THRESHOLD_DEG = 45

  constructor(parts: Record<string, PartInstance>, logFrames = 5) {
    this.logFrames = logFrames
    for (const [id, part] of Object.entries(parts)) {
      this.initialQuats.set(id, part.rotation)
      this.prevQuats.set(id, part.rotation)
    }
  }

  /** Call once per transform frame with the raw data from the backend. */
  processFrame(data: Record<string, Transform>): void {
    const frame = this.frame++
    const verbose = frame < this.logFrames

    for (const [id, transform] of Object.entries(data)) {
      const cur = transform.quaternion
      const prev = this.prevQuats.get(id)
      if (!prev) {
        this.prevQuats.set(id, cur)
        continue
      }

      const frameDelta = quatAngleDeg(prev, cur)
      const isFlip = frameDelta > SimOrientationDiagnostics.FLIP_THRESHOLD_DEG

      if (verbose || isFlip) {
        const initial = this.initialQuats.get(id)
        const deltaFromInitial = initial ? quatAngleDeg(initial, cur) : frameDelta
        const euler = initial ? quatDeltaEulerDeg(initial, cur) : quatToEulerDeg(cur)

        const tag = isFlip ? ' FLIPPED!' : ''
        console.log(
          `[SIM-DIAG] Frame ${frame}: ${id} rot_delta=${deltaFromInitial.toFixed(1)}° ` +
            `euler=(${euler[0].toFixed(1)}°, ${euler[1].toFixed(1)}°, ${euler[2].toFixed(1)}°)${tag}`,
        )
      }

      if (isFlip) {
        const initial = this.initialQuats.get(id)
        this.flips.push({
          frame,
          instanceId: id,
          angleDeg: frameDelta,
          euler: initial ? quatDeltaEulerDeg(initial, cur) : quatToEulerDeg(cur),
        })
      }

      this.prevQuats.set(id, cur)
    }
  }

  /** Return a summary report of all detected flips. */
  getReport(): { totalFrames: number; flips: FlipEvent[]; summary: string } {
    const grouped = new Map<string, number>()
    for (const flip of this.flips) {
      grouped.set(flip.instanceId, (grouped.get(flip.instanceId) ?? 0) + 1)
    }

    const lines: string[] = []
    if (this.flips.length === 0) {
      lines.push('No orientation flips detected.')
    } else {
      lines.push(`Detected ${this.flips.length} flip(s) across ${grouped.size} part(s):`)
      for (const [id, count] of grouped) {
        const first = this.flips.find((f) => f.instanceId === id)!
        lines.push(
          `  ${id}: ${count} flip(s), first at frame ${first.frame} (${first.angleDeg.toFixed(1)}°)`,
        )
      }
    }

    return {
      totalFrames: this.frame,
      flips: this.flips,
      summary: lines.join('\n'),
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a diagnostics tracker initialized with the current build state. */
export function createSimDiagnostics(
  parts: Record<string, PartInstance>,
  logFrames = 5,
): SimOrientationDiagnostics {
  return new SimOrientationDiagnostics(parts, logFrames)
}
