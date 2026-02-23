/**
 * Global keyboard shortcut handler for the K'NexForge builder.
 *
 * Shortcuts:
 * - Ctrl+Z: Undo
 * - Ctrl+Y / Ctrl+Shift+Z: Redo
 * - Delete / Backspace: Remove selected part
 * - Escape: Cancel placement
 * - R: Rotate ghost preview 90°
 */

import { useEffect } from 'react'
import { useBuildStore } from '../stores/buildStore'
import { useInteractionStore } from '../stores/interactionStore'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

      // Undo: Ctrl+Z
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useBuildStore.getState().undo()
        return
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((ctrl && e.key === 'y') || (ctrl && e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        useBuildStore.getState().redo()
        return
      }

      // Delete selected part
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedPartId } = useBuildStore.getState()
        if (selectedPartId) {
          e.preventDefault()
          useBuildStore.getState().removePart(selectedPartId)
        }
        return
      }

      // Escape: cancel placement or deselect
      if (e.key === 'Escape') {
        const { mode } = useInteractionStore.getState()
        if (mode === 'place') {
          useInteractionStore.getState().cancelPlacing()
        } else {
          useBuildStore.getState().selectPart(null)
        }
        return
      }

      // R: rotate ghost preview
      if (e.key === 'r' || e.key === 'R') {
        const { mode } = useInteractionStore.getState()
        if (mode === 'place') {
          e.preventDefault()
          useInteractionStore.getState().rotateGhost()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
