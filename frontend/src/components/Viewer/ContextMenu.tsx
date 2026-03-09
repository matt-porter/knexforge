import { useRef, useEffect } from 'react'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'
import { isSlidablePort } from '../../helpers/snapHelper'

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

  // Check for slidable connection
  let slidableConnIndex = -1
  let slidableRodId = ''
  let slidablePortId = ''
  
  // Find a connection where this part is connected to a slidable port on a rod
  const { connections } = useBuildStore.getState()
  for (let i = 0; i < connections.length; i++) {
    const c = connections[i]
    if (c.from_instance === part.instance_id && isSlidablePort(c.to_port)) {
        slidableConnIndex = i
        slidableRodId = c.to_instance
        slidablePortId = c.to_port
        break
    }
    if (c.to_instance === part.instance_id && isSlidablePort(c.from_port)) {
        slidableConnIndex = i
        slidableRodId = c.from_instance
        slidablePortId = c.from_port
        break
    }
  }

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

      {slidableConnIndex !== -1 && (
        <MenuButton onClick={() => handleAction(() => {
            const rodInst = parts[slidableRodId]
            if (!rodInst) return
            
            // We need part definitions to get slide range
            // We could just pass defs down, or fire an event. For simplicity, we can fetch defs from the global scope or store.
            // Actually ContextMenu doesn't have defs. Let's just dispatch an event and let BuildScene handle it,
            // OR fetch defs from the datasetStore / rely on the caller setting it.
            // Since we don't have defs directly, we can use a custom event or a store callback.
            window.dispatchEvent(new CustomEvent('knexforge:start-slide-edit', { 
                detail: { 
                    instanceId: part.instance_id, 
                    connIndex: slidableConnIndex,
                    rodId: slidableRodId,
                    portId: slidablePortId,
                    initialOffset: connections[slidableConnIndex].slide_offset ?? 0
                } 
            }))
        })}>
          ↔️ Slide Along Rod
        </MenuButton>
      )}

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
