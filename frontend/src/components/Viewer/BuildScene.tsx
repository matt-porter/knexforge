import { Suspense, useMemo, useEffect } from 'react'
import type { KnexPartDef, PartInstance } from '../../types/parts'
import { usePartDefs, preloadAllMeshes } from '../../hooks/usePartLibrary'
import { useBuildStore } from '../../stores/buildStore'
import { useInteractionStore } from '../../stores/interactionStore'
import { PartMesh } from './PartMesh'
import { InstancedParts } from './InstancedParts'
import { GhostPreview } from './GhostPreview'
import { SceneInteraction } from './SceneInteraction'

/** Minimum instance count to switch from individual PartMesh to InstancedMesh. */
const INSTANCING_THRESHOLD = 4

/**
 * A demo build showing real K'Nex parts connected together.
 * Used as fallback when the build store is empty (no build loaded).
 */
function createDemoBuild(): PartInstance[] {
  return [
    // Central 8-way white connector at origin
    {
      instance_id: 'hub-1',
      part_id: 'connector-8way-white-v1',
      position: [0, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // Blue rod extending right (+X) from hub
    {
      instance_id: 'rod-1',
      part_id: 'rod-55-blue-v1',
      position: [12.5, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // Blue rod extending left (-X) from hub
    {
      instance_id: 'rod-2',
      part_id: 'rod-55-blue-v1',
      position: [-67.5, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // Red rod extending up (+Y) from hub
    {
      instance_id: 'rod-3',
      part_id: 'rod-130-red-v1',
      position: [0, 42.5, 0],
      rotation: [0, 0, 0.707, 0.707], // 90° around Z
    },
    // Orange connector at right end of rod-1
    {
      instance_id: 'conn-2',
      part_id: 'connector-2way-straight-orange-v1',
      position: [67.5, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // Orange connector at left end of rod-2
    {
      instance_id: 'conn-3',
      part_id: 'connector-2way-straight-orange-v1',
      position: [-67.5, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // Yellow rod diagonal (NE from hub, roughly 45°)
    {
      instance_id: 'rod-4',
      part_id: 'rod-86-yellow-v1',
      position: [8.84, 38.84, 0],
      rotation: [0, 0, 0.383, 0.924], // ~45° around Z
    },
    // 5-way connector at the top of the red rod
    {
      instance_id: 'conn-4',
      part_id: 'connector-5way-yellow-v1',
      position: [0, 172.5, 0],
      rotation: [0, 0, 0.707, 0.707], // 90° around Z
    },
    // Green rod (short) as a decorative piece
    {
      instance_id: 'rod-5',
      part_id: 'rod-17-green-v1',
      position: [80, 30, 0],
      rotation: [0, 0, 0, 1],
    },
    // White rod extending forward from hub (+Z via E port)
    {
      instance_id: 'rod-6',
      part_id: 'rod-33-white-v1',
      position: [0, 42.5, 0],
      rotation: [0.5, 0.5, -0.5, 0.5], // pointing up
    },
    // A wheel on the ground
    {
      instance_id: 'wheel-1',
      part_id: 'wheel-medium-black-v1',
      position: [80, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    // Grey rod (longest) as a base element
    {
      instance_id: 'rod-7',
      part_id: 'rod-192-grey-v1',
      position: [-96, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    // 3-way connector
    {
      instance_id: 'conn-5',
      part_id: 'connector-3way-yellow-v1',
      position: [0, 0, 40],
      rotation: [0, 0, 0, 1],
    },
    // 4-way 3D connector
    {
      instance_id: 'conn-6',
      part_id: 'connector-4way-3d-silver-v1',
      position: [0, 0, -40],
      rotation: [0, 0, 0, 1],
    },
  ]
}

interface BuildSceneInnerProps {
  parts: PartInstance[]
  defs: Map<string, KnexPartDef>
  selectedPartId: string | null
}

/**
 * Inner component that renders the build using either InstancedMesh
 * (for part types with many instances) or individual PartMesh components.
 */
function BuildSceneInner({ parts, defs, selectedPartId }: BuildSceneInnerProps) {
  // Group instances by part_id
  const grouped = useMemo(() => {
    const map = new Map<string, PartInstance[]>()
    for (const part of parts) {
      const existing = map.get(part.part_id)
      if (existing) {
        existing.push(part)
      } else {
        map.set(part.part_id, [part])
      }
    }
    return map
  }, [parts])

  return (
    <group>
      {Array.from(grouped.entries()).map(([partId, instances]) => {
        const def = defs.get(partId)
        if (!def) return null

        // Use InstancedMesh for part types with many instances
        // (InstancedMesh doesn't support per-instance selection highlight,
        //  so only use it when nothing in the group is selected)
        const hasSelection = instances.some((i) => i.instance_id === selectedPartId)
        if (instances.length >= INSTANCING_THRESHOLD && !hasSelection) {
          return <InstancedParts key={partId} def={def} instances={instances} />
        }

        // Otherwise render individual PartMesh components
        return instances.map((inst) => (
          <PartMesh
            key={inst.instance_id}
            instance={inst}
            def={def}
            selected={inst.instance_id === selectedPartId}
          />
        ))
      })}
    </group>
  )
}

/**
 * Loading placeholder shown while GLBs are being fetched.
 */
function LoadingIndicator() {
  return (
    <mesh position={[0, 20, 0]}>
      <sphereGeometry args={[5, 16, 16]} />
      <meshStandardMaterial color="#4488ff" wireframe />
    </mesh>
  )
}

/**
 * Renders the ghost preview when a part is being placed.
 */
function GhostLayer({ defs }: { defs: Map<string, KnexPartDef> }) {
  const placingPartId = useInteractionStore((s) => s.placingPartId)

  if (!placingPartId) return null

  const def = defs.get(placingPartId)
  if (!def) return null

  return <GhostPreview def={def} />
}

/**
 * Top-level build scene component.
 * Reads parts from the Zustand build store. Falls back to a demo build
 * when the store is empty (no build loaded yet).
 */
export function BuildScene() {
  const { defs, loading, error } = usePartDefs()
  const storeParts = useBuildStore((s) => s.parts)
  const selectedPartId = useBuildStore((s) => s.selectedPartId)
  const loadBuild = useBuildStore((s) => s.loadBuild)

  // Preload all GLB meshes once definitions are available
  useMemo(() => {
    if (defs.size > 0) {
      preloadAllMeshes(defs)
    }
  }, [defs])

  // Load demo build into store if store is empty and defs are ready
  const demoParts = useMemo(() => createDemoBuild(), [])
  useEffect(() => {
    if (defs.size > 0 && Object.keys(storeParts).length === 0) {
      loadBuild(demoParts, [])
    }
  }, [defs.size, storeParts, loadBuild, demoParts])

  // Build the parts list from the store
  const partsList = useMemo(() => Object.values(storeParts), [storeParts])

  if (error) {
    return (
      <mesh position={[0, 20, 0]}>
        <boxGeometry args={[20, 20, 20]} />
        <meshStandardMaterial color="#ff4444" wireframe />
      </mesh>
    )
  }

  if (loading || defs.size === 0) {
    return <LoadingIndicator />
  }

  return (
    <Suspense fallback={<LoadingIndicator />}>
      <BuildSceneInner parts={partsList} defs={defs} selectedPartId={selectedPartId} />
      <GhostLayer defs={defs} />
      <SceneInteraction defs={defs} />
    </Suspense>
  )
}
