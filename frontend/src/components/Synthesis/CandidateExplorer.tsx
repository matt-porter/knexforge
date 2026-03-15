import React, { useEffect } from 'react'
import { useSynthesisStore } from '../../stores/synthesisStore'
import { useBuildStore } from '../../stores/buildStore'
import { solveTopology } from '../../services/topologySolver'
import { loadAllPartDefs } from '../../hooks/usePartLibrary'
import type { SynthesisCandidate } from '../../types/synthesis'

const PANEL_COLORS = {
  bg: '#0f172a',
  border: '#1e293b',
  cardBg: '#1e293b',
  cardHover: '#334155',
  cardActive: '#1d4ed8',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  accent: '#3b82f6',
} as const

export const CandidateExplorer: React.FC = () => {
  const candidates = useSynthesisStore(s => s.candidates)
  const selectedCandidateId = useSynthesisStore(s => s.selectedCandidateId)
  const setSelectedCandidate = useSynthesisStore(s => s.setSelectedCandidate)
  const setPreviewBuild = useSynthesisStore(s => s.setPreviewBuild)
  
  const loadBuild = useBuildStore(s => s.loadBuild)

  // Update preview when selection changes
  useEffect(() => {
    if (!selectedCandidateId) {
      if (typeof setPreviewBuild === 'function') {
        setPreviewBuild(null)
      }
      return
    }

    const cand = candidates.find(c => c.candidate_id === selectedCandidateId)
    if (!cand) {
      if (typeof setPreviewBuild === 'function') {
        setPreviewBuild(null)
      }
      return
    }

    // Solve topology for preview
    const updatePreview = async () => {
      try {
        const defs = await loadAllPartDefs()
        const solved = solveTopology(cand.topology, defs)
        if (typeof setPreviewBuild === 'function') {
          setPreviewBuild(solved)
        }
      } catch (err) {
        console.error('[CandidateExplorer] Failed to solve candidate for preview:', err)
        if (typeof setPreviewBuild === 'function') {
          setPreviewBuild(null)
        }
      }
    }

    void updatePreview()
  }, [selectedCandidateId, candidates, setPreviewBuild])

  if (!candidates || candidates.length === 0) {
    return null
  }

  const handleImport = async (cand: SynthesisCandidate) => {
    try {
      const defs = await loadAllPartDefs()
      const solved = solveTopology(cand.topology, defs)
      console.log('IMPORT', cand.score.stability, cand.score.stability * 100)
      loadBuild(solved.parts, solved.connections, cand.score.stability * 100)
      // Clear selection after import
      if (typeof setSelectedCandidate === 'function') {
        setSelectedCandidate(null)
      }
      if (typeof setPreviewBuild === 'function') {
        setPreviewBuild(null)
      }
    } catch (err) {
      console.error('[CandidateExplorer] Failed to import candidate:', err)
      alert('Failed to import candidate topology.')
    }
  }

  return (
    <div 
      className="candidate-explorer"
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
        maxHeight: '60vh',
        overflowY: 'auto',
        pointerEvents: 'auto',
        color: PANEL_COLORS.text
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, borderBottom: `1px solid ${PANEL_COLORS.border}`, paddingBottom: '8px' }}>
        Generated Candidates
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {candidates.map((cand) => {
          const isSelected = cand.candidate_id === selectedCandidateId
          
          return (
            <div 
              key={cand.candidate_id}
              style={{
                padding: '12px',
                border: `1px solid ${isSelected ? PANEL_COLORS.accent : PANEL_COLORS.border}`,
                borderRadius: '6px',
                background: isSelected ? `${PANEL_COLORS.accent}1a` : PANEL_COLORS.cardBg,
                transition: 'border-color 0.2s, background-color 0.2s',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (typeof setSelectedCandidate === 'function') {
                  setSelectedCandidate(cand.candidate_id)
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>
                  {cand.summary || `Candidate ${cand.candidate_id.split('_')[1]}`}
                </h3>
                <div style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', background: '#000', borderRadius: '4px', color: PANEL_COLORS.accent }}>
                  Score: {(cand.score.total * 100).toFixed(0)}
                </div>
              </div>

              <div style={{ fontSize: '11px', color: PANEL_COLORS.textMuted, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '12px' }}>
                <div>Parts: {cand.metrics.part_count}</div>
                <div>Stability: {(cand.score.stability * 100).toFixed(0)}%</div>
                <div>Efficiency: {(cand.score.part_efficiency * 100).toFixed(0)}%</div>
                <div>Fit: {(cand.score.objective_fit * 100).toFixed(0)}%</div>
              </div>

              {isSelected && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImport(cand)
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 0',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
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
