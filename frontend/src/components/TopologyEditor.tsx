import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useBuildStore } from '../stores/buildStore'
import { loadAllPartDefs } from '../hooks/usePartLibrary'
import type { KnexPartDef } from '../types/parts'
import {
  buildStateToTopology,
  solveTopology,
  TopologySolveError,
  TopologyValidationError,
  type TopologyModel,
} from '../services/topologySolver'
import { parseCompactTopology, stringifyCompactTopology } from '../services/topologyCompactFormat'
import {
  getCompactAutocomplete,
  type CompactAutocompleteResult,
} from '../services/topologyCompactAutocomplete'

type EditorFormat = 'json' | 'compact'

function safeParseTopology(text: string): TopologyModel {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Topology text must be a JSON object')
  }

  const model = parsed as Partial<TopologyModel>
  if (model.format_version !== 'topology-v1') {
    throw new Error("format_version must be 'topology-v1'")
  }
  if (!Array.isArray(model.parts) || !Array.isArray(model.connections)) {
    throw new Error("Topology JSON must include 'parts' and 'connections' arrays")
  }

  return {
    format_version: 'topology-v1',
    parts: model.parts,
    connections: model.connections,
    metadata: model.metadata,
  }
}

const DEFAULT_TEMPLATE = `{
  "format_version": "topology-v1",
  "parts": [
    { "instance_id": "c1", "part_id": "connector-4way-green-v1" },
    { "instance_id": "r1", "part_id": "rod-128-red-v1" }
  ],
  "connections": [
    { "from": "r1.end1", "to": "c1.A" }
  ]
}`

const DEFAULT_COMPACT_TEMPLATE = `part c1 connector-4way-green-v1
part r1 rod-128-red-v1

r1.end1 -- c1.A`

function parseEditorText(rawText: string, format: EditorFormat): TopologyModel {
  if (format === 'json') {
    return safeParseTopology(rawText)
  }
  return parseCompactTopology(rawText)
}

function serializeEditorText(model: TopologyModel, format: EditorFormat): string {
  if (format === 'json') {
    return JSON.stringify(model, null, 2)
  }
  return stringifyCompactTopology(model)
}

export function TopologyEditor() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [panelWidth, setPanelWidth] = useState(380)
  const [isAutoApply, setIsAutoApply] = useState(true)
  const [format, setFormat] = useState<EditorFormat>('json')
  const [text, setText] = useState(DEFAULT_TEMPLATE)
  const [status, setStatus] = useState('Ready')
  const [errorLines, setErrorLines] = useState<{message: string, severity: 'error' | 'warning' | 'info'}[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [partDefsReady, setPartDefsReady] = useState(false)
  const [autocomplete, setAutocomplete] = useState<CompactAutocompleteResult | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const partDefsRef = useRef<Map<string, KnexPartDef> | null>(null)
  const hasUserEditedRef = useRef(false)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(380)
  const expandingRef = useRef(false)

  const parts = useBuildStore((state) => state.parts)
  const connections = useBuildStore((state) => state.connections)

  const loadBuild = useBuildStore((state) => state.loadBuild)

  // Helper to safely toggle with transition protection
  const safeToggleExpanded = useCallback(() => {
    if (expandingRef.current) return
    expandingRef.current = true
    setIsExpanded((prev) => !prev)
    setTimeout(() => {
      expandingRef.current = false
    }, 200)
  }, [])

  // Listen for global toggle event from App component (T key shortcut)
  useEffect(() => {
    const handleToggle = () => {
      safeToggleExpanded()
    }
    window.addEventListener('knexforge:toggle-text-editor' as any, handleToggle)
    return () => window.removeEventListener('knexforge:toggle-text-editor' as any, handleToggle)
  }, [safeToggleExpanded])

  useEffect(() => {
    let cancelled = false
    void loadAllPartDefs()
      .then((defs) => {
        if (cancelled) return
        partDefsRef.current = defs
        setPartDefsReady(true)
      })
      .catch((error) => {
        if (cancelled) return
        setStatus('Failed to load part definitions')
        setErrorLines([{ message: String(error), severity: 'error' }])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const currentPieceSummary = useMemo(() => {
    return `${Object.keys(parts).length} parts · ${connections.length} connections`
  }, [parts, connections])

  const applyText = useCallback((rawText: string) => {
    const defs = partDefsRef.current
    if (!defs) {
      setStatus('Part definitions are still loading...')
      return
    }

    setIsApplying(true)
    try {
      const model = parseEditorText(rawText, format)
      const solved = solveTopology(model, defs)
      loadBuild(solved.parts, solved.connections)
      setStatus(
        `Applied ${format.toUpperCase()} topology (${solved.parts.length} parts, ${solved.connections.length} connections)`,
      )
      if (solved.warnings && solved.warnings.length > 0) {
        setErrorLines(solved.warnings.map(w => ({ message: `${w.code}: ${w.message}`, severity: w.severity || 'warning' })))
      } else {
        setErrorLines([])
      }
    } catch (error) {
      if (error instanceof TopologyValidationError || error instanceof TopologySolveError) {
        setStatus('Topology has issues')
        setErrorLines(error.issues.map((issue) => ({ 
          message: `${issue.code}: ${issue.message}`, 
          severity: issue.severity ?? 'error' 
        })))
      } else {
        setStatus('Could not parse/apply topology')
        setErrorLines([{ message: error instanceof Error ? error.message : String(error), severity: 'error' }])
      }
    } finally {
      setIsApplying(false)
    }
  }, [format, loadBuild])

  useEffect(() => {
    if (!isAutoApply || !partDefsReady || !hasUserEditedRef.current) return

    const timer = window.setTimeout(() => {
      applyText(text)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [isAutoApply, text, partDefsReady, applyText])

  useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizeStartXRef.current
      const nextWidth = Math.min(760, Math.max(260, resizeStartWidthRef.current - deltaX))
      setPanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing])

  const handleFormatChange = (nextFormat: EditorFormat) => {
    if (nextFormat === format) return

    try {
      const model = parseEditorText(text, format)
      setText(serializeEditorText(model, nextFormat))
      setStatus(`Switched to ${nextFormat.toUpperCase()} mode`)
      setErrorLines([])
    } catch (error) {
      const fallback = nextFormat === 'json' ? DEFAULT_TEMPLATE : DEFAULT_COMPACT_TEMPLATE
      setText(fallback)
      setStatus(`Switched to ${nextFormat.toUpperCase()} mode (could not convert previous text)`)
      setErrorLines([{ message: error instanceof Error ? error.message : String(error), severity: 'error' }])
    }

    setFormat(nextFormat)
    setAutocomplete(null)
    hasUserEditedRef.current = false
  }

  const toggleFormat = () => {
    handleFormatChange(format === 'compact' ? 'json' : 'compact')
  }

  const handleUseCurrentBuild = () => {
    const topology = buildStateToTopology(Object.values(parts), connections)
    setText(serializeEditorText(topology, format))
    setStatus('Loaded current build into topology editor')
  }

  const handleManualApply = () => {
    applyText(text)
  }

  const refreshAutocomplete = (rawText: string, cursor: number) => {
    const defs = partDefsRef.current
    if (format !== 'compact' || !defs) {
      setAutocomplete(null)
      return
    }

    const result = getCompactAutocomplete(rawText, cursor, defs)
    setAutocomplete(result)
  }

  const applyAutocompleteSuggestion = (insertText: string) => {
    if (!autocomplete) return

    const nextText =
      text.slice(0, autocomplete.replaceStart) + insertText + text.slice(autocomplete.replaceEnd)
    const nextCursor = autocomplete.replaceStart + insertText.length
    hasUserEditedRef.current = true
    setText(nextText)
    setAutocomplete(null)

    window.requestAnimationFrame(() => {
      const input = textAreaRef.current
      if (!input) return
      input.focus()
      input.selectionStart = nextCursor
      input.selectionEnd = nextCursor
      refreshAutocomplete(nextText, nextCursor)
    })
  }

  return (
    <div
      style={{
        width: isExpanded ? panelWidth : 42,
        height: '100%',
        background: '#0f172a',
        borderLeft: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        flex: '0 0 auto',
        flexShrink: 0,
        transition: isResizing ? 'none' : 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Always show resize/toggle handle on left edge */}
      <div
        onMouseDown={(event) => {
          if (isExpanded) {
            // Resize mode when expanded
            event.preventDefault()
            resizeStartXRef.current = event.clientX
            resizeStartWidthRef.current = panelWidth
            setIsResizing(true)
          } else {
            // Toggle expand when collapsed
            event.preventDefault()
            safeToggleExpanded()
          }
        }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: isExpanded ? 10 : 42,
          cursor: isExpanded ? 'col-resize' : 'pointer',
          zIndex: 20,
          borderRight: '1px solid #334155',
          background: isResizing 
            ? 'rgba(59,130,246,0.35)' 
            : isExpanded 
              ? 'rgba(15,23,42,0.95)' 
              : 'linear-gradient(90deg, rgba(15,23,42,0.95) 0%, rgba(59,130,246,0.2) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={isExpanded ? 'Drag to resize editor' : 'Click to expand editor'}
      >
        {!isExpanded && (
          <span style={{ 
            fontSize: 9, 
            fontWeight: 700, 
            color: '#4fc3f7',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            letterSpacing: '2px'
          }}>
            TXT
          </span>
        )}
      </div>

      <div
        style={{
          height: 42,
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'space-between' : 'center',
          padding: isExpanded ? '0 10px' : '0',
          color: '#cbd5e1',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          transition: 'padding 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <span style={{ 
          opacity: isExpanded ? 1 : 0,
          width: isExpanded ? 'auto' : 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          transition: 'opacity 0.15s ease, width 0.15s ease',
        }}>
          TOPOLOGY LIVE EDITOR
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            safeToggleExpanded()}
          }
          style={{
            border: '1px solid #334155',
            background: '#111827',
            color: '#93c5fd',
            borderRadius: 4,
            padding: isExpanded ? '2px 8px' : '2px 6px',
            cursor: 'pointer',
            fontSize: 11,
          }}
          title={isExpanded ? 'Collapse editor' : 'Expand editor'}
        >
          {isExpanded ? 'Hide' : 'TXT'}
        </button>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        opacity: isExpanded ? 1 : 0,
        visibility: isExpanded ? 'visible' : 'hidden',
        transition: 'opacity 0.15s ease, visibility 0.15s linear',
      }}>
        <>
          <div style={{ padding: 10, borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Current Build: {currentPieceSummary}</div>
            <div
              style={{
                display: 'inline-flex',
                gap: 6,
                marginBottom: 8,
                alignItems: 'center',
                border: '1px solid #334155',
                borderRadius: 999,
                padding: '2px 6px',
                background: '#0b1220',
              }}
            >
              <button
                onClick={() => handleFormatChange('compact')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: format === 'compact' ? '#93c5fd' : '#94a3b8',
                  fontWeight: format === 'compact' ? 700 : 500,
                  borderRadius: 999,
                  padding: '2px 6px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                compact
              </button>
              <button
                onClick={toggleFormat}
                style={{
                  position: 'relative',
                  width: 30,
                  height: 16,
                  borderRadius: 999,
                  border: '1px solid #334155',
                  background: format === 'json' ? '#1d4ed8' : '#0f172a',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Toggle compact/json"
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    left: format === 'json' ? 15 : 1,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#dbeafe',
                    transition: 'left 0.15s ease',
                  }}
                />
              </button>
              <button
                onClick={() => handleFormatChange('json')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: format === 'json' ? '#93c5fd' : '#94a3b8',
                  fontWeight: format === 'json' ? 700 : 500,
                  borderRadius: 999,
                  padding: '2px 6px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                json
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleUseCurrentBuild}
                style={{
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#dbeafe',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {'Model -> Text'}
              </button>
              <button
                onClick={handleManualApply}
                disabled={isApplying || !partDefsReady}
                style={{
                  border: '1px solid #1d4ed8',
                  background: '#2563eb',
                  color: '#eff6ff',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: isApplying || !partDefsReady ? 'default' : 'pointer',
                  opacity: isApplying || !partDefsReady ? 0.6 : 1,
                }}
              >
                {isApplying ? 'Applying...' : 'Text -> Model'}
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#bfdbfe', fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={isAutoApply}
                  onChange={(event) => setIsAutoApply(event.target.checked)}
                />
                Live Apply
              </label>
            </div>
          </div>

          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(event) => {
              hasUserEditedRef.current = true
              const nextText = event.target.value
              setText(nextText)
              refreshAutocomplete(nextText, event.target.selectionStart ?? nextText.length)
            }}
            onClick={(event) => {
              refreshAutocomplete(text, (event.target as HTMLTextAreaElement).selectionStart ?? text.length)
            }}
            onKeyUp={(event) => {
              refreshAutocomplete(text, (event.target as HTMLTextAreaElement).selectionStart ?? text.length)
            }}
            onBlur={() => {
              window.setTimeout(() => setAutocomplete(null), 150)
            }}
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: '#020617',
              color: '#e2e8f0',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.45,
              padding: 12,
            }}
          />

          {format === 'compact' && autocomplete && autocomplete.suggestions.length > 0 ? (
            <div
              style={{
                borderTop: '1px solid #1e293b',
                borderBottom: '1px solid #1e293b',
                background: '#0b1220',
                maxHeight: 150,
                overflowY: 'auto',
              }}
            >
              {autocomplete.suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.insertText}-${suggestion.detail ?? ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    applyAutocompleteSuggestion(suggestion.insertText)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: '#dbeafe',
                    padding: '6px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}>
                    {suggestion.label}
                  </span>
                  <span style={{ color: '#93c5fd' }}>{suggestion.detail ?? ''}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ borderTop: '1px solid #1e293b', padding: 10, maxHeight: 145, overflow: 'auto' }}>
            <div style={{ fontSize: 11, color: errorLines.length === 0 ? '#86efac' : '#fda4af', marginBottom: 6 }}>
              {status}
            </div>
            {errorLines.length > 0 ? (
              <div
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontSize: 11,
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                }}
              >
                {errorLines.map((line, idx) => (
                  <div key={idx} style={{ color: line.severity === 'warning' ? '#fcd34d' : line.severity === 'info' ? '#93c5fd' : '#fca5a5' }}>
                    {line.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      </div>
    </div>
  )
}
