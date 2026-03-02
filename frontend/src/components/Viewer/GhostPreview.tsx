import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Quaternion, Euler, Color, Vector3, type Mesh, type MeshStandardMaterial } from 'three'
import type { KnexPartDef } from '../../types/parts'
import { getGlbUrl } from '../../hooks/usePartLibrary'
import { getMeshCorrection } from '../../helpers/meshCorrection'
import { useInteractionStore } from '../../stores/interactionStore'

interface GhostPreviewProps {
  def: KnexPartDef
}

/**
 * Semi-transparent ghost preview of a part being placed.
 * Follows the cursor position from the interaction store.
 * Shows green when snapped to a valid port, blue otherwise.
 * Shows a glowing marker at the connecting port to clarify which port is in use.
 * Applies mesh correction transform to align GLB with port data.
 */
export function GhostPreview({ def }: GhostPreviewProps) {
  const ghostPosition = useInteractionStore((s) => s.ghostPosition)
  const ghostRotation = useInteractionStore((s) => s.ghostRotation)
  const isSnapped = useInteractionStore((s) => s.isSnapped)
  const snapPlacingPortId = useInteractionStore((s) => s.snapPlacingPortId)

  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)

  const correction = useMemo(() => getMeshCorrection(def), [def])
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
        // Prevent ghost from intercepting raycasts (which would block PortIndicator hover/clicks)
        mesh.raycast = () => null
      }
    })

    return clone
  }, [scene, ghostColor])

  const euler = useMemo(() => {
    const q = new Quaternion(ghostRotation[0], ghostRotation[1], ghostRotation[2], ghostRotation[3])
    return new Euler().setFromQuaternion(q)
  }, [ghostRotation])

  // Find the local position of the active connecting port for the marker
  const activePortPos = useMemo(() => {
    if (!isSnapped || !snapPlacingPortId) return null
    const port = def.ports.find((p) => p.id === snapPlacingPortId)
    if (!port) return null
    return new Vector3(port.position[0], port.position[1], port.position[2])
  }, [isSnapped, snapPlacingPortId, def.ports])

  if (!ghostPosition) return null

  return (
    <group position={ghostPosition} rotation={euler}>
      {/* Inner group applies mesh correction */}
      <group position={correction.position} rotation={correction.rotation}>
        <primitive object={clonedScene} />
      </group>
      {/* Glowing marker at the connecting port */}
      {activePortPos && (
        <mesh position={activePortPos}>
          <sphereGeometry args={[3.5, 12, 12]} />
          <meshBasicMaterial
            color="#ff4444"
            transparent
            opacity={0.85}
            depthTest={false}
          />
        </mesh>
      )}
    </group>
  )
}
