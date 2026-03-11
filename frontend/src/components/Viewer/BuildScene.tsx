import { Suspense, useMemo, useEffect, useRef } from 'react'
import type { Connection, KnexPartDef, PartInstance } from '../../types/parts'
import { usePartDefs, preloadAllMeshes } from '../../hooks/usePartLibrary'
import { useBuildStore } from '../../stores/buildStore'
import { useInteractionStore } from '../../stores/interactionStore'
import { useSynthesisStore } from '../../stores/synthesisStore'
import { PartMesh } from './PartMesh'
import { InstancedParts } from './InstancedParts'
import { GhostPreview } from './GhostPreview'
import { SceneInteraction } from './SceneInteraction'
import { PortIndicators } from './PortIndicators'
import { SlideGuide } from './SlideGuide'
import { getPortWorldPose, getSlideRange } from '../../helpers/snapHelper'
import { useDatasetStore } from '../../stores/datasetStore'
import { datasetEntryToBuild } from '../../hooks/useDataset'
import { getLastModelId, loadLocalModelData, parseExportedBuildData, getLocalModelsIndex } from '../../services/localModels'
import { Line } from '@react-three/drei'
import { Vector3 } from 'three'

/** Minimum instance count to switch from individual PartMesh to InstancedMesh. */
const INSTANCING_THRESHOLD = 4

/**
 * Renders lines between connected ports to visualize the build's structure.
 */
function ConnectionLines({ 
  connections, 
  parts, 
  defs,
  color = "#4488ff",
  opacity = 0.4
}: { 
  connections: Connection[], 
  parts: Record<string, PartInstance>, 
  defs: Map<string, KnexPartDef>,
  color?: string,
  opacity?: number
}) {
  const lines = useMemo(() => {
    const result: { start: Vector3; end: Vector3; key: string }[] = []
    
    for (const conn of connections) {
      const fromInst = parts[conn.from_instance]
      const toInst = parts[conn.to_instance]
      
      if (!fromInst || !toInst) continue
      
      const fromDef = defs.get(fromInst.part_id)
      const toDef = defs.get(toInst.part_id)
      
      if (!fromDef || !toDef) continue
      
      const fromPort = fromDef.ports.find(p => p.id === conn.from_port)
      const toPort = toDef.ports.find(p => p.id === conn.to_port)
      
      if (!fromPort || !toPort) continue
      
      const { position: fromWorld } = getPortWorldPose(fromInst, fromPort)
      const { position: toWorld } = getPortWorldPose(toInst, toPort)
      
      result.push({
        start: fromWorld,
        end: toWorld,
        key: `${conn.from_instance}.${conn.from_port}-${conn.to_instance}.${conn.to_port}`
      })
    }
    
    return result
  }, [connections, parts, defs])

  return (
    <group>
      {lines.map(line => (
        <Line
          key={line.key}
          points={[line.start, line.end]}
          color={color}
          lineWidth={1.5}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  )
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
  const hoveredPartId = useInteractionStore((s) => s.hoveredPartId)

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
        // (InstancedMesh doesn't support per-instance selection/hover highlight,
        //  so only use it when nothing in the group is selected/hovered)
        const hasSelectionOrHover = instances.some((i) => i.instance_id === selectedPartId || i.instance_id === hoveredPartId)
        if (instances.length >= INSTANCING_THRESHOLD && !hasSelectionOrHover) {
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
 * Renders a ghosted preview of a synthesis candidate.
 */
function PreviewLayer({ defs }: { defs: Map<string, KnexPartDef> }) {
  const previewBuild = useSynthesisStore((s) => s.previewBuild)
  
  if (!previewBuild) return null

  return (
    <group>
      {previewBuild.parts.map((inst) => {
        const def = defs.get(inst.part_id)
        if (!def) return null
        return (
          <PartMesh 
            key={`preview-${inst.instance_id}`} 
            instance={{...inst, color: '#4488ff'}} 
            def={def} 
            opacity={0.3}
          />
        )
      })}
      <ConnectionLines 
        connections={previewBuild.connections} 
        parts={Object.fromEntries(previewBuild.parts.map(p => [p.instance_id, p]))} 
        defs={defs} 
        color="#3b82f6"
        opacity={0.2}
      />
    </group>
  )
}

interface BuildSceneProps {
  /**
   * When true, a demo build is loaded automatically if the store is empty.
   * Set to false when the viewer is embedded in the Model Browser so an
   * empty-store is a valid "no model selected" state.
   */
  loadDemoWhenEmpty?: boolean
}

/**
 * Top-level build scene component.
 * Reads parts from the Zustand build store. Falls back to a demo build
 * when the store is empty (no build loaded yet) and loadDemoWhenEmpty is true.
 */
export function BuildScene({ loadDemoWhenEmpty = true }: BuildSceneProps) {
    const { defs, loading, error } = usePartDefs()
    const storeParts = useBuildStore((s) => s.parts)
    const storeConnections = useBuildStore((s) => s.connections)
    const selectedPartId = useBuildStore((s) => s.selectedPartId)
    const loadBuild = useBuildStore((s) => s.loadBuild)
    const setCurrentModelMeta = useBuildStore((s) => s.setCurrentModelMeta)
    
    const { loadDataset } = useDatasetStore()
    const initialLoadRef = useRef(false)

    // Preload all GLB meshes once definitions are available
    useMemo(() => {
        if (defs.size > 0) {
            preloadAllMeshes(defs)
        }
    }, [defs])

    // Handle initial load
    useEffect(() => {
        if (!loadDemoWhenEmpty || defs.size === 0 || initialLoadRef.current) return
        
        // If store already has parts, we don't need to load anything
        if (Object.keys(storeParts).length > 0) {
            initialLoadRef.current = true
            return
        }

        const triggerInitialLoad = async () => {
            initialLoadRef.current = true
            
            // 1. Try to load last used model or most recent from local index
            const lastId = getLastModelId()
            const index = getLocalModelsIndex()
            const targetId = lastId || (index.length > 0 ? index[0].id : null)

            if (targetId) {
                const localData = loadLocalModelData(targetId)
                const meta = index.find(m => m.id === targetId)
                if (localData && meta) {
                    const { parts, connections } = parseExportedBuildData(localData)
                    loadBuild(parts, connections)
                    setCurrentModelMeta(targetId, meta.title)
                    return
                }
            }

            // 2. Fallback to proc_0001 from dataset
            await loadDataset()
            const entry0001 = useDatasetStore.getState().entries.find(e => e.id === 'proc_0001')
            if (entry0001) {
                const { parts, connections } = datasetEntryToBuild(entry0001)
                loadBuild(parts, connections)
                setCurrentModelMeta(null, 'Example: Motorized Spinner')
            }
        }

        triggerInitialLoad()
    }, [loadDemoWhenEmpty, defs.size, loadBuild, loadDataset, setCurrentModelMeta])

    // Listen for slide edit events from ContextMenu
    useEffect(() => {
        const handleStartSlideEdit = (e: Event) => {
            const detail = (e as CustomEvent).detail
            const rodInst = useBuildStore.getState().parts[detail.rodId]
            const rodDef = rodInst ? defs.get(rodInst.part_id) : undefined
            if (rodDef) {
                const range = getSlideRange(rodDef, detail.portId)
                if (range) {
                    const snapshot = useBuildStore.getState().getSnapshot()
                    useInteractionStore.setState({ slideEditInitialSnapshot: snapshot })
                    
                    useInteractionStore.getState().startSlideEditing(
                        detail.instanceId,
                        detail.connIndex,
                        detail.rodId,
                        detail.portId,
                        detail.initialOffset,
                        range
                    )
                }
            }
        }
        const handleApplySlideEdit = () => {
            const { isSlideEditing, slideEditConnectionIndex, slideOffset } = useInteractionStore.getState()
            if (isSlideEditing && slideEditConnectionIndex !== null) {
                useBuildStore.getState().updateSlideOffset(slideEditConnectionIndex, slideOffset, defs)
            }
        }
        window.addEventListener('knexforge:start-slide-edit', handleStartSlideEdit)
        window.addEventListener('knexforge:apply-slide-edit', handleApplySlideEdit)
        return () => {
            window.removeEventListener('knexforge:start-slide-edit', handleStartSlideEdit)
            window.removeEventListener('knexforge:apply-slide-edit', handleApplySlideEdit)
        }
    }, [defs])

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
      <ConnectionLines connections={storeConnections} parts={storeParts} defs={defs} />
      <PreviewLayer defs={defs} />
      <GhostLayer defs={defs} />
      {/* Visual slide range guide */}
      <SlideGuide defs={defs} />
      {/* Target points for port matching mode */}
      <PortIndicators defs={defs} />
      <SceneInteraction defs={defs} />
    </Suspense>
  )
}
