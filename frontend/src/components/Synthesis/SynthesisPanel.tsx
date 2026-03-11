import React from 'react'
import { useSynthesisStore } from '../../stores/synthesisStore'
import type { SynthesisObjective } from '../../types/synthesis'
import { loadAllPartDefs } from '../../hooks/usePartLibrary'

const OBJECTIVES: { value: SynthesisObjective, label: string }[] = [
  { value: 'stability', label: 'Stability' },
  { value: 'compactness', label: 'Compactness' },
  { value: 'part_efficiency', label: 'Part Efficiency' },
  { value: 'structural_simplicity', label: 'Structural Simplicity' },
]

const PANEL_COLORS = {
  bg: '#0f172a',
  border: '#1e293b',
  inputBg: '#020617',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  accent: '#3b82f6',
  accentDark: '#1d4ed8',
} as const

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
    
    const goal = getGoal()
    startGeneration()
    
    try {
      const partDefsMap = await loadAllPartDefs()
      const partDefs = Object.fromEntries(partDefsMap.entries())

      const { getSynthesisRuntime } = await import('../../services/synthesis/runtime')
      const runtime = getSynthesisRuntime()
      
      const result = await runtime.startJob(goal, {
        partDefs,
      })
      
      if (result.candidates && result.candidates.length > 0) {
        setCandidates(result.candidates)
      }
    } catch (err) {
      console.error('[SynthesisPanel] Synthesis failed:', err)
    } finally {
      stopGeneration()
    }
  }

  return (
    <div 
      className="synthesis-panel"
      style={{
        padding: '16px',
        background: PANEL_COLORS.bg,
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        border: `1px solid ${PANEL_COLORS.border}`,
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        pointerEvents: 'auto',
        color: PANEL_COLORS.text
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>AI Mechanism Synthesis</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: PANEL_COLORS.textMuted }}>Goal Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A spinning sign post mechanism..."
          style={{
            padding: '8px',
            fontSize: '13px',
            background: PANEL_COLORS.inputBg,
            border: `1px solid ${PANEL_COLORS.border}`,
            borderRadius: '4px',
            resize: 'none',
            outline: 'none',
            color: PANEL_COLORS.text,
            minHeight: '60px'
          }}
          rows={3}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: PANEL_COLORS.textMuted }}>Optimization Objectives</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {OBJECTIVES.map(obj => (
            <button
              key={obj.value}
              onClick={() => toggleObjective(obj.value)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                borderRadius: '999px',
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: objectives.includes(obj.value) ? `${PANEL_COLORS.accent}33` : 'transparent',
                borderColor: objectives.includes(obj.value) ? PANEL_COLORS.accent : PANEL_COLORS.border,
                color: objectives.includes(obj.value) ? PANEL_COLORS.accent : PANEL_COLORS.textMuted
              }}
            >
              {obj.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: PANEL_COLORS.textMuted }}>Constraints</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: PANEL_COLORS.textMuted, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={constraints.require_motor ?? false}
            onChange={(e) => setConstraint('require_motor', e.target.checked)}
            style={{ accentColor: PANEL_COLORS.accent }}
          />
          Require Motor
        </label>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: PANEL_COLORS.textMuted }}>
          <label style={{ flex: 1 }}>Max Parts:</label>
          <input
            type="number"
            min={1}
            max={200}
            value={constraints.max_parts ?? 50}
            onChange={(e) => setConstraint('max_parts', parseInt(e.target.value, 10))}
            style={{
              width: '64px',
              padding: '4px',
              background: PANEL_COLORS.inputBg,
              border: `1px solid ${PANEL_COLORS.border}`,
              borderRadius: '4px',
              textAlign: 'center',
              outline: 'none',
              color: PANEL_COLORS.text
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: PANEL_COLORS.textMuted }}>
        <label style={{ flex: 1 }}>Candidates to Generate:</label>
        <input
          type="number"
          min={1}
          max={10}
          value={candidateCount}
          onChange={(e) => setCandidateCount(parseInt(e.target.value, 10))}
          style={{
            width: '64px',
            padding: '4px',
            background: PANEL_COLORS.inputBg,
            border: `1px solid ${PANEL_COLORS.border}`,
            borderRadius: '4px',
            textAlign: 'center',
            outline: 'none',
            color: PANEL_COLORS.text
          }}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating || prompt.trim().length === 0}
        style={{
          marginTop: '8px',
          width: '100%',
          padding: '10px 0',
          background: PANEL_COLORS.accent,
          color: '#fff',
          fontWeight: 600,
          border: 'none',
          borderRadius: '4px',
          cursor: isGenerating || prompt.trim().length === 0 ? 'default' : 'pointer',
          opacity: isGenerating || prompt.trim().length === 0 ? 0.6 : 1,
          transition: 'background-color 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          if (!isGenerating && prompt.trim().length > 0) e.currentTarget.style.background = PANEL_COLORS.accentDark
        }}
        onMouseLeave={(e) => {
          if (!isGenerating && prompt.trim().length > 0) e.currentTarget.style.background = PANEL_COLORS.accent
        }}
      >
        {isGenerating ? (
          <>
            <svg style={{ animation: 'spin 1s linear infinite', height: '16px', width: '16px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </>
        ) : (
          'Synthesize'
        )}
      </button>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
