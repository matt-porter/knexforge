/**
 * ModelBrowser — browse, filter, and load models from dataset.jsonl.
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ Sidebar (260px) │  3D Viewer (fills remaining width)    │
 *  │  • Search bar   │                                       │
 *  │  • Filters      │  KnexViewer showing selected model    │
 *  │  • Model cards  │  (or empty state prompt)              │
 *  └─────────────────────────────────────────────────────────┘
 */

import { useEffect } from 'react'
import { useDatasetStore } from '../../stores/datasetStore'
import { useDatasetLoader, datasetEntryToBuild, countParts } from '../../hooks/useDataset'
import { useBuildStore } from '../../stores/buildStore'
import { KnexViewer } from '../Viewer/KnexViewer'
import type { DatasetEntry } from '../../types/dataset'
import type { StabilityFilter } from '../../stores/datasetStore'

// ---------------------------------------------------------------------------
// Palette colours matching the rest of the UI
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#0f0f23',
  bgCard: '#14142a',
  bgCardHover: '#1a1a3e',
  bgCardActive: '#1a2a50',
  border: '#2a2a4a',
  borderActive: '#4488ff',
  textPrimary: '#ddd',
  textSecondary: '#888',
  textMuted: '#555',
  textAccent: '#8888cc',
  stable: '#44cc88',
  unstable: '#ff6655',
  accent: '#4488ff',
} as const

// ---------------------------------------------------------------------------
// Stability badge
// ---------------------------------------------------------------------------

function StabilityBadge({ score, isStable }: { score: number; isStable: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        padding: '2px 6px',
        borderRadius: 3,
        background: isStable ? 'rgba(68,204,136,0.15)' : 'rgba(255,102,85,0.15)',
        color: isStable ? COLORS.stable : COLORS.unstable,
        border: `1px solid ${isStable ? 'rgba(68,204,136,0.35)' : 'rgba(255,102,85,0.35)'}`,
        flexShrink: 0,
      }}
    >
      {score.toFixed(0)}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Individual model card
// ---------------------------------------------------------------------------

function ModelCard({
  entry,
  index,
  isSelected,
  onSelect,
}: {
  entry: DatasetEntry
  index: number
  isSelected: boolean
  onSelect: (index: number) => void
}) {
  const pieceCount = countParts(entry)

  return (
    <button
      onClick={() => onSelect(index)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        width: '100%',
        padding: '10px 14px',
        background: isSelected ? COLORS.bgCardActive : COLORS.bgCard,
        border: isSelected ? `1px solid ${COLORS.borderActive}` : `1px solid ${COLORS.border}`,
        borderRadius: 6,
        color: isSelected ? '#aaccff' : COLORS.textPrimary,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.1s, border-color 0.1s',
        boxShadow: isSelected ? '0 0 10px rgba(68,136,255,0.2)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = COLORS.bgCardHover
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = COLORS.bgCard
      }}
    >
      {/* Top row: ID + stability */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textAccent, fontFamily: 'monospace' }}>
          {entry.id}
        </span>
        <StabilityBadge score={entry.stability} isStable={entry.is_stable} />
      </div>

      {/* Caption */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: isSelected ? '#bbd' : COLORS.textSecondary,
          lineHeight: 1.4,
          // Two-line clamp
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {entry.caption}
      </p>

      {/* Bottom row: piece count */}
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>
        {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}
        {' · '}
        {entry.actions.filter((a) => a.action === 'snap').length} connections
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function StabilityFilterBar({
  current,
  onChange,
}: {
  current: StabilityFilter
  onChange: (f: StabilityFilter) => void
}) {
  const options: { value: StabilityFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'stable', label: '✓ Stable' },
    { value: 'unstable', label: '✗ Unstable' },
  ]

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((opt) => {
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: active ? 700 : 400,
              background: active ? '#1a2a4e' : 'transparent',
              border: active ? `1px solid ${COLORS.borderActive}` : `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: active ? COLORS.accent : COLORS.textSecondary,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function ModelBrowserSidebar() {
  const { loading, error } = useDatasetLoader()
  const entries = useDatasetStore((s) => s.entries)
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const stabilityFilter = useDatasetStore((s) => s.stabilityFilter)
  const selectedIndex = useDatasetStore((s) => s.selectedIndex)
  const filteredEntries = useDatasetStore((s) => s.filteredEntries)
  const setSearchQuery = useDatasetStore((s) => s.setSearchQuery)
  const setStabilityFilter = useDatasetStore((s) => s.setStabilityFilter)
  const selectEntry = useDatasetStore((s) => s.selectEntry)
  const loadBuild = useBuildStore((s) => s.loadBuild)

  const filtered = filteredEntries()

  const handleSelect = (index: number) => {
    // Map filtered index back to entries array index
    const entry = filtered[index]
    const globalIndex = entries.indexOf(entry)
    selectEntry(globalIndex)
    // Load into the 3D viewer via BuildStore
    const { parts, connections } = datasetEntryToBuild(entry)
    loadBuild(parts, connections, entry.stability)
  }

  return (
    <div
      style={{
        width: 280,
        height: '100%',
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* ---- Header ---- */}
      <div
        style={{
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            margin: '0 0 10px',
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.textAccent,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Model Browser
        </h2>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by ID or caption…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 10px',
            marginBottom: 8,
            background: '#0a0a1e',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.textPrimary,
            fontSize: 12,
            outline: 'none',
          }}
        />

        {/* Stability filter */}
        <StabilityFilterBar current={stabilityFilter} onChange={setStabilityFilter} />
      </div>

      {/* ---- Summary row ---- */}
      <div
        style={{
          padding: '6px 16px',
          fontSize: 11,
          color: COLORS.textMuted,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        {loading
          ? 'Loading dataset…'
          : error
            ? `Error: ${error}`
            : `${filtered.length} of ${entries.length} models`}
      </div>

      {/* ---- Model cards list ---- */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {loading && (
          <div style={{ padding: '20px 0', color: COLORS.textMuted, fontSize: 12, textAlign: 'center' }}>
            Loading dataset…
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '20px 0', color: COLORS.textMuted, fontSize: 12, textAlign: 'center' }}>
            No models match your filters.
          </div>
        )}

        {filtered.map((entry, i) => {
          const globalIndex = entries.indexOf(entry)
          return (
            <ModelCard
              key={entry.id}
              entry={entry}
              index={i}
              isSelected={selectedIndex === globalIndex}
              onSelect={() => handleSelect(i)}
            />
          )
        })}
      </div>

      {/* ---- Footer stats ---- */}
      {!loading && !error && entries.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            fontSize: 11,
            color: COLORS.textMuted,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {entries.filter((e) => e.is_stable).length} stable
          </span>
          <span>
            avg {(entries.reduce((sum, e) => sum + e.stability, 0) / entries.length).toFixed(1)}% stability
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Viewer overlay shown when no model is selected
// ---------------------------------------------------------------------------

function EmptyStateOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(10,10,30,0.82)',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: '28px 36px',
          textAlign: 'center',
          maxWidth: 340,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
        <p style={{ margin: 0, color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          Select a model from the list to preview it here.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Model detail header — overlaid on the 3D viewer when a model is selected
// ---------------------------------------------------------------------------

function ModelDetailHeader() {
  const entries = useDatasetStore((s) => s.entries)
  const selectedIndex = useDatasetStore((s) => s.selectedIndex)
  const selectEntry = useDatasetStore((s) => s.selectEntry)
  const loadBuild = useBuildStore((s) => s.loadBuild)

  const entry = selectedIndex !== null ? entries[selectedIndex] : null
  if (!entry) return null

  const pieceCount = countParts(entry)

  const handleLoadIntoBuilder = () => {
    // The build is already loaded; switching tabs will show the Builder view with it.
    // We expose this as a data attribute so App.tsx can read it and switch tabs.
    window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        background: 'rgba(10,10,30,0.88)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        pointerEvents: 'auto',
        backdropFilter: 'blur(6px)',
        maxWidth: 'calc(100% - 48px)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {/* ID */}
      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textAccent, fontFamily: 'monospace' }}>
        {entry.id}
      </span>

      {/* Caption (truncated) */}
      <span
        style={{
          fontSize: 12,
          color: COLORS.textSecondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flexShrink: 1,
        }}
      >
        {entry.caption}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Stats */}
      <span style={{ fontSize: 11, color: COLORS.textMuted, flexShrink: 0 }}>
        {pieceCount} pcs
      </span>
      <StabilityBadge score={entry.stability} isStable={entry.is_stable} />

      {/* Open in Builder */}
      <button
        onClick={handleLoadIntoBuilder}
        style={{
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          background: '#1a2a4e',
          border: `1px solid ${COLORS.borderActive}`,
          borderRadius: 4,
          color: COLORS.accent,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Open in Builder ↗
      </button>

      {/* Deselect */}
      <button
        onClick={() => {
          selectEntry(null)
          loadBuild([], [], 100)
        }}
        title="Close preview"
        style={{
          padding: '4px 8px',
          fontSize: 12,
          background: 'transparent',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          color: COLORS.textMuted,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

/**
 * Full-page Model Browser view.
 * Renders a sidebar with filterable model cards beside the KnexViewer.
 * Clicking a card loads that model into the BuildStore so it displays in 3D.
 */
export function ModelBrowser() {
  const entries = useDatasetStore((s) => s.entries)
  const selectedIndex = useDatasetStore((s) => s.selectedIndex)
  const hasSelection = selectedIndex !== null && selectedIndex < entries.length

  // Clear the viewer when the browser is first shown
  const loadBuild = useBuildStore((s) => s.loadBuild)
  useEffect(() => {
    if (!hasSelection) {
      loadBuild([], [], 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <ModelBrowserSidebar />

      {/* 3D viewer pane */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <KnexViewer loadDemoWhenEmpty={false} />
        {!hasSelection && <EmptyStateOverlay />}
        <ModelDetailHeader />
      </div>
    </div>
  )
}
