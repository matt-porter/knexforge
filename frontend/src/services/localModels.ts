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
}

export function deleteLocalModel(id: string) {
  const index = getLocalModelsIndex()
  const newIndex = index.filter((m) => m.id !== id)
  saveLocalModelsIndex(newIndex)
  localStorage.removeItem(`knexforge_model_${id}`)
}
