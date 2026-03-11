import React from 'react'
import { useSynthesisStore } from '../../stores/synthesisStore'
import type { SynthesisObjective } from '../../types/synthesis'

const OBJECTIVES: { value: SynthesisObjective, label: string }[] = [
  { value: 'stability', label: 'Stability' },
  { value: 'compactness', label: 'Compactness' },
  { value: 'part_efficiency', label: 'Part Efficiency' },
  { value: 'structural_simplicity', label: 'Structural Simplicity' },
]

export const SynthesisPanel: React.FC = () => {
  const {
    prompt,
    objectives,
    constraints,
    candidateCount,
    isGenerating,
    setPrompt,
    toggleObjective,
    setConstraint,
    setCandidateCount,
    startGeneration,
    stopGeneration,
    setCandidates,
    getGoal
  } = useSynthesisStore()

  const handleGenerate = async () => {
    if (isGenerating) return
    
    startGeneration()
    try {
      const { getSynthesisRuntime } = await import('../../services/synthesis/runtime')
      const runtime = getSynthesisRuntime()
      const result = await runtime.startJob(getGoal())
      
      if (result.candidates) {
        setCandidates(result.candidates)
      }
    } catch (err) {
      console.error('Synthesis failed:', err)
    } finally {
      stopGeneration()
    }
  }

  return (
    <div className="synthesis-panel p-4 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 w-80 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">AI Mechanism Synthesis</h2>
      
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Goal Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A spinning sign post mechanism..."
          className="p-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Optimization Objectives</label>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map(obj => (
            <button
              key={obj.value}
              onClick={() => toggleObjective(obj.value)}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                objectives.includes(obj.value)
                  ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-500/50 dark:text-blue-300'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {obj.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Constraints</label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={constraints.require_motor ?? false}
            onChange={(e) => setConstraint('require_motor', e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
          />
          Require Motor
        </label>
        
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <label className="flex-1">Max Parts:</label>
          <input
            type="number"
            min={1}
            max={200}
            value={constraints.max_parts ?? 50}
            onChange={(e) => setConstraint('max_parts', parseInt(e.target.value, 10))}
            className="w-16 p-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <label className="flex-1">Candidates to Generate:</label>
        <input
          type="number"
          min={1}
          max={10}
          value={candidateCount}
          onChange={(e) => setCandidateCount(parseInt(e.target.value, 10))}
          className="w-16 p-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating || prompt.trim().length === 0}
        className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded shadow transition-colors flex items-center justify-center"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </span>
        ) : (
          'Synthesize'
        )}
      </button>
    </div>
  )
}
