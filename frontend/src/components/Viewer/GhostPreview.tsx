import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Quaternion, Euler, Color, type Mesh, type MeshStandardMaterial } from 'three'
import type { KnexPartDef } from '../../types/parts'
import { getGlbUrl } from '../../hooks/usePartLibrary'
import { useInteractionStore } from '../../stores/interactionStore'

interface GhostPreviewProps {
  def: KnexPartDef
}

/**
 * Semi-transparent ghost preview of a part being placed.
 * Follows the cursor position from the interaction store.
 * Shows green when snapped to a valid port, blue otherwise.
 */
export function GhostPreview({ def }: GhostPreviewProps) {
  const ghostPosition = useInteractionStore((s) => s.ghostPosition)
  const ghostRotation = useInteractionStore((s) => s.ghostRotation)
  const isSnapped = useInteractionStore((s) => s.isSnapped)

  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)

  const ghostColor = isSnapped ? '#44ff88' : '#4488ff'

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    const color = new Color(ghostColor)

    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        const mat = (mesh.material as MeshStandardMaterial).clone()
        mat.color = color
        mat.transparent = true
        mat.opacity = 0.5
        mat.depthWrite = false
        mat.roughness = 0.3
        mat.metalness = 0.0
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })

    return clone
  }, [scene, ghostColor])

  const euler = useMemo(() => {
    const q = new Quaternion(ghostRotation[0], ghostRotation[1], ghostRotation[2], ghostRotation[3])
    return new Euler().setFromQuaternion(q)
  }, [ghostRotation])

  if (!ghostPosition) return null

  return (
    <group position={ghostPosition} rotation={euler}>
      <primitive object={clonedScene} />
    </group>
  )
}
