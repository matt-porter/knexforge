const PARTS = [
  { category: 'Rods', items: [
    { name: 'Green Rod (17mm)', color: '#00CC00' },
    { name: 'White Rod (33mm)', color: '#FFFFFF' },
    { name: 'Blue Rod (55mm)', color: '#0066FF' },
    { name: 'Yellow Rod (86mm)', color: '#FFCC00' },
    { name: 'Red Rod (130mm)', color: '#FF0000' },
    { name: 'Grey Rod (192mm)', color: '#999999' },
  ]},
  { category: 'Connectors', items: [
    { name: '2-Way (Orange)', color: '#FF8800' },
    { name: '3-Way (Yellow)', color: '#FFCC00' },
    { name: '4-Way 3D (Silver)', color: '#C0C0C0' },
    { name: '5-Way (Yellow)', color: '#FFCC00' },
    { name: '8-Way (White)', color: '#FFFFFF' },
  ]},
  { category: 'Wheels', items: [
    { name: 'Medium Wheel', color: '#333333' },
  ]},
]

export function PartPalette() {
  return (
    <div style={{
      width: 240,
      height: '100%',
      background: '#0f0f23',
      borderRight: '1px solid #2a2a4a',
      overflowY: 'auto',
      padding: '12px 0',
    }}>
      <h2 style={{
        fontSize: 14,
        fontWeight: 600,
        color: '#8888cc',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '0 16px 12px',
        borderBottom: '1px solid #2a2a4a',
      }}>
        Parts
      </h2>
      {PARTS.map((group) => (
        <div key={group.category} style={{ padding: '12px 0' }}>
          <h3 style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#6666aa',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0 16px 8px',
          }}>
            {group.category}
          </h3>
          {group.items.map((item) => (
            <button
              key={item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                color: '#ccc',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a3e' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: item.color,
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.15)',
              }} />
              {item.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
