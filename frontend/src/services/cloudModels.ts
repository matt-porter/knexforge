import { supabase } from './supabaseClient'
import { createExportData, parseExportedBuildData } from './localModels'
import type { PartInstance, Connection } from '../types/parts'
import type { ExportedBuildData } from './sidecarBridge'

export interface CloudModelMeta {
  id: string
  user_id: string
  title: string
  piece_count: number
  stability_score: number
  created_at: string
  updated_at: string
}

/**
 * Fetch all models for the current user.
 */
export async function getCloudModels(): Promise<CloudModelMeta[]> {
  const { data, error } = await supabase
    .from('models')
    .select('id, user_id, title, piece_count, stability_score, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[CloudModels] Error fetching models:', error)
    throw error
  }

  return data as CloudModelMeta[]
}

/**
 * Save a model to the cloud.
 * If id is provided, it updates the existing model.
 * Otherwise, it creates a new one.
 */
export async function saveCloudModel(
  title: string,
  parts: PartInstance[],
  connections: Connection[],
  stability: number,
  id?: string
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User must be logged in to save to cloud')

  const exportData = createExportData(parts, connections, title, stability)
  
  const payload = {
    user_id: user.id,
    title,
    data: exportData,
    piece_count: parts.length,
    stability_score: stability,
    updated_at: new Date().toISOString()
  }

  if (id) {
    const { error } = await supabase
      .from('models')
      .update(payload)
      .eq('id', id)
    
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase
      .from('models')
      .insert(payload)
      .select('id')
      .single()
    
    if (error) throw error
    return data.id
  }
}

/**
 * Load model data from the cloud.
 */
export async function loadCloudModelData(id: string): Promise<{
  parts: PartInstance[]
  connections: Connection[]
  title: string
}> {
  const { data, error } = await supabase
    .from('models')
    .select('title, data')
    .eq('id', id)
    .single()

  if (error) throw error

  const exportData = data.data as ExportedBuildData
  const { parts, connections } = parseExportedBuildData(exportData)

  return {
    parts,
    connections,
    title: data.title
  }
}

/**
 * Delete a model from the cloud.
 */
export async function deleteCloudModel(id: string): Promise<void> {
  const { error } = await supabase
    .from('models')
    .delete()
    .eq('id', id)

  if (error) throw error
}
