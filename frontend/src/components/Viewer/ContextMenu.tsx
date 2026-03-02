import { useEffect } from 'react'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'

export function ContextMenu() {
  const contextMenu = useInteractionStore((s) => s.contextMenu)
  const closeContextMenu = useInteractionStore((s) => s.closeContextMenu)

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => closeContextMenu()
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [contextMenu, closeContextMenu])

  if (!contextMenu) return null

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const { parts } = useBuildStore.getState()
    const part = parts[contextMenu.partId]
    if (part) {
      useBuildStore.getState().selectPart(contextMenu.partId)
      useInteractionStore.getState().startPlacing(part.part_id, contextMenu.partId)
    }
    closeContextMenu()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    useBuildStore.getState().removePart(contextMenu.partId)
    closeContextMenu()
  }

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation()
    useBuildStore.getState().selectPart(contextMenu.partId)
    window.dispatchEvent(new CustomEvent('knexforge:focus-camera'))
    closeContextMenu()
  }

  const handleChangeColor = (e: React.MouseEvent) => {
    e.stopPropagation()
    // For now we'll just open a simple prompt or cycle to a random color, or set a specific color.
    // Ideally we'd have a color picker, but let's prompt the user or cycle.
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000', '#888888', '#ffa500']
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    
    useBuildStore.getState().updatePartColor(contextMenu.partId, randomColor)
    closeContextMenu()
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: contextMenu.y,
        left: contextMenu.x,
        background: '#1a1a2e',
        border: '1px solid #4488ff',
        borderRadius: '6px',
        padding: '4px 0',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        minWidth: '150px',
      }}
      onContextMenu={(e) => {
        e.preventDefault() // prevent native menu on the custom menu itself
      }}
    >
      <ContextMenuItem label="Duplicate" shortcut="Ctrl+D" onClick={handleDuplicate} />
      <ContextMenuItem label="Delete" shortcut="Del" onClick={handleDelete} />
      <ContextMenuItem label="Focus Camera" shortcut="F" onClick={handleFocus} />
      <ContextMenuItem label="Random Color" shortcut="" onClick={handleChangeColor} />
    </div>
  )
}

function ContextMenuItem({
  label,
  shortcut,
  onClick,
}: {
  label: string
  shortcut: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 16px',
        color: '#ccc',
        fontSize: '13px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#2a2a4a'
        e.currentTarget.style.color = '#fff'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = '#ccc'
      }}
    >
      <span>{label}</span>
      {shortcut && <span style={{ color: '#888', fontSize: '11px' }}>{shortcut}</span>}
    </div>
  )
}
