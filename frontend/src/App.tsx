import { useState, useEffect } from 'react'
import { KnexViewer } from './components/Viewer/KnexViewer'
import { PartPalette } from './components/PartPalette'
import { ModelBrowser } from './components/ModelBrowser/ModelBrowser'
import { MyModels } from './components/MyModels/MyModels'
import { BuildMenu } from './components/BuildMenu'
import { AuthModal } from './components/Auth/AuthModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useBuildStore } from './stores/buildStore'
import { useUserStore } from './stores/userStore'
import { sidecarBridge } from './services/sidecarBridge'
import './App.css'

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type AppTab = 'builder' | 'my-models' | 'browser'

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

function AuthButton() {
  const { user, signOut } = useUserStore()
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderLeft: `1px solid ${TAB_BAR_COLORS.border}` }}>
        <span style={{ fontSize: 12, color: '#aaa' }}>{user.email}</span>
        <button
          onClick={() => signOut()}
          style={{
            background: 'transparent',
            border: `1px solid ${TAB_BAR_COLORS.border}`,
            color: '#888',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: `1px solid ${TAB_BAR_COLORS.border}` }}>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            background: TAB_BAR_COLORS.accent,
            color: '#fff',
            border: 'none',
            padding: '6px 16px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Sign In
        </button>
      </div>
      <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
}) {
  const tabs: { id: AppTab; label: string; icon: string }[] = [
    { id: 'builder', label: 'Builder', icon: '🔧' },
    { id: 'my-models', label: 'My Models', icon: '💾' },
    { id: 'browser', label: 'Example Models', icon: '📂' },
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
      
      {/* Current Model Info */}
      <CurrentModelInfo />

      {/* File Operations */}
      <BuildMenu />

      {/* Auth */}
      <AuthButton />

      {/* Live stability indicator (always visible) */}
      <StabilityIndicator />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Current Model Info & Quick Save
// ---------------------------------------------------------------------------

import { saveLocalModel, createExportData } from './services/localModels'

function CurrentModelInfo() {
  const currentModelId = useBuildStore((s) => s.currentModelId)
  const currentModelTitle = useBuildStore((s) => s.currentModelTitle)
  const parts = useBuildStore((s) => s.parts)
  const connections = useBuildStore((s) => s.connections)
  const setCurrentModelMeta = useBuildStore((s) => s.setCurrentModelMeta)
  const stabilityScore = useBuildStore((s) => s.stabilityScore)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentModelMeta(currentModelId, e.target.value)
  }

  const handleSave = async () => {
    const partsList = Object.values(parts)
    if (partsList.length === 0) return

    setIsSaving(true)
    try {
      const data = createExportData(partsList, connections, currentModelTitle, stabilityScore)
      
      // use custom ID or generate a new one
      const id = currentModelId || `model-${Date.now()}`
      
      saveLocalModel(id, currentModelTitle, data)
      
      if (!currentModelId) {
        setCurrentModelMeta(id, currentModelTitle)
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderLeft: `1px solid ${TAB_BAR_COLORS.border}` }}>
      <input
        type="text"
        value={currentModelTitle}
        onChange={handleTitleChange}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          outline: 'none',
          width: 200
        }}
      />
      <button
        onClick={handleSave}
        disabled={isSaving || Object.keys(parts).length === 0}
        style={{
          padding: '4px 12px',
          background: saveSuccess ? '#44cc88' : '#4488ff',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: isSaving || Object.keys(parts).length === 0 ? 'default' : 'pointer',
          opacity: isSaving || Object.keys(parts).length === 0 ? 0.5 : 1,
          fontWeight: 600,
          fontSize: 12,
          transition: 'background-color 0.2s ease, transform 0.1s ease',
          transform: isSaving ? 'scale(0.95)' : 'scale(1)',
        }}
      >
        {isSaving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Local'}
      </button>
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
  const setSidecarConnected = useBuildStore((s) => s.setSidecarConnected)
  const initializeUser = useUserStore((s) => s.initialize)

  // Auth and sidecar initialization
  useEffect(() => {
    void initializeUser()
    
    const connect = async () => {
      const ok = await sidecarBridge.connect()
      setSidecarConnected(ok)
    }
    void connect()
  }, [setSidecarConnected, initializeUser])

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

        {/* My Models tab */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            visibility: activeTab === 'my-models' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'my-models' ? 'auto' : 'none',
          }}
        >
          <MyModels />
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
