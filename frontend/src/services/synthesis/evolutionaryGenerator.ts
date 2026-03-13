import type { SynthesisCandidate, SynthesisCandidateRejection, SynthesisGoal } from '../../types/synthesis'
import type { KnexPartDef } from '../../types/parts'
import type { TopologyModel } from '../topologySolver'
import { DeterministicRandom, pickWeightedMutation } from './mutations'
import { TopologyOracle } from './topologyOracle'
import { evaluateCandidateScore } from './scoring'
import { selectTemplateByPrompt } from './promptMatcher'

export interface GenerationResult {
  candidates: SynthesisCandidate[]
  rejections: SynthesisCandidateRejection[]
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
    let population: SynthesisCandidate[] = []
    const candidateIdCounter = { value: 1 }
    let evaluatedCandidates = 0

    // Initial population sampling from prompt-guided templates.
    const maxInitialAttempts = Math.max(config.populationSize * 20, config.populationSize)
    let attempts = 0

    while (population.length < config.populationSize && attempts < maxInitialAttempts) {
      attempts += 1

      const template = selectTemplateByPrompt(goal.prompt, random)
      const baseModel = template.generate({
        requireMotor: goal.constraints.require_motor,
        maxEnvelopeMm: goal.constraints.max_envelope_mm,
        seed: random.nextInt(0, 1000000),
      })

      const candidateModel = this.deepCloneTopology(baseModel)
      this.applyMutations(candidateModel, random, 15, 40)

      const candidate = this.evaluateCandidate(
        candidateModel,
        `Generated from ${template.name}`,
        goal,
        candidateIdCounter,
        rejections,
      )

      evaluatedCandidates += 1
      if (candidate) {
        population.push(candidate)
      }
    }

    population = this.sortByScore(population)

    for (let generation = 1; generation <= config.generations; generation += 1) {
      if (population.length > 0) {
        const survivors = population.slice(0, Math.min(config.survivors, population.length))
        const nextPopulation: SynthesisCandidate[] = [...survivors]

        for (const survivor of survivors) {
          for (let childIndex = 0; childIndex < config.childrenPerSurvivor; childIndex += 1) {
            const childModel = this.deepCloneTopology(survivor.topology)
            this.applyMutations(childModel, random, 3, 8)

            const childCandidate = this.evaluateCandidate(
              childModel,
              `Evolved from ${survivor.candidate_id}`,
              goal,
              candidateIdCounter,
              rejections,
            )

            evaluatedCandidates += 1
            if (childCandidate) {
              nextPopulation.push(childCandidate)
            }
          }
        }

        population = this.sortByScore(nextPopulation)
      }

      options.onProgress?.({
        generation,
        totalGenerations: config.generations,
        bestScore: population[0]?.score.total ?? 0,
        candidateCount: population.length,
        evaluatedCandidates,
      })
    }

    return {
      candidates: this.sortByScore(population).slice(0, requestedCandidateCount),
      rejections,
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

  private evaluateCandidate(
    model: TopologyModel,
    summary: string,
    goal: SynthesisGoal,
    candidateIdCounter: { value: number },
    rejections: SynthesisCandidateRejection[],
  ): SynthesisCandidate | null {
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

    return {
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

  private sortByScore(candidates: SynthesisCandidate[]): SynthesisCandidate[] {
    return [...candidates].sort((left, right) => {
      if (right.score.total !== left.score.total) {
        return right.score.total - left.score.total
      }
      return left.candidate_id.localeCompare(right.candidate_id)
    })
  }
}
