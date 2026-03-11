import type { TopologyModel, SolvedTopologyBuild } from '../topologySolver'
import type { SynthesisGoal, SynthesisScoreBreakdown, SynthesisScorePenalty } from '../../types/synthesis'
import { evaluatePhysics } from './physicsEval'
import type { KnexPartDef } from '../../types/parts'

export function evaluateCandidateScore(
  topology: TopologyModel,
  build: SolvedTopologyBuild,
  goal: SynthesisGoal,
  partDefsById: Map<string, KnexPartDef>
): { score: SynthesisScoreBreakdown; dimensionsMm: { x: number; y: number; z: number } } {
  const physics = evaluatePhysics(build, partDefsById)
  
  const penalties: SynthesisScorePenalty[] = []

  let structural_simplicity = 1.0
  let part_efficiency = 1.0
  let objective_fit = 1.0

  // 1. Part efficiency and limits
  const partCount = build.parts.length
  if (goal.constraints.max_parts && partCount > goal.constraints.max_parts) {
    const overage = partCount - goal.constraints.max_parts
    const penaltyValue = Math.min(overage * 0.1, 0.5)
    penalties.push({
      code: 'max_parts_exceeded',
      value: penaltyValue,
      reason: `Exceeded max part limit of ${goal.constraints.max_parts} by ${overage} parts.`
    })
    part_efficiency -= penaltyValue
  } else if (goal.constraints.max_parts) {
    // Reward using fewer parts if under limit
    const ratio = partCount / goal.constraints.max_parts
    part_efficiency = 1.0 - (ratio * 0.2) // up to 0.2 bonus/scale
  }

  // 2. Envelope constraint
  if (goal.constraints.max_envelope_mm) {
    const [maxX, maxY, maxZ] = goal.constraints.max_envelope_mm
    const dim = physics.dimensionsMm
    if (dim.x > maxX || dim.y > maxY || dim.z > maxZ) {
      const penaltyValue = 0.4
      penalties.push({
        code: 'max_envelope_exceeded',
        value: penaltyValue,
        reason: `Exceeded max dimensions [${maxX}, ${maxY}, ${maxZ}]. Actual: [${dim.x.toFixed(1)}, ${dim.y.toFixed(1)}, ${dim.z.toFixed(1)}].`
      })
      objective_fit -= penaltyValue
    }
  }

  // 3. Structural Simplicity (Connections vs Parts)
  const connectionCount = topology.connections.length
  // A simple tree has connectionCount = partCount - 1
  // More connections mean loops, which increase complexity (but maybe good for stress!)
  const expectedMinConns = Math.max(0, partCount - 1)
  const extraConns = Math.max(0, connectionCount - expectedMinConns)
  if (extraConns > 0) {
    structural_simplicity -= Math.min(extraConns * 0.05, 0.4) // max 0.4 penalty for overly complex webbing
  }

  // 4. Objective targeting
  for (const obj of goal.objectives) {
    switch (obj) {
      case 'stability':
        objective_fit += (physics.estimatedStabilityScore * 0.2)
        break
      case 'part_efficiency':
        objective_fit += (part_efficiency * 0.2)
        break
      case 'structural_simplicity':
        objective_fit += (structural_simplicity * 0.2)
        break
      case 'compactness': {
        const volume = physics.dimensionsMm.x * physics.dimensionsMm.y * physics.dimensionsMm.z
        // Rough normalization: 100x100x100 = 1,000,000 mm^3
        const compactScore = Math.max(0, 1.0 - (volume / 5000000))
        objective_fit += (compactScore * 0.2)
        break
      }
      case 'smooth_rotation':
      case 'motion_range':
        // Future placeholders for dynamic analysis
        objective_fit += 0.1
        break
    }
  }

  // Clamp everything
  part_efficiency = Math.max(0, Math.min(1, part_efficiency))
  structural_simplicity = Math.max(0, Math.min(1, structural_simplicity))
  objective_fit = Math.max(0, Math.min(1, objective_fit))

  let totalScore = 0
  
  // Weights based on how critical they are for a generally "good" build
  // If stability is requested, we heavily boost its weight
  if (goal.objectives.includes('stability')) {
    totalScore = (objective_fit * 0.3) + (physics.estimatedStabilityScore * 0.4) + (physics.estimatedStressScore * 0.1) + (part_efficiency * 0.1) + (structural_simplicity * 0.1)
  } else {
    totalScore = (objective_fit * 0.4) + (physics.estimatedStabilityScore * 0.2) + (physics.estimatedStressScore * 0.2) + (part_efficiency * 0.1) + (structural_simplicity * 0.1)
  }

  const penaltySum = penalties.reduce((sum, p) => sum + p.value, 0)
  totalScore = Math.max(0, totalScore - penaltySum)

  return {
    score: {
      total: totalScore,
      objective_fit,
      stability: physics.estimatedStabilityScore,
      stress_resilience: physics.estimatedStressScore,
      part_efficiency,
      structural_simplicity,
      penalties
    },
    dimensionsMm: physics.dimensionsMm
  }
}
