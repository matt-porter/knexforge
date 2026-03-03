import { usePartDefs } from '../hooks/usePartLibrary'
import { useInteractionStore } from '../stores/interactionStore'
import { useBuildStore } from '../stores/buildStore'
import type { KnexPartDef } from '../types/parts'
import { startSimulation, stopSimulation, updateMotorSpeed } from '../services/simulationManager'

/** Group part definitions by category. */
function groupByCategory(
  defs: Map<string, KnexPartDef>,
): { category: string; label: string; parts: KnexPartDef[] }[] {
  const order: { key: string; label: string }[] = [
    { key: 'rod', label: 'Rods' },
    { key: 'connector', label: 'Connectors' },
    { key: 'wheel', label: 'Wheels' },
    { key: 'special', label: 'Special' },
  ]

  return order
    .map(({ key, label }) => ({
      category: key,
      label,
      parts: Array.from(defs.values())
        .filter((d) => d.category === key)
        .sort((a, b) => a.mass_grams - b.mass_grams), // sort by size (mass proxy)
    }))
    .filter((g) => g.parts.length > 0)
}

export function PartPalette({ onHide }: { onHide?: () => void } = {}) {
  const { defs, loading } = usePartDefs()
  const placingPartId = useInteractionStore((s) => s.placingPartId)
  const startPlacing = useInteractionStore((s) => s.startPlacing)
  const cancelPlacing = useInteractionStore((s) => s.cancelPlacing)
  const partCount = useBuildStore((s) => s.partCount)
  const canUndo = useBuildStore((s) => s.canUndo)
  const canRedo = useBuildStore((s) => s.canRedo)
  const undo = useBuildStore((s) => s.undo)
  const redo = useBuildStore((s) => s.redo)
  const clearBuild = useBuildStore((s) => s.clearBuild)
  const selectedPartId = useBuildStore((s) => s.selectedPartId)
  const removePart = useBuildStore((s) => s.removePart)
  const connections = useBuildStore((s) => s.connections)

  const groups = loading ? [] : groupByCategory(defs)

  const handlePartClick = (partId: string) => {
    if (placingPartId === partId) {
      cancelPlacing()
    } else {
      if (selectedPartId) {
        // Targeted placement mode
        startPlacing(partId, selectedPartId)
      } else {
        // Free-roam mode
        startPlacing(partId)
      }
    }
  }

  const handleDelete = () => {
    if (selectedPartId) {
      removePart(selectedPartId)
    }
  }

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        background: '#0f0f23',
        borderRight: '1px solid #2a2a4a',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #2a2a4a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#8888cc',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: 0,
          }}
        >
          Parts
        </h2>
        {onHide ? (
          <button
            onClick={onHide}
            style={{
              border: '1px solid #334155',
              background: '#111827',
              color: '#93c5fd',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
            title="Hide parts panel"
          >
            Hide
          </button>
        ) : null}
      </div>

      {/* Part categories */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && (
          <div style={{ padding: '20px 16px', color: '#666' }}>Loading parts...</div>
        )}
        {groups.map((group) => (
          <div key={group.category} style={{ padding: '8px 0' }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6666aa',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0 16px 6px',
                margin: 0,
              }}
            >
              {group.label}
            </h3>
            {group.parts.map((part) => {
              const isActive = placingPartId === part.id
              return (
                <button
                  key={part.id}
                  onClick={() => handlePartClick(part.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 16px',
                    background: isActive ? '#1a3a5e' : 'transparent',
                    border: isActive ? '1px solid #4488ff' : '1px solid transparent',
                    borderRadius: 4,
                    color: isActive ? '#88bbff' : '#ccc',
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#1a1a3e'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: part.default_color,
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.15)',
                      boxShadow: isActive ? '0 0 6px rgba(68,136,255,0.5)' : 'none',
                    }}
                  />
                  <span style={{ flex: 1 }}>{part.name}</span>
                  {isActive && (
                    <span style={{ fontSize: 10, color: '#4488ff' }}>▸</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div
        style={{
          borderTop: '1px solid #2a2a4a',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Build info */}
        <div
          style={{
            fontSize: 12,
            color: '#888',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{partCount()} parts</span>
          <span>{connections.length} connections</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolButton
            label="↶"
            title="Undo (Ctrl+Z)"
            onClick={() => undo()}
            disabled={!canUndo() || useInteractionStore.getState().isSimulating}
          />
          <ToolButton
            label="↷"
            title="Redo (Ctrl+Y)"
            onClick={() => redo()}
            disabled={!canRedo() || useInteractionStore.getState().isSimulating}
          />
          <ToolButton
            label="🗑"
            title="Delete selected (Del)"
            onClick={handleDelete}
            disabled={!selectedPartId || useInteractionStore.getState().isSimulating}
          />
          <ToolButton
            label="⊘"
            title="Clear all"
            onClick={() => clearBuild()}
            disabled={partCount() === 0 || useInteractionStore.getState().isSimulating}
          />
        </div>

        <SimulationControls />

        {/* Status */}
        {placingPartId && (
          <div
            style={{
              fontSize: 11,
              color: '#4488ff',
              padding: '4px 6px',
              background: '#1a2a4e',
              borderRadius: 3,
              textAlign: 'center',
            }}
          >
            Click to place • Right-click / Esc to cancel
            <br />
            R to rotate
          </div>
        )}
      </div>
    </div>
  )
}

/** Small toolbar button. */
function ToolButton({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '6px 0',
        background: disabled ? '#1a1a2e' : '#1a1a3e',
        border: '1px solid #2a2a4a',
        borderRadius: 4,
        color: disabled ? '#444' : '#ccc',
        fontSize: 16,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

function SimulationControls() {
  const isSimulating = useInteractionStore((s) => s.isSimulating)
  const toggleSimulation = useInteractionStore((s) => s.toggleSimulation)
  const motorSpeed = useInteractionStore((s) => s.motorSpeed)
  const setMotorSpeed = useInteractionStore((s) => s.setMotorSpeed)
  const partCount = useBuildStore((s) => s.partCount)

  const handlePlayToggle = () => {
    if (!isSimulating) {
      // Cancel placing mode before starting simulation
      useInteractionStore.getState().cancelPlacing()
      toggleSimulation()
      void startSimulation(motorSpeed)
    } else {
      stopSimulation()
      toggleSimulation()
    }
  }

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setMotorSpeed(val)
    if (isSimulating) {
      updateMotorSpeed(val)
    }
  }

  return (
    <div
      style={{
        marginTop: 4,
        padding: '10px 12px',
        background: isSimulating ? '#2a1a1a' : '#1a1a2e',
        border: `1px solid ${isSimulating ? '#ffaa00' : '#2a2a4a'}`,
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: isSimulating ? '#ffaa00' : '#888', fontWeight: 600 }}>
          {isSimulating ? 'SIMULATING' : 'PHYSICS SIM'}
        </span>
        <button
          onClick={handlePlayToggle}
          disabled={partCount() === 0}
          style={{
            padding: '4px 12px',
            background: isSimulating ? '#cc3333' : '#33cc33',
            border: 'none',
            borderRadius: 3,
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
            cursor: partCount() === 0 ? 'default' : 'pointer',
            opacity: partCount() === 0 ? 0.5 : 1,
          }}
        >
          {isSimulating ? 'STOP' : 'PLAY'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Motor RPM:</span>
        <input
          type="range"
          min="-50"
          max="50"
          step="1"
          value={motorSpeed}
          onChange={handleSpeedChange}
          style={{ flex: 1, accentColor: '#ffaa00' }}
        />
        <span style={{ fontSize: 11, color: '#ccc', width: 24, textAlign: 'right' }}>
          {motorSpeed}
        </span>
      </div>
    </div>
  )
}
