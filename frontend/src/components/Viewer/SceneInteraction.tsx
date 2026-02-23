import { useCallback, useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Plane, Vector3, Raycaster, Vector2 } from 'three'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'
import { findNearestSnap } from '../../helpers/snapHelper'
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
    const { mode, placingPartId } = useInteractionStore.getState()
    if (mode !== 'place' || !placingPartId) return

    raycaster.current.setFromCamera(mouse.current, camera)

    if (raycaster.current.ray.intersectPlane(GROUND_PLANE, intersection.current)) {
      const gridPos = snapToGrid(intersection.current)
      const parts = useBuildStore.getState().parts

      // Try port snapping
      const placingDef = defs.get(placingPartId)
      if (placingDef) {
        const snapResult = findNearestSnap(gridPos, placingDef, parts, defs)

        if (snapResult.candidate && snapResult.ghostPosition && snapResult.ghostRotation) {
          useInteractionStore.getState().setGhostPosition(snapResult.ghostPosition)
          useInteractionStore.getState().setGhostRotation(snapResult.ghostRotation)
          useInteractionStore.getState().setSnapTarget(
            snapResult.candidate.instanceId,
            snapResult.candidate.portId,
          )
          return
        }
      }

      // No snap — just grid position
      useInteractionStore.getState().setGhostPosition(gridPos)
      useInteractionStore.getState().setSnapTarget(null, null)
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
    const { mode, placingPartId } = useInteractionStore.getState()

    if (mode === 'place' && placingPartId) {
      const { ghostPosition, ghostRotation, snapTargetInstanceId, snapTargetPortId } =
        useInteractionStore.getState()
      const parts = useBuildStore.getState().parts

      if (!ghostPosition) return

      const instanceId = generateInstanceId(placingPartId)

      useBuildStore.getState().addPart({
        instance_id: instanceId,
        part_id: placingPartId,
        position: ghostPosition,
        rotation: ghostRotation,
      })

      // If snapped, also create the connection
      if (snapTargetInstanceId && snapTargetPortId) {
        const placingDef = defs.get(placingPartId)
        const targetPart = parts[snapTargetInstanceId]
        if (placingDef && targetPart) {
          const targetDef = defs.get(targetPart.part_id)
          if (targetDef) {
            const targetPort = targetDef.ports.find((p) => p.id === snapTargetPortId)
            if (targetPort) {
              const placingPort = placingDef.ports.find(
                (p) =>
                  targetPort.accepts.includes(p.mate_type) ||
                  p.accepts.includes(targetPort.mate_type),
              )
              if (placingPort) {
                useBuildStore.getState().addConnection({
                  from_instance: instanceId,
                  from_port: placingPort.id,
                  to_instance: snapTargetInstanceId,
                  to_port: snapTargetPortId,
                })
              }
            }
          }
        }
      }
      // Stay in place mode — allow placing more of the same part
    }
  }, [defs])

  // Right-click cancels placement
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const { mode } = useInteractionStore.getState()
    if (mode === 'place') {
      e.preventDefault()
      useInteractionStore.getState().cancelPlacing()
    }
  }, [])

  // Bind events to the canvas element
  useEffect(() => {
    const el = gl.domElement
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('click', handleClick)
    el.addEventListener('contextmenu', handleContextMenu)
    return () => {
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [gl, handlePointerMove, handleClick, handleContextMenu])

  return null
}
