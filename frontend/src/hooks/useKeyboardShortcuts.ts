/**
 * Global keyboard shortcut handler for the K'NexForge builder.
 *
 * Shortcuts:
 * - Ctrl+Z: Undo
 * - Ctrl+Y / Ctrl+Shift+Z: Redo
 * - Delete / Backspace: Remove selected part
 * - Escape: Cancel placement
 * - R: Rotate ghost preview 90°
 * - X: Cycle rod-side snap variant in targeted mode
 * - P: Toggle parts panel
 * - T: Toggle text editor panel
 */

import { useEffect } from 'react'
import { useBuildStore } from '../stores/buildStore'
import { useInteractionStore } from '../stores/interactionStore'
import { isSlidablePort } from '../helpers/snapHelper'

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

      // X: cycle rod-side variant in targeted/snapped mode
      if (e.key === 'x' || e.key === 'X') {
        const { mode, isSnapped, matchTargetId } = useInteractionStore.getState()
        if (mode === 'place' && (matchTargetId || isSnapped)) {
          e.preventDefault()
          useInteractionStore.getState().cycleSide()
          return
        }
      }

      // Slide offset controls (Arrow Left/Right, Home)
      const { mode, isSnapped, snapPlacingPortId, snapTargetPortId, isSlideEditing, slideEditConnectionIndex } = useInteractionStore.getState()
      
      // Handle slide editing mode confirmation/cancellation
      if (isSlideEditing) {
        if (e.key === 'Enter') {
            e.preventDefault()
            const snapshot = useInteractionStore.getState().slideEditInitialSnapshot
            if (snapshot) {
                useBuildStore.getState().commitSlideEdit(snapshot)
            }
            useInteractionStore.getState().stopSlideEditing()
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            const snapshot = useInteractionStore.getState().slideEditInitialSnapshot
            if (snapshot) {
                useBuildStore.getState().revertSlideEdit(snapshot)
            }
            useInteractionStore.getState().stopSlideEditing()
            return
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            const step = e.shiftKey ? 1 : 5
            const delta = e.key === 'ArrowRight' ? step : -step
            useInteractionStore.getState().adjustSlideOffset(delta)
            
            // Push update to store immediately
            if (slideEditConnectionIndex !== null) {
                // We need part defs for computeGhostTransform, assuming useBuildStore logic handles it
                // Actually buildStore needs partDefs. We can trigger a custom event or let the wheel handler do it.
                // It's better to fire an event so BuildScene can process it with its `defs` prop.
                window.dispatchEvent(new CustomEvent('knexforge:apply-slide-edit'))
            }
            return
        }
      }

      if (mode === 'place' && isSnapped) {
        if (isSlidablePort(snapPlacingPortId ?? '') || isSlidablePort(snapTargetPortId ?? '')) {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            const step = e.shiftKey ? 1 : 5
            useInteractionStore.getState().adjustSlideOffset(step)
            return
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            const step = e.shiftKey ? 1 : 5
            useInteractionStore.getState().adjustSlideOffset(-step)
            return
          }
          if (e.key === 'Home') {
            e.preventDefault()
            useInteractionStore.getState().resetSlideOffset()
            return
          }
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
        'a': 'connector-2way-grey-v1',
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
