import { Vector3, Box3 } from 'three'
import type { SolvedTopologyBuild } from '../topologySolver'
import type { KnexPartDef } from '../../types/parts'

export interface PhysicsMetrics {
  massGrams: number
  centerOfMass: Vector3
  boundingBox: Box3
  dimensionsMm: Vector3
  aspectRatio: number
  supportPolygonArea?: number
  estimatedStabilityScore: number // 0 to 1
  estimatedStressScore: number // 0 to 1
}

export function evaluatePhysics(
  build: SolvedTopologyBuild,
  partDefsById: Map<string, KnexPartDef>
): PhysicsMetrics {
  let totalMass = 0
  const centerOfMass = new Vector3(0, 0, 0)
  const boundingBox = new Box3()
  let minGroundY = Infinity

  for (const part of build.parts) {
    const def = partDefsById.get(part.part_id)
    const mass = def?.mass_grams ?? 1.0 // default to 1g if unknown

    const pos = new Vector3(part.position[0], part.position[1], part.position[2])
    
    totalMass += mass
    centerOfMass.add(pos.clone().multiplyScalar(mass))
    boundingBox.expandByPoint(pos)

    if (pos.y < minGroundY) {
      minGroundY = pos.y
    }
  }

  if (totalMass > 0) {
    centerOfMass.divideScalar(totalMass)
  }

  const dimensionsMm = new Vector3()
  boundingBox.getSize(dimensionsMm)

  // Avoid division by zero
  const maxDim = Math.max(dimensionsMm.x, dimensionsMm.y, dimensionsMm.z, 1)
  const actualMinDim = Math.min(dimensionsMm.x, dimensionsMm.y, dimensionsMm.z)
  const minDim = Math.max(actualMinDim, 1)
  const aspectRatio = maxDim / minDim

  // Heuristic for support polygon area:
  // Estimate footprint by looking at parts close to the ground plane
  const groundTolerance = 15.0 // mm
  const groundPoints: Vector3[] = []

  for (const part of build.parts) {
    if (part.position[1] <= minGroundY + groundTolerance) {
      groundPoints.push(new Vector3(part.position[0], part.position[1], part.position[2]))
    }
  }

  let supportPolygonArea = 0
  if (groundPoints.length >= 3) {
    // Simple 2D bounding box area for footprint approximation
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const pt of groundPoints) {
      minX = Math.min(minX, pt.x)
      maxX = Math.max(maxX, pt.x)
      minZ = Math.min(minZ, pt.z)
      maxZ = Math.max(maxZ, pt.z)
    }
    supportPolygonArea = (maxX - minX) * (maxZ - minZ)
  } else if (groundPoints.length === 2) {
    // Line contact, highly unstable in one axis, so effective area is 0 for stability
    supportPolygonArea = 0
  }

  // Stability heuristic:
  // 1. Center of mass should be low (relative to height)
  // 2. Center of mass should project inside the support polygon (simplified as bounding box center here)
  const heightRatio = centerOfMass.y / (dimensionsMm.y || 1)
  let stabilityScore = 1.0 - Math.min(heightRatio, 1.0)
  
  // Penalize small footprint
  const footprintRatio = supportPolygonArea / (dimensionsMm.x * dimensionsMm.z + 1)
  stabilityScore = (stabilityScore * 0.7) + (Math.min(footprintRatio, 1.0) * 0.3)

  // Stress heuristic:
  // Long cantilevered builds (high aspect ratio, especially horizontal) have higher stress.
  // Large mass with small footprint also implies stress.
  let stressScore = 1.0
  if (aspectRatio > 5.0) {
    stressScore -= 0.3
  }
  if (totalMass > 100 && supportPolygonArea < 1000) {
    stressScore -= 0.2
  }
  stressScore = Math.max(0, Math.min(1, stressScore))

  return {
    massGrams: totalMass,
    centerOfMass,
    boundingBox,
    dimensionsMm,
    aspectRatio,
    supportPolygonArea,
    estimatedStabilityScore: stabilityScore,
    estimatedStressScore: stressScore,
  }
}
