import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Quaternion, Euler, Color, type Mesh, type MeshStandardMaterial } from 'three'
import type { KnexPartDef, PartInstance } from '../../types/parts'
import { getGlbUrl } from '../../hooks/usePartLibrary'

interface PartMeshProps {
  instance: PartInstance
  def: KnexPartDef
  selected?: boolean
  opacity?: number
}

/**
 * Renders a single K'Nex part instance by loading its GLB mesh.
 * Applies the instance's position, rotation (quaternion), and color override.
 */
export function PartMesh({ instance, def, selected = false, opacity = 1 }: PartMeshProps) {
  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)

  // Clone the scene so each instance has its own material
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    const color = new Color(instance.color ?? def.default_color)

    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        // Clone material to avoid sharing between instances
        const mat = (mesh.material as MeshStandardMaterial).clone()
        mat.color = color
        mat.roughness = 0.35
        mat.metalness = 0.05
        if (opacity < 1) {
          mat.transparent = true
          mat.opacity = opacity
        }
        if (selected) {
          mat.emissive = new Color('#4488ff')
          mat.emissiveIntensity = 0.3
        }
        mesh.material = mat
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    return clone
  }, [scene, instance.color, def.default_color, selected, opacity])

  // Convert quaternion [x, y, z, w] to Euler for the group
  const euler = useMemo(() => {
    const q = new Quaternion(
      instance.rotation[0],
      instance.rotation[1],
      instance.rotation[2],
      instance.rotation[3],
    )
    return new Euler().setFromQuaternion(q)
  }, [instance.rotation])

  return (
    <group position={instance.position} rotation={euler}>
      <primitive object={clonedScene} />
    </group>
  )
}
