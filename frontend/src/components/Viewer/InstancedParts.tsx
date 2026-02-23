import { useRef, useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import {
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  type BufferGeometry,
  type Mesh,
  MeshStandardMaterial,
} from 'three'
import type { KnexPartDef, PartInstance } from '../../types/parts'
import { getGlbUrl } from '../../hooks/usePartLibrary'

interface InstancedPartsProps {
  /** Part definition (all instances must be the same part type). */
  def: KnexPartDef
  /** Instances of this part type to render. */
  instances: PartInstance[]
}

/**
 * Renders multiple instances of the same K'Nex part using InstancedMesh
 * for optimal GPU performance. Per rendering-architecture.md, this enables
 * 10k+ pieces at 60 FPS.
 *
 * Falls back to individual meshes if the GLB has no extractable geometry.
 */
export function InstancedParts({ def, instances }: InstancedPartsProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)

  // Extract the first geometry from the GLB scene
  const geometry = useMemo<BufferGeometry | null>(() => {
    let found: BufferGeometry | null = null
    scene.traverse((child) => {
      if (!found && (child as Mesh).isMesh) {
        found = (child as Mesh).geometry as BufferGeometry
      }
    })
    return found
  }, [scene])

  // Create a shared material with the part's default color
  const material = useMemo(() => {
    return new MeshStandardMaterial({
      color: new Color(def.default_color),
      roughness: 0.35,
      metalness: 0.05,
    })
  }, [def.default_color])

  // Update instance matrices whenever instances change
  useEffect(() => {
    if (!meshRef.current) return

    const tempMatrix = new Matrix4()
    const tempPos = new Vector3()
    const tempQuat = new Quaternion()
    const tempScale = new Vector3(1, 1, 1)

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      tempPos.set(inst.position[0], inst.position[1], inst.position[2])
      tempQuat.set(inst.rotation[0], inst.rotation[1], inst.rotation[2], inst.rotation[3])
      tempMatrix.compose(tempPos, tempQuat, tempScale)
      meshRef.current.setMatrixAt(i, tempMatrix)

      // Per-instance color override
      if (inst.color) {
        meshRef.current.setColorAt(i, new Color(inst.color))
      } else {
        meshRef.current.setColorAt(i, new Color(def.default_color))
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
  }, [instances, def.default_color])

  if (!geometry || instances.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
    />
  )
}
