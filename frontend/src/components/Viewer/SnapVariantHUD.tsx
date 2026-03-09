import { useInteractionStore } from '../../stores/interactionStore'

const HUD_STYLES = {
  container: {
    position: 'absolute' as const,
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(10, 10, 30, 0.92)',
    border: '1px solid #2a2a4a',
    borderRadius: 8,
    padding: '10px 18px',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontFamily: 'inherit',
    fontSize: 13,
    color: '#ccc',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  label: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  value: {
    fontSize: 15,
    fontWeight: 700 as const,
    color: '#aaccff',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  divider: {
    width: 1,
    height: 32,
    background: '#2a2a4a',
  },
  kbd: {
    display: 'inline-block',
    padding: '1px 6px',
    background: '#1a1a3e',
    border: '1px solid #3a3a5a',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600 as const,
    color: '#88aacc',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 11,
    color: '#555',
  },
}

/**
 * Floating HUD overlay showing the current port and rotation selection
 * when the user hovers a port indicator during connector placement.
 * Shows all available ports as dots so the user can see exactly which port is active.
 */
export function SnapVariantHUD() {
  const { mode, placingPartId, matchTargetId, isSnapped, snapVariantInfo, slideOffset, slideRange } = useInteractionStore()

  if (mode !== 'place' || !placingPartId) return null

  // When snapped and hovering a port indicator, show the full port/rotation picker
  if (matchTargetId && isSnapped && snapVariantInfo) {
    const isSlidable = slideRange !== null

    return (
      <div style={HUD_STYLES.container}>
        {/* Port section with dots */}
        <div style={HUD_STYLES.section}>
          <span style={HUD_STYLES.label}>Port</span>
          <span style={HUD_STYLES.value}>
            {snapVariantInfo.portLabel}
          </span>
          {/* Port dots row */}
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {snapVariantInfo.allPortLabels.map((label, i) => (
              <div
                key={label}
                title={label}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: i === snapVariantInfo.portIndex ? '#ff4444' : '#333',
                  border: i === snapVariantInfo.portIndex ? '1px solid #ff8888' : '1px solid #555',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              />
            ))}
          </div>
        </div>

        <div style={HUD_STYLES.divider} />

        {/* Rod side section with dots */}
        <div style={HUD_STYLES.section}>
          <span style={HUD_STYLES.label}>Rod Side</span>
          <span style={HUD_STYLES.value}>{snapVariantInfo.sideLabel}</span>
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {snapVariantInfo.allSideLabels.map((label, i) => (
              <div
                key={label}
                title={label}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: i === snapVariantInfo.sideIndex ? '#9d7bff' : '#333',
                  border: i === snapVariantInfo.sideIndex ? '1px solid #c4b5fd' : '1px solid #555',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              />
            ))}
          </div>
        </div>

        <div style={HUD_STYLES.divider} />

        {/* Rotation section with dots */}
        <div style={HUD_STYLES.section}>
          <span style={HUD_STYLES.label}>Rotation</span>
          <span style={HUD_STYLES.value}>
            {snapVariantInfo.angleDeg}°
          </span>
          {/* Angle dots row */}
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {Array.from({ length: snapVariantInfo.totalAngles }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: i === snapVariantInfo.angleIndex ? '#44aaff' : '#333',
                  border: i === snapVariantInfo.angleIndex ? '1px solid #88ccff' : '1px solid #555',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              />
            ))}
          </div>
        </div>

        {isSlidable && (
          <>
            <div style={HUD_STYLES.divider} />
            <div style={HUD_STYLES.section}>
              <span style={HUD_STYLES.label}>Slide</span>
              <span style={HUD_STYLES.value}>
                {slideOffset > 0 ? '+' : ''}{slideOffset.toFixed(0)} mm
              </span>
            </div>
          </>
        )}

        <div style={HUD_STYLES.divider} />

        {/* Keyboard hints */}
        <div style={{ ...HUD_STYLES.section, gap: 4 }}>
          <span style={HUD_STYLES.hint}>
            <span style={HUD_STYLES.kbd}>Tab</span> port
          </span>
          <span style={HUD_STYLES.hint}>
            <span style={HUD_STYLES.kbd}>X</span> side
          </span>
          <span style={HUD_STYLES.hint}>
            <span style={HUD_STYLES.kbd}>R</span> rotate
          </span>
          {isSlidable && (
            <span style={HUD_STYLES.hint}>
              <span style={HUD_STYLES.kbd}>←→</span> slide
            </span>
          )}
        </div>
      </div>
    )
  }

  // Targeted mode but not hovering a port yet
  if (matchTargetId) {
    return (
      <div style={{
        ...HUD_STYLES.container,
        gap: 8,
      }}>
        Select a <span style={{ color: '#ffff00', fontWeight: 600 }}>yellow port</span> to attach
      </div>
    )
  }

  // Free-roam mode
  return (
    <div style={{
      ...HUD_STYLES.container,
      gap: 8,
    }}>
      Press <span style={HUD_STYLES.kbd}>Esc</span> to cancel placement
    </div>
  )
}
