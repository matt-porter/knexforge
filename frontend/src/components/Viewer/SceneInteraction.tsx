import { useCallback, useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Plane, Vector3, Raycaster, Vector2 } from 'three'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'
import { findNearestSnap, inferJointType, isSlidablePort, getSlideRange } from '../../helpers/snapHelper'
import type { KnexPartDef } from '../../types/parts'

interface SceneInteractionProps {
  defs: Map<string, KnexPartDef>
}

/** Ground plane for raycasting cursor position. */
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0)

/** Grid snap size in mm. */
const GRID_SNAP = 10

/** Snap cursor position to grid. */
function snapToGrid(pos: Vector3): [number, number, number] {
  return [
    Math.round(pos.x / GRID_SNAP) * GRID_SNAP,
    Math.max(0, Math.round(pos.y / GRID_SNAP) * GRID_SNAP),
    Math.round(pos.z / GRID_SNAP) * GRID_SNAP,
  ]
}

let instanceCounter = 0

/** Generate a unique instance ID. */
function generateInstanceId(partId: string): string {
  instanceCounter++
  return `${partId}-${instanceCounter}-${Date.now().toString(36)}`
}

/**
 * Invisible component that handles all scene interactions:
 * - Mouse move → update ghost position (in place mode)
 * - Click → place part or select existing part
 * - Right-click → cancel placement
 */
export function SceneInteraction({ defs }: SceneInteractionProps) {
  const { camera, gl } = useThree()
  const raycaster = useRef(new Raycaster())
  const mouse = useRef(new Vector2())
  const intersection = useRef(new Vector3())

  // Raycast to ground plane on every frame (in place mode)
  useFrame(() => {
    const { mode, placingPartId, matchTargetId } = useInteractionStore.getState()

    if (mode !== 'place' || !placingPartId) return
    
    // In targeted mode, PortIndicators calculates the exact snapped position on hover.
    // We yield control to it if we are currently snapped to a port.
    if (matchTargetId && useInteractionStore.getState().isSnapped) return

    if (useInteractionStore.getState().isSlideEditing) return

    raycaster.current.setFromCamera(mouse.current, camera)

    if (raycaster.current.ray.intersectPlane(GROUND_PLANE, intersection.current)) {
      const gridPos = snapToGrid(intersection.current)
      const parts = useBuildStore.getState().parts

      // Try port snapping
      const placingDef = defs.get(placingPartId)
      const currentSlideOffset = useInteractionStore.getState().slideOffset

      if (placingDef) {
        const snapResult = findNearestSnap(gridPos, placingDef, parts, defs, 0, 30, currentSlideOffset)

        if (snapResult.candidate && snapResult.ghostPosition && snapResult.ghostRotation) {
          useInteractionStore.getState().setGhostPosition(snapResult.ghostPosition)
          useInteractionStore.getState().setGhostRotation(snapResult.ghostRotation)
          useInteractionStore.getState().setSnapTarget(
            snapResult.candidate.instanceId,
            snapResult.candidate.portId,
            snapResult.candidate.placingPortId,
          )

          // Determine and set slide range for the active snap
          const targetDef = defs.get(parts[snapResult.candidate.instanceId]?.part_id ?? '')
          let range: [number, number] | null = null
          if (isSlidablePort(snapResult.candidate.placingPortId)) {
             range = getSlideRange(placingDef, snapResult.candidate.placingPortId)
          } else if (targetDef && isSlidablePort(snapResult.candidate.portId)) {
             range = getSlideRange(targetDef, snapResult.candidate.portId)
          }
          useInteractionStore.getState().setSlideRange(range)

          return
        }
      }

      // No snap — just grid position
      useInteractionStore.getState().setGhostPosition(gridPos)
      useInteractionStore.getState().setSnapTarget(null, null, null)
      useInteractionStore.getState().setSlideRange(null)
    }
  })

  // Track mouse position
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    },
    [gl],
  )

  // Handle clicks — place part or select
  const handleClick = useCallback(() => {
    const { mode, placingPartId, matchTargetId } = useInteractionStore.getState()

    // PortIndicators component handles its own clicks for targeted mode
    if (matchTargetId) return

    if (mode === 'place' && placingPartId) {
      const {
        ghostPosition,
        ghostRotation,
        snapTargetInstanceId,
        snapTargetPortId,
        snapPlacingPortId,
        slideOffset,
      } = useInteractionStore.getState()

      if (!ghostPosition) return

      const instanceId = generateInstanceId(placingPartId)

      useBuildStore.getState().addPart({
        instance_id: instanceId,
        part_id: placingPartId,
        position: ghostPosition,
        rotation: ghostRotation,
      })

      // If snapped, create the connection using the exact port pair
      // that the snap helper computed
      if (snapTargetInstanceId && snapTargetPortId && snapPlacingPortId) {
        const placingDef = defs.get(placingPartId)
        const targetInstance = useBuildStore.getState().parts[snapTargetInstanceId]
        const targetDef = targetInstance ? defs.get(targetInstance.part_id) : undefined
        const placingPort = placingDef?.ports.find((p) => p.id === snapPlacingPortId)
        const targetPort = targetDef?.ports.find((p) => p.id === snapTargetPortId)

        useBuildStore.getState().addConnection({
          from_instance: instanceId,
          from_port: snapPlacingPortId,
          to_instance: snapTargetInstanceId,
          to_port: snapTargetPortId,
          joint_type: placingPort && targetPort ? inferJointType(placingPort, targetPort) : 'fixed',
          slide_offset: slideOffset,
        })
      }
      // Stay in place mode — allow placing more of the same part
    }
  }, [])

  // Right-click cancels placement
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const { mode } = useInteractionStore.getState()
    if (mode === 'place') {
      e.preventDefault()
      useInteractionStore.getState().cancelPlacing()
    }
  }, [])

  // Wheel adjusts slide offset
  const handleWheel = useCallback((e: WheelEvent) => {
    const { mode, isSnapped, snapPlacingPortId, snapTargetPortId, isSlideEditing, slideEditConnectionIndex } = useInteractionStore.getState()
    if (mode === 'place' && isSnapped) {
      if (isSlidablePort(snapPlacingPortId ?? '') || isSlidablePort(snapTargetPortId ?? '')) {
        const step = e.shiftKey ? 1 : 5
        const delta = e.deltaY > 0 ? -step : step
        useInteractionStore.getState().adjustSlideOffset(delta)
        e.preventDefault()
        e.stopPropagation()
      }
    } else if (isSlideEditing && slideEditConnectionIndex !== null) {
        const step = e.shiftKey ? 1 : 5
        const delta = e.deltaY > 0 ? -step : step
        useInteractionStore.getState().adjustSlideOffset(delta)
        
        // Immediately push the new offset to the connection
        const newOffset = useInteractionStore.getState().slideOffset
        useBuildStore.getState().updateSlideOffset(slideEditConnectionIndex, newOffset, defs)
        
        e.preventDefault()
        e.stopPropagation()
    }
  }, [defs])

  // Bind events to the canvas element
  useEffect(() => {
    const el = gl.domElement
    const handleSlideRejected = (e: Event) => {
      const detail = (e as CustomEvent).detail
      useInteractionStore.getState().setSlideOffset(detail.validOffset)
    }
    window.addEventListener('knexforge:slide-edit-rejected', handleSlideRejected)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('click', handleClick)
    el.addEventListener('contextmenu', handleContextMenu)
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('knexforge:slide-edit-rejected', handleSlideRejected)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('contextmenu', handleContextMenu)
      el.removeEventListener('wheel', handleWheel)
    }
  }, [gl, handlePointerMove, handleClick, handleContextMenu, handleWheel])

  return null
}
