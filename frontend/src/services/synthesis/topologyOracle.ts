import {
  canonicalizeTopology,
  solveTopology,
  TopologyValidationError,
  TopologySolveError,
} from '../topologySolver'
import type { TopologyModel, SolvedTopologyBuild } from '../topologySolver'
import type { SynthesisDiagnostic } from '../../types/synthesis'
import type { KnexPartDef } from '../../types/parts'

export interface OracleSuccess {
  isValid: true
  canonicalTopology: TopologyModel
  solvedBuild: SolvedTopologyBuild
}

export interface OracleRejection {
  isValid: false
  reasonCode: string
  reasonMessage: string
  diagnostics: SynthesisDiagnostic[]
}

export type OracleResult = OracleSuccess | OracleRejection

export class TopologyOracle {
  private partDefsById: Map<string, KnexPartDef>

  constructor(partDefsById: Map<string, KnexPartDef>) {
    this.partDefsById = partDefsById
  }

  public evaluate(model: TopologyModel): OracleResult {
    // 1. Canonicalize the input model so equivalent graphs hash to the same structure
    const canonicalTopology = canonicalizeTopology(model)

    try {
      // 2. Run deterministic placement solver
      // This internally calls validateAndResolveConnections and checks for loop closure
      const solvedBuild = solveTopology(canonicalTopology, this.partDefsById)

      return {
        isValid: true,
        canonicalTopology,
        solvedBuild,
      }
    } catch (err: unknown) {
      if (err instanceof TopologyValidationError) {
        return {
          isValid: false,
          reasonCode: 'topology_validation_failed',
          reasonMessage: 'The generated topology is structurally invalid.',
          diagnostics: err.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            severity: issue.severity ?? 'error',
            details: issue.details as Record<string, unknown> | undefined,
          })),
        }
      }

      if (err instanceof TopologySolveError) {
        return {
          isValid: false,
          reasonCode: 'topology_solve_failed',
          reasonMessage: 'The generated topology cannot form a valid physical 3D assembly.',
          diagnostics: err.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            severity: issue.severity ?? 'error',
            details: issue.details as Record<string, unknown> | undefined,
          })),
        }
      }

      // Unexpected errors
      const errorMessage = err instanceof Error ? err.message : String(err)
      return {
        isValid: false,
        reasonCode: 'internal_solver_error',
        reasonMessage: 'An unexpected error occurred during topology solving.',
        diagnostics: [
          {
            code: 'internal_error',
            message: errorMessage,
            severity: 'error',
          },
        ],
      }
    }
  }
}
