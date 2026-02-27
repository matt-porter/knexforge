import { useState, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import type { KnexPartDef } from '../types/parts'

/** All part definition file names (matched to public/parts/*.json). */
const PART_IDS = [
  'connector-1way-grey-v1',
  'connector-2way-orange-v1',
  'connector-3way-red-v1',
  'connector-4way-3d-purple-v1',
  'connector-4way-green-v1',
  'connector-5way-yellow-v1',
  'connector-7way-blue-v1',
  'connector-8way-white-v1',
  'rod-16-green-v1',
  'rod-32-white-v1',
  'rod-54-blue-v1',
  'rod-86-yellow-v1',
  'rod-128-red-v1',
  'rod-190-grey-v1',
  'wheel-medium-black-v1',
  'motor-v1',
]

/**
 * Loads all part JSON definitions from public/parts/.
 * Returns a Map of part ID → KnexPartDef.
 */
async function loadAllPartDefs(): Promise<Map<string, KnexPartDef>> {
  const defs = new Map<string, KnexPartDef>()

  const results = await Promise.all(
    PART_IDS.map(async (id) => {
      const resp = await fetch(`/parts/${id}.json`)
      if (!resp.ok) throw new Error(`Failed to load part ${id}: ${resp.statusText}`)
      const def = (await resp.json()) as KnexPartDef
      return def
    }),
  )

  for (const def of results) {
    defs.set(def.id, def)
  }

  return defs
}

/**
 * Hook that loads all K'Nex part definitions from JSON files.
 * GLB meshes are loaded separately per-component using useGLTF.
 */
export function usePartDefs(): {
  defs: Map<string, KnexPartDef>
  loading: boolean
  error: string | null
} {
  const [defs, setDefs] = useState<Map<string, KnexPartDef>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    loadAllPartDefs()
      .then((result) => {
        if (!cancelled) {
          setDefs(result)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { defs, loading, error }
}

/**
 * Returns the URL for a part's GLB mesh file.
 * Part JSON mesh_file is like "meshes/rod-54-blue.glb",
 * which maps to "/parts/meshes/rod-54-blue.glb" in public/.
 */
export function getGlbUrl(def: KnexPartDef): string {
  return `/parts/${def.mesh_file}`
}

/**
 * Preload all GLB meshes so they're cached before rendering.
 * Call once at app startup.
 */
export function preloadAllMeshes(defs: Map<string, KnexPartDef>): void {
  for (const def of defs.values()) {
    useGLTF.preload(getGlbUrl(def))
  }
}
