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

      // Tab: cycle ports in snap mode
      if (e.key === 'Tab') {
        const { mode } = useInteractionStore.getState()
        if (mode === 'place') {
          e.preventDefault()
          useInteractionStore.getState().cyclePort()
          return
        }
      }

      // R: cycle rotation angle in targeted/snapped mode, otherwise rotate ghost
      if (e.key === 'r' || e.key === 'R') {
        const { mode, isSnapped, matchTargetId } = useInteractionStore.getState()
        if (mode === 'place') {
          e.preventDefault()
          if (matchTargetId || isSnapped) {
            // In targeted mode, always cycle angle even if cursor drifted off indicator
            useInteractionStore.getState().cycleAngle()
          } else {
            useInteractionStore.getState().rotateGhost()
          }
          return
        }
      }

      // Quick part selection
      const partShortcuts: Record<string, string> = {
        '1': 'rod-16-green-v1',
        '2': 'rod-32-white-v1',
        '3': 'rod-54-blue-v1',
        '4': 'rod-86-yellow-v1',
        '5': 'rod-128-red-v1',
        '6': 'rod-190-grey-v1',
        'q': 'connector-1way-grey-v1',
        'w': 'connector-2way-orange-v1',
        'e': 'connector-3way-red-v1',
        't': 'connector-4way-green-v1',
        'y': 'connector-5way-yellow-v1',
        'u': 'connector-8way-white-v1',
        'i': 'connector-4way-3d-purple-v1',
        'o': 'connector-7way-blue-v1',
      }

      if (e.key in partShortcuts) {
        e.preventDefault()
        const partId = partShortcuts[e.key]
        const { selectedPartId } = useBuildStore.getState()
        if (selectedPartId) {
          useInteractionStore.getState().startPlacing(partId, selectedPartId)
        } else {
          useInteractionStore.getState().startPlacing(partId)
        }
        return
      }

      // Quick Duplication: Ctrl+D
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        const { selectedPartId, parts } = useBuildStore.getState()
        if (selectedPartId && parts[selectedPartId]) {
          const partId = parts[selectedPartId].part_id
          useInteractionStore.getState().startPlacing(partId, selectedPartId)
        }
        return
      }

      // Focus camera on selected part: F
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('knexforge:focus-camera'))
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
