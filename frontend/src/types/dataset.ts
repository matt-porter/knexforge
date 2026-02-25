/**
 * TypeScript types for dataset.jsonl entries.
 *
 * Each line of the JSONL file is one DatasetEntry — a procedurally generated
 * K'Nex structure with its action history, stability score, and a caption.
 */

/** A single step recorded in the action history of a dataset build. */
export type DatasetAction =
  | DatasetAddPartAction
  | DatasetSnapAction

export interface DatasetAddPartAction {
  step: number
  action: 'add_part'
  part_id: string
  instance_id: string
  position: [number, number, number]
  /** Quaternion in [x, y, z, w] order. */
  quaternion: [number, number, number, number]
  color: string | null
}

export interface DatasetSnapAction {
  step: number
  action: 'snap'
  /** Format: "<instance_id>.<port_id>" */
  from_port: string
  /** Format: "<instance_id>.<port_id>" */
  to_port: string
}

/** One entry in dataset.jsonl — a complete procedurally generated build. */
export interface DatasetEntry {
  id: string
  caption: string
  /** Graph-based stability score (0–100). */
  stability: number
  /** True when stability ≥ 50. */
  is_stable: boolean
  actions: DatasetAction[]
}
