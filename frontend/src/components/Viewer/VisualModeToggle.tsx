import { useVisualStore, type VisualMode } from '../../stores/visualStore'

const MODES: { value: VisualMode; label: string; icon: string }[] = [
    { value: 'realistic', label: 'Realistic', icon: '🎨' },
    { value: 'instruction', label: 'Instruction', icon: '📝' },
    { value: 'exploded', label: 'Exploded', icon: '💥' },
    { value: 'x-ray', label: 'X-Ray', icon: '🦴' },
    { value: 'stress', label: 'Stress', icon: '🔥' },
]

export function VisualModeToggle() {
    const { mode, setMode, explosionFactor, setExplosionFactor } = useVisualStore()

    return (
        <div
            style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'rgba(20, 25, 40, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #3a4a6a',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#e0e0e0',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minWidth: 200,
            }}
        >
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: 4, color: '#fff' }}>
                Visual Mode
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MODES.map((m) => (
                    <label
                        key={m.value}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: '13px',
                            padding: '6px 8px',
                            borderRadius: 4,
                            background: mode === m.value ? 'rgba(80, 100, 200, 0.3)' : 'transparent',
                            border: `1px solid ${mode === m.value ? '#5a7af0' : 'transparent'}`,
                            transition: 'all 0.2s',
                        }}
                    >
                        <input
                            type="radio"
                            name="visualMode"
                            value={m.value}
                            checked={mode === m.value}
                            onChange={() => setMode(m.value)}
                            style={{ margin: 0, cursor: 'pointer' }}
                        />
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                    </label>
                ))}
            </div>

            {mode === 'exploded' && (
                <div style={{ marginTop: 8, borderTop: '1px solid #3a4a6a', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 8 }}>
                        <span>Explosion</span>
                        <span>{Math.round(explosionFactor * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={explosionFactor}
                        onChange={(e) => setExplosionFactor(parseFloat(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>
            )}
        </div>
    )
}
