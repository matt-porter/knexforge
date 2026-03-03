import { useRef, useEffect } from 'react'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'

const COLORS = {
  bg: '#1a1a3e',
  border: '#2a2a4a',
  text: '#ddd',
  hover: '#2a2a5e',
  accent: '#4488ff',
  danger: '#ff6655',
}

export function ContextMenu() {
  const { contextMenu, closeContextMenu } = useInteractionStore()
  const { parts, removePart, togglePinPart, updatePartColor } = useBuildStore()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    if (contextMenu) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu, closeContextMenu])

  if (!contextMenu) return null

  const part = parts[contextMenu.partId]
  if (!part) return null

  const handleAction = (action: () => void) => {
    action()
    closeContextMenu()
  }

  const isPinned = part.is_pinned

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: contextMenu.y,
        left: contextMenu.x,
        zIndex: 2000,
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '6px 0',
        minWidth: 160,
        boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={{ padding: '6px 14px', fontSize: 11, color: '#666', borderBottom: `1px solid ${COLORS.border}`, marginBottom: 4 }}>
        Part: {part.instance_id.split('-')[0]}
      </div>

      <MenuButton onClick={() => handleAction(() => togglePinPart(part.instance_id))}>
        {isPinned ? '📍 Unpin from World' : '📌 Pin to World'}
      </MenuButton>

      <MenuButton onClick={() => handleAction(() => {
        const colors = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
        const nextColor = colors[(colors.indexOf(part.color ?? '#ffffff') + 1) % colors.length]
        updatePartColor(part.instance_id, nextColor)
      })}>
        🎨 Cycle Color
      </MenuButton>

      <MenuButton
        onClick={() => handleAction(() => removePart(part.instance_id))}
        style={{ color: COLORS.danger }}
      >
        🗑️ Delete Part
      </MenuButton>
    </div>
  )
}

function MenuButton({ children, onClick, style }: { children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '8px 14px',
        color: COLORS.text,
        fontSize: 13,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'background 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
