/**
 * Mesh correction transforms for GLB meshes that don't match port data orientation.
 *
 * The OpenSCAD-generated rod meshes extend along the Z axis and are centered at origin.
 * But the part JSON port data defines rods along the X axis with end1 at [0,0,0].
 *
 * This module provides the local correction transform to apply inside each
 * <primitive object={scene}> so the visual mesh aligns with the port data.
 *
 * Connectors and wheels already match — their ports are in the XY plane
 * and their meshes are flat in XY, so no correction is needed.
 */

import { Euler, Vector3 } from 'three'
import type { KnexPartDef } from '../types/parts'

/**
 * Returns the local Euler rotation + position offset to apply to a GLB mesh
 * so it aligns with the part's port coordinate system.
 *
 * For rods: rotate from Z-axis to X-axis, translate from center to end1-at-origin.
 * For others: identity (no correction).
 */
export function getMeshCorrection(def: KnexPartDef): {
  rotation: Euler
  position: Vector3
} {
  if (def.category === 'rod') {
    // Rod meshes: Z-axis centered → X-axis with end1 at origin
    //
    // Step 1: Rotate 90° around Y to map Z→X
    //   Z-axis cylinder → X-axis cylinder
    //   (rotate -90° around Y: [0,0,1] → [1,0,0])
    //
    // Step 2: Translate so that the end at -L/2 (now at -X after rotation)
    //   moves to origin. The rod length is end2.position[0].
    //
    // After rotation by -90° around Y:
    //   Original center at [0,0,0] stays at [0,0,0]
    //   Original [0,0,-L/2] (end1) maps to [-L/2, 0, 0]
    //   Original [0,0,+L/2] (end2) maps to [+L/2, 0, 0]
    //
    // We need end1 at [0,0,0], so translate by [+L/2, 0, 0]
    const rodLength = getRodLength(def)
    return {
      rotation: new Euler(0, -Math.PI / 2, 0),
      position: new Vector3(rodLength / 2, 0, 0),
    }
  }

  // Connectors and wheels: no correction needed
  return {
    rotation: new Euler(0, 0, 0),
    position: new Vector3(0, 0, 0),
  }
}

/**
 * Extract rod length from port data (distance between end1 and end2 along X).
 */
function getRodLength(def: KnexPartDef): number {
  const end2 = def.ports.find((p) => p.id === 'end2')
  if (end2) return end2.position[0]

  // Fallback: find max X position among ports
  return Math.max(...def.ports.map((p) => Math.abs(p.position[0])))
}

/**
 * Returns true if a part definition requires mesh correction.
 */
export function needsMeshCorrection(def: KnexPartDef): boolean {
  return def.category === 'rod'
}
