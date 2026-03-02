import type { ExportedBuildData } from './sidecarBridge'
import type { PartInstance, Connection } from '../types/parts'

export interface LocalModelMeta {
  id: string
  title: string
  pieceCount: number
  updatedAt: number
}

const INDEX_KEY = 'knexforge_models_index'
const LAST_MODEL_KEY = 'knexforge_last_model_id'

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

export function saveLastModelId(id: string | null) {
  if (id) {
    localStorage.setItem(LAST_MODEL_KEY, id)
  } else {
    localStorage.removeItem(LAST_MODEL_KEY)
  }
}

export function getLastModelId(): string | null {
  return localStorage.getItem(LAST_MODEL_KEY)
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
  saveLastModelId(id)
  window.dispatchEvent(new CustomEvent('knexforge:local-models-updated'))
}

export function deleteLocalModel(id: string) {
  const index = getLocalModelsIndex()
  const newIndex = index.filter((m) => m.id !== id)
  saveLocalModelsIndex(newIndex)
  localStorage.removeItem(`knexforge_model_${id}`)
  if (getLastModelId() === id) {
    saveLastModelId(null)
  }
  window.dispatchEvent(new CustomEvent('knexforge:local-models-updated'))
}

export function parseExportedBuildData(data: ExportedBuildData): {
  parts: PartInstance[]
  connections: Connection[]
} {
  const parts: PartInstance[] = data.model.parts.map((p) => ({
    instance_id: p.instance_id,
    part_id: p.part_id,
    position: p.position as [number, number, number],
    rotation: p.quaternion as [number, number, number, number],
    color: p.color,
  }))

  const connections: Connection[] = data.model.connections.map((c) => {
    const fromLastDot = c.from.lastIndexOf('.')
    const toLastDot = c.to.lastIndexOf('.')
    return {
      from_instance: c.from.substring(0, fromLastDot),
      from_port: c.from.substring(fromLastDot + 1),
      to_instance: c.to.substring(0, toLastDot),
      to_port: c.to.substring(toLastDot + 1),
      joint_type: (c.joint_type as 'fixed' | 'revolute' | 'prismatic') || 'fixed',
    }
  })

  return { parts, connections }
}

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
