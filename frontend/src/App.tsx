import { useState, useEffect } from 'react'
import { KnexViewer } from './components/Viewer/KnexViewer'
import { PartPalette } from './components/PartPalette'
import { ModelBrowser } from './components/ModelBrowser/ModelBrowser'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useBuildStore } from './stores/buildStore'
import './App.css'

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type AppTab = 'builder' | 'browser'

// ---------------------------------------------------------------------------
// Top tab bar
// ---------------------------------------------------------------------------

const TAB_BAR_COLORS = {
  bg: '#0a0a1e',
  border: '#2a2a4a',
  tabActive: '#1a1a3e',
  tabHover: '#14142a',
  textActive: '#aaccff',
  textInactive: '#666',
  accent: '#4488ff',
} as const

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
}) {
  const tabs: { id: AppTab; label: string; icon: string }[] = [
    { id: 'builder', label: 'Builder', icon: '🔧' },
    { id: 'browser', label: 'Model Browser', icon: '📂' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 42,
        background: TAB_BAR_COLORS.bg,
        borderBottom: `1px solid ${TAB_BAR_COLORS.border}`,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* App logo / name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          borderRight: `1px solid ${TAB_BAR_COLORS.border}`,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#6666aa',
          flexShrink: 0,
        }}
      >
        K'NEX<span style={{ color: TAB_BAR_COLORS.accent }}>Forge</span>
      </div>

      {/* Tabs */}
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 20px',
              background: isActive ? TAB_BAR_COLORS.tabActive : 'transparent',
              border: 'none',
              borderRight: `1px solid ${TAB_BAR_COLORS.border}`,
              borderBottom: isActive ? `2px solid ${TAB_BAR_COLORS.accent}` : '2px solid transparent',
              color: isActive ? TAB_BAR_COLORS.textActive : TAB_BAR_COLORS.textInactive,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = TAB_BAR_COLORS.tabHover
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        )
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Live stability indicator (always visible) */}
      <StabilityIndicator />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stability indicator shown in the tab bar
// ---------------------------------------------------------------------------

function StabilityIndicator() {
  const score = useBuildStore((s) => s.stabilityScore)
  const partCount = useBuildStore((s) => s.partCount)

  if (partCount() === 0) return null

  const color = score >= 70 ? '#44cc88' : score >= 40 ? '#ffaa33' : '#ff6655'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 18px',
        borderLeft: `1px solid ${TAB_BAR_COLORS.border}`,
        fontSize: 12,
        color: '#888',
      }}
    >
      <span>Stability</span>
      <span style={{ fontWeight: 700, color, fontFamily: 'monospace' }}>{score.toFixed(0)}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  useKeyboardShortcuts()
  const [activeTab, setActiveTab] = useState<AppTab>('builder')

  // Listen for the "open-builder" event fired by the ModelBrowser's "Open in Builder" button
  useEffect(() => {
    const handler = () => setActiveTab('builder')
    window.addEventListener('knexforge:open-builder', handler)
    return () => window.removeEventListener('knexforge:open-builder', handler)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      {/* Top tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content — use CSS visibility so both tabs stay mounted (preserves 3D state) */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Builder tab */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            visibility: activeTab === 'builder' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'builder' ? 'auto' : 'none',
          }}
        >
          <PartPalette />
          <div style={{ flex: 1, position: 'relative' }}>
            <KnexViewer loadDemoWhenEmpty={true} />
          </div>
        </div>

        {/* Model Browser tab */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            visibility: activeTab === 'browser' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'browser' ? 'auto' : 'none',
          }}
        >
          <ModelBrowser />
        </div>
      </div>
    </div>
  )
}
