import { useMemo, useCallback, useRef, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Color, Vector3, type Mesh, type MeshStandardMaterial, type Group } from 'three'
import type { KnexPartDef, PartInstance } from '../../types/parts'
import { getGlbUrl } from '../../hooks/usePartLibrary'
import { getMeshCorrection } from '../../helpers/meshCorrection'
import { useBuildStore } from '../../stores/buildStore'
import { useInteractionStore } from '../../stores/interactionStore'
import { useVisualStore } from '../../stores/visualStore'
import { simulationTransforms } from '../../services/simulationManager'
import { Outlines } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'

interface PartMeshProps {
  instance: PartInstance
  def: KnexPartDef
  selected?: boolean
  opacity?: number
}

/**
 * Renders a single K'Nex part instance by loading its GLB mesh.
 * Applies the instance's position, rotation (quaternion), and color override.
 * Also applies mesh correction transform to align GLB geometry with port data.
 * Supports click-to-select and hover highlighting.
 */
export function PartMesh({ instance, def, selected = false, opacity = 1 }: PartMeshProps) {
  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)
  const hoveredPartId = useInteractionStore((s) => s.hoveredPartId)
  const isHovered = hoveredPartId === instance.instance_id
  const { mode: visualMode, explosionFactor } = useVisualStore()

  // Mesh correction for GLB→port alignment (rods: Z-axis→X-axis)
  const correction = useMemo(() => getMeshCorrection(def), [def])

  // Clone the scene so each instance has its own material
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    const color = new Color(instance.color ?? def.default_color)

    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        // Clone material to avoid sharing between instances
        const mat = (mesh.material as MeshStandardMaterial).clone()

        if (visualMode === 'stress') {
          // Fake stress map: Use part ID hash to generate a false stress color (Blue -> Red)
          const hash = instance.instance_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          const stress = (hash % 100) / 100 // 0 to 1
          mat.color = new Color().lerpColors(new Color('#0044ff'), new Color('#ff0000'), stress)
        } else {
          mat.color = color
        }

        if (visualMode === 'instruction') {
          mat.roughness = 1.0
          mat.metalness = 0.0
        } else {
          mat.roughness = 0.35
          mat.metalness = 0.05
        }

        const isXRay = visualMode === 'x-ray'

        if (opacity < 1 || isXRay) {
          mat.transparent = true
          mat.opacity = isXRay ? 0.35 : opacity
          mat.depthWrite = !isXRay
        }

        if (selected) {
          mat.emissive = new Color('#4488ff')
          mat.emissiveIntensity = 0.3
        } else if (isHovered) {
          mat.emissive = new Color('#ffffff')
          mat.emissiveIntensity = 0.15
        }
        mesh.material = mat
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    return clone
  }, [scene, instance.color, def.default_color, selected, isHovered, opacity, visualMode, instance.instance_id])

  // Convert quaternion [x, y, z, w] to THREE.Quaternion
  const initialQuat = useMemo(() => {
    return new Quaternion(
      instance.rotation[0],
      instance.rotation[1],
      instance.rotation[2],
      instance.rotation[3],
    )
  }, [instance.rotation])

  // Exploded View math
  const explodedPosition = useMemo(() => {
    if (visualMode !== 'exploded' || explosionFactor === 0) return instance.position

    const explodeScale = 150 * explosionFactor

    // Push outwards from origin (0,0,0) radially based on current position
    const vec = new Vector3(...instance.position)

    // If exactly at origin, it won't move. Otherwise normalize and push.
    if (vec.lengthSq() > 0.01) {
      const dir = vec.clone().normalize()
      return [
        instance.position[0] + dir.x * explodeScale,
        instance.position[1] + dir.y * explodeScale,
        instance.position[2] + dir.z * explodeScale,
      ] as [number, number, number]
    }

    return instance.position
  }, [instance.position, visualMode, explosionFactor])

  // Click to select (only in select mode)
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const { mode } = useInteractionStore.getState()
      if (mode !== 'select') return
      e.stopPropagation()

      useBuildStore.getState().selectPart(instance.instance_id)

      if (e.altKey) {
        useInteractionStore.getState().startPlacing(instance.part_id, instance.instance_id)
      }
    },
    [instance.instance_id, instance.part_id],
  )

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const { mode } = useInteractionStore.getState()
      if (mode !== 'select') return
      e.stopPropagation()
      
      useBuildStore.getState().selectPart(instance.instance_id)
      
      // Extract screen coordinates from the event
      // e.nativeEvent contains the actual DOM MouseEvent with clientX/Y
      const nativeEvent = e.nativeEvent as MouseEvent
      useInteractionStore.getState().openContextMenu(nativeEvent.clientX, nativeEvent.clientY, instance.instance_id)
    },
    [instance.instance_id]
  )

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      useInteractionStore.getState().setHoveredPart(instance.instance_id)
      if (useInteractionStore.getState().mode === 'place') {
        useInteractionStore.getState().setMatchTargetId(instance.instance_id)
      }
    },
    [instance.instance_id],
  )

  const handlePointerOut = useCallback(() => {
    useInteractionStore.getState().setHoveredPart(null)
  }, [])

  const groupRef = useRef<Group>(null)
  const isSimulating = useInteractionStore((s) => s.isSimulating)

  useFrame(() => {
    if (!groupRef.current || !isSimulating) return

    const transform = simulationTransforms.get(instance.instance_id)
    if (transform) {
      groupRef.current.position.set(transform.position[0], transform.position[1], transform.position[2])
      groupRef.current.quaternion.set(transform.quaternion[0], transform.quaternion[1], transform.quaternion[2], transform.quaternion[3])
    }
  })

  // Reset to static position when simulation stops
  useEffect(() => {
    if (!groupRef.current || isSimulating) return

    groupRef.current.position.set(explodedPosition[0], explodedPosition[1], explodedPosition[2])
    groupRef.current.quaternion.copy(initialQuat)
  }, [isSimulating, explodedPosition, initialQuat])

  return (
    <group
      ref={groupRef}
      position={explodedPosition}
      quaternion={initialQuat}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Inner group applies mesh correction (GLB orientation → port data alignment) */}
      <group position={correction.position} rotation={correction.rotation}>
        <primitive object={clonedScene} />
        {(visualMode === 'instruction' || selected) && (
          <Outlines thickness={selected ? 2.5 : 1.5} color={selected ? "#ffaa00" : "black"} />
        )}
      </group>
    </group>
  )
}
