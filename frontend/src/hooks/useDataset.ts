/**
 * useDataset — hook for loading and accessing dataset.jsonl.
 *
 * Triggers the one-time fetch on first mount and exposes the store's
 * derived helpers so components don't need to import the store directly.
 */

import { useEffect } from 'react'
import { useDatasetStore } from '../stores/datasetStore'
import type { DatasetEntry, DatasetAddPartAction, DatasetSnapAction } from '../types/dataset'
import type { PartInstance, Connection } from '../types/parts'

/**
 * Triggers the dataset load and returns loading / error state.
 * Call once near the top of the component tree.
 */
export function useDatasetLoader(): { loading: boolean; error: string | null } {
  const loadDataset = useDatasetStore((s) => s.loadDataset)
  const loading = useDatasetStore((s) => s.loading)
  const error = useDatasetStore((s) => s.error)

  useEffect(() => {
    void loadDataset()
  }, [loadDataset])

  return { loading, error }
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Ground offset to lift builds above the ground plane (50mm = ~2 rods height) */
const GROUND_OFFSET_MM = 50

/**
 * Convert a DatasetEntry's action stream into the PartInstance[] and
 * Connection[] arrays that the BuildStore expects.
 *
 * Only `add_part` and `snap` actions are materialised; other action types
 * are ignored (the dataset only contains these two anyway).
 */
export function datasetEntryToBuild(entry: DatasetEntry): {
  parts: PartInstance[]
  connections: Connection[]
} {
  const parts: PartInstance[] = []
  const connections: Connection[] = []

  const inferJointType = (snap: DatasetSnapAction): Connection['joint_type'] | undefined => {
    if (snap.joint_type) return snap.joint_type
    // Backward compatibility for older datasets (e.g. proc_0001) that omit joint metadata.
    if (snap.from_port.endsWith('.drive_axle') || snap.to_port.endsWith('.drive_axle')) {
      return 'revolute'
    }
    return undefined
  }

  for (const action of entry.actions) {
    if (action.action === 'add_part') {
      const a = action as DatasetAddPartAction
      // Lift build above ground plane so parts sit ON ground, not IN it
      const liftedPosition: [number, number, number] = [
        a.position[0],
        a.position[1] + GROUND_OFFSET_MM,
        a.position[2],
      ]
      parts.push({
        instance_id: a.instance_id,
        part_id: a.part_id,
        position: liftedPosition,
        // Dataset stores quaternion as [x, y, z, w] — same order as PartInstance.rotation
        rotation: a.quaternion,
        color: a.color ?? undefined,
      })
    } else if (action.action === 'snap') {
      // from_port / to_port are "<instance_id>.<port_id>"
      const fromDot = action.from_port.lastIndexOf('.')
      const toDot = action.to_port.lastIndexOf('.')
      if (fromDot === -1 || toDot === -1) continue

      const normalizeLegacyRodSidePortId = (portId: string): string =>
        portId === 'center_tangent' ? 'center_tangent_y_pos' : portId

      connections.push({
        from_instance: action.from_port.slice(0, fromDot),
        from_port: normalizeLegacyRodSidePortId(action.from_port.slice(fromDot + 1)),
        to_instance: action.to_port.slice(0, toDot),
        to_port: normalizeLegacyRodSidePortId(action.to_port.slice(toDot + 1)),
        joint_type: inferJointType(action),
      })
    }
  }

  return { parts, connections }
}

/**
 * Count the number of unique parts in a dataset entry
 * (excludes snap-only actions from the count).
 */
export function countParts(entry: DatasetEntry): number {
  return entry.actions.filter((a) => a.action === 'add_part').length
}
