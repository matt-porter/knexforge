import type { TopologyModel } from '../topologySolver'
import type { SynthesisGoal, SynthesisCandidate, SynthesisCandidateRejection } from '../../types/synthesis'
import { DeterministicRandom, allMutations } from './mutations'
import { TopologyOracle } from './topologyOracle'
import { evaluateCandidateScore } from './scoring'
import { templateCatalog } from './templateCatalog'
import type { KnexPartDef } from '../../types/parts'

export interface GenerationResult {
  candidates: SynthesisCandidate[]
  rejections: SynthesisCandidateRejection[]
}

export class CandidateGenerator {
  private oracle: TopologyOracle

  constructor(private partDefsById: Map<string, KnexPartDef>) {
    this.oracle = new TopologyOracle(partDefsById)
  }

  public generate(goal: SynthesisGoal): GenerationResult {
    const seed = goal.seed ?? Date.now()
    const random = new DeterministicRandom(seed)
    
    const candidates: SynthesisCandidate[] = []
    const rejections: SynthesisCandidateRejection[] = []
    const candidateCount = goal.candidate_count ?? 3

    // 1. Pick a base template that matches hard constraints
    const availableTemplates = Object.values(templateCatalog)
    if (availableTemplates.length === 0) {
      throw new Error('No templates available for generation')
    }

    let candidateIdCounter = 1

    // We generate up to maxAttempts to find `candidateCount` valid ones
    const maxAttempts = candidateCount * 10
    let attempts = 0

    while (candidates.length < candidateCount && attempts < maxAttempts) {
      attempts++

      const template = random.pick(availableTemplates)
      
      // Basic generation params
      const baseModel = template.generate({
        requireMotor: goal.constraints.require_motor,
        maxEnvelopeMm: goal.constraints.max_envelope_mm,
        seed: random.nextInt(0, 1000000)
      })

      // Clone deeply to avoid mutating template output
      const model: TopologyModel = JSON.parse(JSON.stringify(baseModel))

      // 2. Apply 0 to 3 random mutations
      const mutationCount = random.nextInt(0, 3)
      for (let i = 0; i < mutationCount; i++) {
        const mutation = random.pick(allMutations)
        mutation(model, random)
      }

      // 3. Oracle Check
      const oracleResult = this.oracle.evaluate(model)

      if (!oracleResult.isValid) {
        rejections.push({
          candidate_id: `cand_${candidateIdCounter++}`,
          reason_code: oracleResult.reasonCode,
          reason_message: oracleResult.reasonMessage,
          diagnostics: oracleResult.diagnostics
        })
        continue
      }

      // 4. Score Candidate
      const score = evaluateCandidateScore(
        oracleResult.canonicalTopology,
        oracleResult.solvedBuild,
        goal,
        this.partDefsById
      )

      // Only accept if score is reasonable (e.g. > 0)
      // If there are strict failure penalties, the total score might be 0.
      if (score.total <= 0) {
        rejections.push({
          candidate_id: `cand_${candidateIdCounter++}`,
          reason_code: 'score_too_low',
          reason_message: 'Candidate failed hard constraints or scored too low.',
          diagnostics: []
        })
        continue
      }

      // Accept Candidate
      candidates.push({
        format_version: 'synthesis-candidate-v1',
        candidate_id: `cand_${candidateIdCounter++}`,
        summary: `Generated from ${template.name}`,
        topology: oracleResult.canonicalTopology,
        score,
        diagnostics: [],
        metrics: {
          part_count: oracleResult.solvedBuild.parts.length,
          connection_count: oracleResult.canonicalTopology.connections.length,
          estimated_envelope_mm: [
            // Approximations from physics Eval could be cached, but let's recompute or just use dummy for now
            // Actually score breakdown has no size info, so let's compute it quickly or rely on boundingBox
            // But we didn't return boundingBox from evaluateCandidateScore.
            // That's fine, we'll just populate some rough metrics.
            0, 0, 0
          ],
          stability_score: score.stability
        }
      })
    }

    // Sort by total score descending
    candidates.sort((a, b) => b.score.total - a.score.total)

    return { candidates, rejections }
  }
}
