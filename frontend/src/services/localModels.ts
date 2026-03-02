import type { ExportedBuildData } from './sidecarBridge'

export interface LocalModelMeta {
  id: string
  title: string
  pieceCount: number
  updatedAt: number
}

const INDEX_KEY = 'knexforge_models_index'

export function getLocalModelsIndex(): LocalModelMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveLocalModelsIndex(index: LocalModelMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export function loadLocalModelData(id: string): ExportedBuildData | null {
  try {
    const raw = localStorage.getItem(`knexforge_model_${id}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveLocalModel(id: string, title: string, data: ExportedBuildData) {
  const index = getLocalModelsIndex()
  const existingIndex = index.findIndex((m) => m.id === id)
  
  const meta: LocalModelMeta = {
    id,
    title,
    pieceCount: data.manifest.piece_count,
    updatedAt: Date.now(),
  }

  if (existingIndex >= 0) {
    index[existingIndex] = meta
  } else {
    index.push(meta)
  }

  index.sort((a, b) => b.updatedAt - a.updatedAt) // sort newest first
  saveLocalModelsIndex(index)
  
  localStorage.setItem(`knexforge_model_${id}`, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('knexforge:local-models-updated'))
}

export function deleteLocalModel(id: string) {
  const index = getLocalModelsIndex()
  const newIndex = index.filter((m) => m.id !== id)
  saveLocalModelsIndex(newIndex)
  localStorage.removeItem(`knexforge_model_${id}`)
  window.dispatchEvent(new CustomEvent('knexforge:local-models-updated'))
}

import type { PartInstance, Connection } from '../types/parts'

export function createExportData(parts: PartInstance[], connections: Connection[], title: string = 'Untitled Build', stability: number = 100): ExportedBuildData {
  return {
    manifest: {
      format_version: "1.0",
      app_version: "1.0.0",
      created_at: new Date().toISOString(),
      author: "Local User",
      title,
      description: "",
      piece_count: parts.length,
      stability_score: stability
    },
    model: {
      parts: parts.map(p => ({
        instance_id: p.instance_id,
        part_id: p.part_id,
        position: p.position,
        quaternion: p.rotation,
        color: p.color
      })),
      connections: connections.map(c => ({
        from: `${c.from_instance}.${c.from_port}`,
        to: `${c.to_instance}.${c.to_port}`,
        joint_type: c.joint_type || 'fixed'
      }))
    }
  }
}
