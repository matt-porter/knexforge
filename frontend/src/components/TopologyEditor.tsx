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
  const [isAutoApply, setIsAutoApply] = useState(true)
  const [format, setFormat] = useState<EditorFormat>('json')
  const [text, setText] = useState(DEFAULT_TEMPLATE)
  const [status, setStatus] = useState('Ready')
  const [errorLines, setErrorLines] = useState<string[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [partDefsReady, setPartDefsReady] = useState(false)
  const partDefsRef = useRef<Map<string, KnexPartDef> | null>(null)
  const hasUserEditedRef = useRef(false)

  const parts = useBuildStore((state) => state.parts)
  const connections = useBuildStore((state) => state.connections)

  const loadBuild = useBuildStore((state) => state.loadBuild)

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
        setErrorLines([String(error)])
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
      setErrorLines([])
    } catch (error) {
      if (error instanceof TopologyValidationError || error instanceof TopologySolveError) {
        setStatus('Topology has issues')
        setErrorLines(error.issues.map((issue) => `${issue.code}: ${issue.message}`))
      } else {
        setStatus('Could not parse/apply topology')
        setErrorLines([error instanceof Error ? error.message : String(error)])
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
      setErrorLines([error instanceof Error ? error.message : String(error)])
    }

    setFormat(nextFormat)
    hasUserEditedRef.current = false
  }

  const handleUseCurrentBuild = () => {
    const topology = buildStateToTopology(Object.values(parts), connections)
    setText(serializeEditorText(topology, format))
    setStatus('Loaded current build into topology editor')
  }

  const handleManualApply = () => {
    applyText(text)
  }

  return (
    <div
      style={{
        width: isExpanded ? 380 : 42,
        height: '100%',
        background: '#0f172a',
        borderLeft: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
      }}
    >
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
        }}
      >
        {isExpanded ? <span>TOPOLOGY LIVE EDITOR</span> : null}
        <button
          onClick={() => setIsExpanded((value) => !value)}
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

      {isExpanded ? (
        <>
          <div style={{ padding: 10, borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Current Build: {currentPieceSummary}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                onClick={() => handleFormatChange('json')}
                style={{
                  border: '1px solid #334155',
                  background: format === 'json' ? '#1d4ed8' : '#1e293b',
                  color: '#dbeafe',
                  borderRadius: 4,
                  padding: '3px 7px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                JSON
              </button>
              <button
                onClick={() => handleFormatChange('compact')}
                style={{
                  border: '1px solid #334155',
                  background: format === 'compact' ? '#1d4ed8' : '#1e293b',
                  color: '#dbeafe',
                  borderRadius: 4,
                  padding: '3px 7px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Compact
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
                Use Current Build
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
                {isApplying ? 'Applying...' : 'Apply Now'}
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
            value={text}
            onChange={(event) => {
              hasUserEditedRef.current = true
              setText(event.target.value)
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

          <div style={{ borderTop: '1px solid #1e293b', padding: 10, maxHeight: 145, overflow: 'auto' }}>
            <div style={{ fontSize: 11, color: errorLines.length === 0 ? '#86efac' : '#fda4af', marginBottom: 6 }}>
              {status}
            </div>
            {errorLines.length > 0 ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  color: '#fca5a5',
                  fontSize: 11,
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                }}
              >
                {errorLines.join('\n')}
              </pre>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
