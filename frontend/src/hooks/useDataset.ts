/**
 * useDataset — hook for loading and accessing dataset.jsonl.
 *
 * Triggers the one-time fetch on first mount and exposes the store's
 * derived helpers so components don't need to import the store directly.
 */

import { useEffect } from 'react'
import { useDatasetStore } from '../stores/datasetStore'
import type { DatasetEntry, DatasetAddPartAction } from '../types/dataset'
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

  for (const action of entry.actions) {
    if (action.action === 'add_part') {
      const a = action as DatasetAddPartAction
      parts.push({
        instance_id: a.instance_id,
        part_id: a.part_id,
        position: a.position,
        // Dataset stores quaternion as [x, y, z, w] — same order as PartInstance.rotation
        rotation: a.quaternion,
        color: a.color ?? undefined,
      })
    } else if (action.action === 'snap') {
      // from_port / to_port are "<instance_id>.<port_id>"
      const fromDot = action.from_port.lastIndexOf('.')
      const toDot = action.to_port.lastIndexOf('.')
      if (fromDot === -1 || toDot === -1) continue

      connections.push({
        from_instance: action.from_port.slice(0, fromDot),
        from_port: action.from_port.slice(fromDot + 1),
        to_instance: action.to_port.slice(0, toDot),
        to_port: action.to_port.slice(toDot + 1),
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
