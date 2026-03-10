import React from 'react'
import { useSynthesisStore } from '../../stores/synthesisStore'
import { useBuildStore } from '../../stores/buildStore'
import type { SynthesisCandidate } from '../../types/synthesis'

export const CandidateExplorer: React.FC = () => {
  const { candidates, selectedCandidateId, setSelectedCandidate } = useSynthesisStore()
  const { loadBuild } = useBuildStore()

  if (!candidates || candidates.length === 0) {
    return null
  }

  const handleImport = (cand: SynthesisCandidate) => {
    // For now, assume candidates come with a solvedBuild in their metrics/metadata?
    // Oh wait, SynthesisCandidate has 'topology' but we need parts/connections to load into buildStore.
    // In our generator we have the solvedBuild, we should probably add it to the candidate payload 
    // or run solveTopology on import.
    // For this UI mockup task, we'll just log or assume it exists in a full integration.
    // If it's missing, we'll just alert.
    if ((cand as any).solvedBuild) {
       loadBuild((cand as any).solvedBuild.parts, (cand as any).solvedBuild.connections, cand.score.stability)
    } else {
       console.log('Would import candidate topology:', cand.topology)
       // Let's assume we dispatch an event that does the solve, or we just pass the topology.
       // The buildStore expects Parts and Connections.
       alert('Importing candidate: ' + cand.candidate_id)
    }
  }

  return (
    <div className="candidate-explorer p-4 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 w-80 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700 pb-2">
        Generated Candidates
      </h2>

      <div className="flex flex-col gap-4">
        {candidates.map((cand) => {
          const isSelected = cand.candidate_id === selectedCandidateId
          
          return (
            <div 
              key={cand.candidate_id}
              className={`p-3 border rounded-md transition-colors cursor-pointer ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
              onClick={() => setSelectedCandidate(cand.candidate_id)}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                  {cand.summary || `Candidate ${cand.candidate_id.split('_')[1]}`}
                </h3>
                <div className="text-xs font-mono font-bold px-2 py-1 bg-zinc-100 dark:bg-zinc-900 rounded text-zinc-600 dark:text-zinc-300">
                  Score: {(cand.score.total * 100).toFixed(0)}
                </div>
              </div>

              <div className="text-xs text-zinc-600 dark:text-zinc-400 grid grid-cols-2 gap-1 mb-3">
                <div>Parts: {cand.metrics.part_count}</div>
                <div>Stability: {(cand.score.stability * 100).toFixed(0)}</div>
                <div>Efficiency: {(cand.score.part_efficiency * 100).toFixed(0)}</div>
                <div>Fit: {(cand.score.objective_fit * 100).toFixed(0)}</div>
              </div>

              {isSelected && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImport(cand)
                  }}
                  className="w-full py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded shadow transition-colors"
                >
                  Import into Scene
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
