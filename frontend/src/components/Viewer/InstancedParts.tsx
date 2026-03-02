import { useRef, useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
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
import { getMeshCorrection } from '../../helpers/meshCorrection'
import { useVisualStore } from '../../stores/visualStore'
import { useBuildStore } from '../../stores/buildStore'
import { useInteractionStore } from '../../stores/interactionStore'
import { simulationTransforms } from '../../services/simulationManager'

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
 * Bakes mesh correction transform into each instance matrix so the
 * GLB geometry aligns with port data coordinates.
 */
export function InstancedParts({ def, instances }: InstancedPartsProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const url = getGlbUrl(def)
  const { scene } = useGLTF(url)
  const { mode: visualMode, explosionFactor } = useVisualStore()
  const stressData = useBuildStore((state) => state.stressData)

  // Mesh correction for GLB→port alignment
  const correctionMatrix = useMemo(() => {
    const correction = getMeshCorrection(def)
    const m = new Matrix4()
    const corrQuat = new Quaternion().setFromEuler(correction.rotation)
    m.compose(correction.position, corrQuat, new Vector3(1, 1, 1))
    return m
  }, [def])

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

  // Create a shared material that updates based on the visual mode
  const material = useMemo(() => {
    const isInstruction = visualMode === 'instruction'
    const isXRay = visualMode === 'x-ray'

    return new MeshStandardMaterial({
      color: new Color(def.default_color),
      roughness: isInstruction ? 1.0 : 0.35,
      metalness: isInstruction ? 0.0 : 0.05,
      transparent: isXRay,
      opacity: isXRay ? 0.35 : 1,
      depthWrite: !isXRay,
    })
  }, [def.default_color, visualMode])

  const isSimulating = useInteractionStore((s) => s.isSimulating)

  // Update instance matrices whenever instances change
  useEffect(() => {
    if (!meshRef.current) return
    if (isSimulating) return

    const instanceMatrix = new Matrix4()
    const tempPos = new Vector3()
    const tempQuat = new Quaternion()
    const tempScale = new Vector3(1, 1, 1)

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]

      // Exploded View offset
      let finalX = inst.position[0]
      let finalY = inst.position[1]
      let finalZ = inst.position[2]

      if (visualMode === 'exploded' && explosionFactor > 0) {
        const explodeScale = 150 * explosionFactor
        const vec = new Vector3(...inst.position)
        if (vec.lengthSq() > 0.01) {
          const dir = vec.clone().normalize()
          finalX += dir.x * explodeScale
          finalY += dir.y * explodeScale
          finalZ += dir.z * explodeScale
        }
      }

      tempPos.set(finalX, finalY, finalZ)
      tempQuat.set(inst.rotation[0], inst.rotation[1], inst.rotation[2], inst.rotation[3])

      // Instance world transform * mesh correction = final matrix
      instanceMatrix.compose(tempPos, tempQuat, tempScale)
      instanceMatrix.multiply(correctionMatrix)

      meshRef.current.setMatrixAt(i, instanceMatrix)

      // Per-instance color override
      if (visualMode === 'stress') {
        const stress = stressData?.[inst.instance_id] || 0.0 // 0 to 1
        meshRef.current.setColorAt(i, new Color().lerpColors(new Color('#0044ff'), new Color('#ff0000'), stress))
      } else if (inst.color) {
        meshRef.current.setColorAt(i, new Color(inst.color))
      } else {
        meshRef.current.setColorAt(i, new Color(def.default_color))
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
  }, [instances, def.default_color, correctionMatrix, visualMode, explosionFactor, stressData, isSimulating])

  // Fast 60 FPS update loop for simulation data
  useFrame(() => {
    if (!meshRef.current || !isSimulating) return

    const instanceMatrix = new Matrix4()
    const tempPos = new Vector3()
    const tempQuat = new Quaternion()
    const tempScale = new Vector3(1, 1, 1)

    let updated = false
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      const transform = simulationTransforms.get(inst.instance_id)
      if (transform) {
        tempPos.set(transform.position[0], transform.position[1], transform.position[2])
        tempQuat.set(transform.quaternion[0], transform.quaternion[1], transform.quaternion[2], transform.quaternion[3])

        instanceMatrix.compose(tempPos, tempQuat, tempScale)
        instanceMatrix.multiply(correctionMatrix)
        meshRef.current.setMatrixAt(i, instanceMatrix)
        updated = true
      }
    }

    if (updated) {
      meshRef.current.instanceMatrix.needsUpdate = true
    }
  })

  if (!geometry || instances.length === 0) return null

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const { mode } = useInteractionStore.getState()
    if (mode === 'select' && e.instanceId !== undefined) {
      const inst = instances[e.instanceId]
      useBuildStore.getState().selectPart(inst.instance_id)
      
      if (e.altKey) {
        useInteractionStore.getState().startPlacing(inst.part_id, inst.instance_id)
      }
    }
  }

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const { mode } = useInteractionStore.getState()
    if (mode === 'select' && e.instanceId !== undefined) {
      const inst = instances[e.instanceId]
      useBuildStore.getState().selectPart(inst.instance_id)
      const nativeEvent = e.nativeEvent as MouseEvent
      useInteractionStore.getState().openContextMenu(nativeEvent.clientX, nativeEvent.clientY, inst.instance_id)
    }
  }

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.instanceId !== undefined) {
      const inst = instances[e.instanceId]
      useInteractionStore.getState().setHoveredPart(inst.instance_id)
      if (useInteractionStore.getState().mode === 'place') {
        useInteractionStore.getState().setMatchTargetId(inst.instance_id)
      }
    }
  }

  const handlePointerOut = () => {
    useInteractionStore.getState().setHoveredPart(null)
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  )
}
