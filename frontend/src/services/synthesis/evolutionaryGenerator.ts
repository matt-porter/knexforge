import type { SynthesisCandidate, SynthesisCandidateRejection, SynthesisGoal } from '../../types/synthesis'
import type { KnexPartDef } from '../../types/parts'
import type { TopologyModel, SolvedTopologyBuild } from '../topologySolver'
import { DeterministicRandom, pickWeightedMutation } from './mutations'
import { TopologyOracle } from './topologyOracle'
import { evaluateCandidateScore } from './scoring'
import { selectTemplateByPrompt } from './promptMatcher'
import { evaluateRapierFitness } from './rapierFitnessEval'

export interface GenerationResult {
  candidates: SynthesisCandidate[]
  rejections: SynthesisCandidateRejection[]
}

/** Internal wrapper that pairs a candidate with its solved build for Rapier eval */
interface CandidateWithBuild {
  candidate: SynthesisCandidate
  solvedBuild: SolvedTopologyBuild
}

interface EvolutionaryConfig {
  populationSize: number
  survivors: number
  childrenPerSurvivor: number
  generations: number
}

export interface EvolutionaryGenerationProgress {
  generation: number
  totalGenerations: number
  bestScore: number
  candidateCount: number
  evaluatedCandidates: number
}

export interface EvolutionaryGenerationOptions {
  onProgress?: (progress: EvolutionaryGenerationProgress) => void
}

const DEFAULT_CONFIG: EvolutionaryConfig = {
  populationSize: 20,
  survivors: 5,
  childrenPerSurvivor: 4,
  generations: 5,
}

function clampInt(
  value: number | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue
  }

  const rounded = Math.floor(value)
  return Math.max(minimum, Math.min(maximum, rounded))
}

export class EvolutionaryGenerator {
  private readonly oracle: TopologyOracle

  private readonly partDefsById: Map<string, KnexPartDef>

  constructor(partDefsById: Map<string, KnexPartDef>) {
    this.partDefsById = partDefsById
    this.oracle = new TopologyOracle(partDefsById)
  }

  public generate(goal: SynthesisGoal, options: EvolutionaryGenerationOptions = {}): GenerationResult {
    const seed = goal.seed ?? Date.now()
    const random = new DeterministicRandom(seed)
    const config = this.resolveConfig(goal)
    const requestedCandidateCount = goal.candidate_count ?? 3

    const rejections: SynthesisCandidateRejection[] = []
    // Store candidates with their solved builds for Rapier evaluation
    let populationWithBuilds: CandidateWithBuild[] = []
    const candidateIdCounter = { value: 1 }
    let evaluatedCandidates = 0

    // Initial population sampling from prompt-guided templates.
    const maxInitialAttempts = Math.max(config.populationSize * 20, config.populationSize)
    let attempts = 0

    while (populationWithBuilds.length < config.populationSize && attempts < maxInitialAttempts) {
      attempts += 1

      const template = selectTemplateByPrompt(goal.prompt, random)
      const baseModel = template.generate({
        requireMotor: goal.constraints.require_motor,
        maxEnvelopeMm: goal.constraints.max_envelope_mm,
        seed: random.nextInt(0, 1000000),
      })

      const candidateModel = this.deepCloneTopology(baseModel)
      this.applyMutations(candidateModel, random, 15, 40)

      const result = this.evaluateCandidateWithBuild(
        candidateModel,
        `Generated from ${template.name}`,
        goal,
        candidateIdCounter,
        rejections,
      )

      evaluatedCandidates += 1
      if (result) {
        populationWithBuilds.push(result)
      }
    }

    populationWithBuilds = this.sortByScoreWithBuilds(populationWithBuilds)

    for (let generation = 1; generation <= config.generations; generation += 1) {
      if (populationWithBuilds.length > 0) {
        const survivors = populationWithBuilds.slice(0, Math.min(config.survivors, populationWithBuilds.length))
        const nextPopulation: CandidateWithBuild[] = [...survivors]

        for (const survivor of survivors) {
          for (let childIndex = 0; childIndex < config.childrenPerSurvivor; childIndex += 1) {
            const childModel = this.deepCloneTopology(survivor.candidate.topology)
            this.applyMutations(childModel, random, 3, 8)

            const childResult = this.evaluateCandidateWithBuild(
              childModel,
              `Evolved from ${survivor.candidate.candidate_id}`,
              goal,
              candidateIdCounter,
              rejections,
            )

            evaluatedCandidates += 1
            if (childResult) {
              nextPopulation.push(childResult)
            }
          }
        }

        populationWithBuilds = this.sortByScoreWithBuilds(nextPopulation)
      }

      options.onProgress?.({
        generation,
        totalGenerations: config.generations,
        bestScore: populationWithBuilds[0]?.candidate.score.total ?? 0,
        candidateCount: populationWithBuilds.length,
        evaluatedCandidates,
      })
    }

    // Run Rapier physics evaluation on top survivors (synchronous block, but Rapier is async)
    // We use the top survivors for the final output
    const finalPopulation = this.sortByScoreWithBuilds(populationWithBuilds)
    const topCandidates = finalPopulation.slice(0, requestedCandidateCount)

    return {
      candidates: topCandidates.map(item => item.candidate),
      rejections,
    }
  }

  /**
   * Async version of generate that includes Rapier physics evaluation.
   * Use this when Rapier evaluation is desired for stability scoring.
   */
  public async generateWithRapier(goal: SynthesisGoal, options: EvolutionaryGenerationOptions = {}): Promise<GenerationResult> {
    const seed = goal.seed ?? Date.now()
    const random = new DeterministicRandom(seed)
    const config = this.resolveConfig(goal)
    const requestedCandidateCount = goal.candidate_count ?? 3

    const rejections: SynthesisCandidateRejection[] = []
    let populationWithBuilds: CandidateWithBuild[] = []
    const candidateIdCounter = { value: 1 }
    let evaluatedCandidates = 0

    // Initial population sampling
    const maxInitialAttempts = Math.max(config.populationSize * 20, config.populationSize)
    let attempts = 0

    while (populationWithBuilds.length < config.populationSize && attempts < maxInitialAttempts) {
      attempts += 1

      const template = selectTemplateByPrompt(goal.prompt, random)
      const baseModel = template.generate({
        requireMotor: goal.constraints.require_motor,
        maxEnvelopeMm: goal.constraints.max_envelope_mm,
        seed: random.nextInt(0, 1000000),
      })

      const candidateModel = this.deepCloneTopology(baseModel)
      this.applyMutations(candidateModel, random, 15, 40)

      const result = this.evaluateCandidateWithBuild(
        candidateModel,
        `Generated from ${template.name}`,
        goal,
        candidateIdCounter,
        rejections,
      )

      evaluatedCandidates += 1
      if (result) {
        populationWithBuilds.push(result)
      }
    }

    populationWithBuilds = this.sortByScoreWithBuilds(populationWithBuilds)

    for (let generation = 1; generation <= config.generations; generation += 1) {
      if (populationWithBuilds.length > 0) {
        const survivors = populationWithBuilds.slice(0, Math.min(config.survivors, populationWithBuilds.length))
        const nextPopulation: CandidateWithBuild[] = [...survivors]

        for (const survivor of survivors) {
          for (let childIndex = 0; childIndex < config.childrenPerSurvivor; childIndex += 1) {
            const childModel = this.deepCloneTopology(survivor.candidate.topology)
            this.applyMutations(childModel, random, 3, 8)

            const childResult = this.evaluateCandidateWithBuild(
              childModel,
              `Evolved from ${survivor.candidate.candidate_id}`,
              goal,
              candidateIdCounter,
              rejections,
            )

            evaluatedCandidates += 1
            if (childResult) {
              nextPopulation.push(childResult)
            }
          }
        }

        // Run Rapier evaluation on top survivors after ranking
        const rankedPopulation = this.sortByScoreWithBuilds(nextPopulation)
        await this.evaluateSurvivorsWithRapier(rankedPopulation, config.survivors, goal)

        populationWithBuilds = rankedPopulation
      }

      options.onProgress?.({
        generation,
        totalGenerations: config.generations,
        bestScore: populationWithBuilds[0]?.candidate.score.total ?? 0,
        candidateCount: populationWithBuilds.length,
        evaluatedCandidates,
      })
    }

    // Final Rapier evaluation on all top candidates
    const finalPopulation = this.sortByScoreWithBuilds(populationWithBuilds)
    await this.evaluateSurvivorsWithRapier(finalPopulation, requestedCandidateCount, goal)

    return {
      candidates: finalPopulation.slice(0, requestedCandidateCount).map(item => item.candidate),
      rejections,
    }
  }

  /**
   * Run Rapier physics evaluation on top survivors and blend into scores.
   * Candidates with joint integrity < 0.3 are rejected.
   */
  private async evaluateSurvivorsWithRapier(
    population: CandidateWithBuild[],
    survivorCount: number,
    goal: SynthesisGoal,
  ): Promise<void> {
    const survivorsToEvaluate = population.slice(0, Math.min(survivorCount, population.length))
    const hasStabilityObjective = goal.objectives.includes('stability')

    for (const item of survivorsToEvaluate) {
      try {
        const rapierResult = await evaluateRapierFitness(
          item.solvedBuild,
          this.partDefsById,
          { simDurationSec: 1.0 }, // Short simulation for performance
        )

        // Reject candidates with very poor joint integrity
        if (rapierResult.jointIntegrity < 0.3) {
          item.candidate.score.total = 0
          item.candidate.score.stability = 0
          item.candidate.diagnostics.push({
            code: 'rapier_joint_explosion',
            message: `Joint integrity too low (${rapierResult.jointIntegrity.toFixed(2)}). Model likely unstable.`,
            severity: 'error',
            details: {
              jointIntegrity: rapierResult.jointIntegrity,
              stabilityScore: rapierResult.stabilityScore,
            },
          })
          continue
        }

        // Blend Rapier stability into total score
        const geometricStability = item.candidate.score.stability
        const rapierStability = rapierResult.stabilityScore

        if (hasStabilityObjective) {
          // When stability is requested, heavily boost Rapier weight
          item.candidate.score.stability = 0.5 * rapierStability + 0.5 * geometricStability
          item.candidate.score.total = (
            0.5 * item.candidate.score.stability +
            0.3 * item.candidate.score.objective_fit +
            0.1 * item.candidate.score.part_efficiency +
            0.1 * item.candidate.score.structural_simplicity
          )
        } else {
          // Otherwise, moderate Rapier boost
          item.candidate.score.stability = 0.3 * rapierStability + 0.7 * geometricStability
          item.candidate.score.total = (
            0.3 * item.candidate.score.stability +
            0.4 * item.candidate.score.objective_fit +
            0.15 * item.candidate.score.part_efficiency +
            0.15 * item.candidate.score.structural_simplicity
          )
        }

        // Update metrics with Rapier results
        item.candidate.metrics.rapier_stability_score = rapierResult.stabilityScore
        item.candidate.metrics.rapier_joint_integrity = rapierResult.jointIntegrity

      } catch (error) {
        // Rapier evaluation failed — keep geometric score, log warning
        item.candidate.diagnostics.push({
          code: 'rapier_eval_failed',
          message: `Rapier evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'warning',
        })
      }
    }
  }

  private resolveConfig(goal: SynthesisGoal): EvolutionaryConfig {
    const populationSize = clampInt(
      goal.constraints.population_size,
      DEFAULT_CONFIG.populationSize,
      1,
      200,
    )
    const survivors = clampInt(
      goal.constraints.survivor_count,
      DEFAULT_CONFIG.survivors,
      1,
      populationSize,
    )
    const childrenPerSurvivor = clampInt(
      goal.constraints.children_per_survivor,
      DEFAULT_CONFIG.childrenPerSurvivor,
      1,
      20,
    )
    const generations = clampInt(
      goal.constraints.generation_count,
      DEFAULT_CONFIG.generations,
      1,
      20,
    )

    return {
      populationSize,
      survivors,
      childrenPerSurvivor,
      generations,
    }
  }

  /**
   * Evaluate a candidate and return it paired with its solved build.
   * This allows Rapier evaluation later without re-solving the topology.
   */
  private evaluateCandidateWithBuild(
    model: TopologyModel,
    summary: string,
    goal: SynthesisGoal,
    candidateIdCounter: { value: number },
    rejections: SynthesisCandidateRejection[],
  ): CandidateWithBuild | null {
    const candidateId = `cand_${candidateIdCounter.value++}`
    const oracleResult = this.oracle.evaluate(model)

    if (!oracleResult.isValid) {
      rejections.push({
        candidate_id: candidateId,
        reason_code: oracleResult.reasonCode,
        reason_message: oracleResult.reasonMessage,
        diagnostics: oracleResult.diagnostics,
      })
      return null
    }

    const { score, dimensionsMm } = evaluateCandidateScore(
      oracleResult.canonicalTopology,
      oracleResult.solvedBuild,
      goal,
      this.partDefsById,
    )

    if (score.total <= 0) {
      rejections.push({
        candidate_id: candidateId,
        reason_code: 'score_too_low',
        reason_message: 'Candidate failed hard constraints or scored too low.',
        diagnostics: [],
      })
      return null
    }

    const candidate: SynthesisCandidate = {
      format_version: 'synthesis-candidate-v1',
      candidate_id: candidateId,
      summary,
      topology: oracleResult.canonicalTopology,
      score,
      diagnostics: [],
      metrics: {
        part_count: oracleResult.solvedBuild.parts.length,
        connection_count: oracleResult.canonicalTopology.connections.length,
        estimated_envelope_mm: [
          Math.round(dimensionsMm.x),
          Math.round(dimensionsMm.y),
          Math.round(dimensionsMm.z),
        ],
        stability_score: score.stability,
      },
    }

    return {
      candidate,
      solvedBuild: oracleResult.solvedBuild,
    }
  }

  private applyMutations(
    model: TopologyModel,
    random: DeterministicRandom,
    minimumMutations: number,
    maximumMutations: number,
  ): void {
    const mutationCount = random.nextInt(minimumMutations, maximumMutations)
    for (let mutationIndex = 0; mutationIndex < mutationCount; mutationIndex += 1) {
      const mutation = pickWeightedMutation(random)
      mutation(model, random, this.partDefsById)
    }
  }

  private deepCloneTopology(model: TopologyModel): TopologyModel {
    return JSON.parse(JSON.stringify(model)) as TopologyModel
  }

  private sortByScoreWithBuilds(items: CandidateWithBuild[]): CandidateWithBuild[] {
    return [...items].sort((left, right) => {
      if (right.candidate.score.total !== left.candidate.score.total) {
        return right.candidate.score.total - left.candidate.score.total
      }
      return left.candidate.candidate_id.localeCompare(right.candidate.candidate_id)
    })
  }
}
