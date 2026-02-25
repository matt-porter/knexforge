/**
 * Zustand store for the Model Browser.
 *
 * Owns the loaded dataset entries and all UI state for browsing:
 * selected model index, search/filter text, and stability filter.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { DatasetEntry } from '../types/dataset'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StabilityFilter = 'all' | 'stable' | 'unstable'

export interface DatasetStore {
  // --- Data ---
  /** All loaded dataset entries. Empty until loadDataset() resolves. */
  entries: DatasetEntry[]
  /** Whether the dataset is still being fetched. */
  loading: boolean
  /** Non-null when fetching/parsing failed. */
  error: string | null

  // --- Filter / search ---
  /** Free-text search applied to entry id and caption. */
  searchQuery: string
  /** Stability filter applied on top of text search. */
  stabilityFilter: StabilityFilter

  // --- Selection ---
  /** Index into `entries` of the currently previewed model, or null. */
  selectedIndex: number | null

  // --- Derived ---
  /** Returns entries that survive the current filters. */
  filteredEntries: () => DatasetEntry[]
  /** Returns the currently selected entry, or null. */
  selectedEntry: () => DatasetEntry | null

  // --- Actions ---
  /** Load and parse dataset.jsonl. Idempotent — does nothing if already loaded. */
  loadDataset: () => Promise<void>
  /** Select a model by its index in the `entries` array. */
  selectEntry: (index: number | null) => void
  /** Update free-text search query. */
  setSearchQuery: (query: string) => void
  /** Update stability filter. */
  setStabilityFilter: (filter: StabilityFilter) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesSearch(entry: DatasetEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return entry.id.toLowerCase().includes(q) || entry.caption.toLowerCase().includes(q)
}

function matchesStability(entry: DatasetEntry, filter: StabilityFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'stable') return entry.is_stable
  return !entry.is_stable
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDatasetStore = create<DatasetStore>()(
  immer((set, get) => ({
    // --- Initial state ---
    entries: [],
    loading: false,
    error: null,
    searchQuery: '',
    stabilityFilter: 'all',
    selectedIndex: null,

    // --- Derived ---
    filteredEntries: () => {
      const { entries, searchQuery, stabilityFilter } = get()
      return entries.filter(
        (e) => matchesSearch(e, searchQuery) && matchesStability(e, stabilityFilter),
      )
    },

    selectedEntry: () => {
      const { entries, selectedIndex } = get()
      if (selectedIndex === null || selectedIndex >= entries.length) return null
      return entries[selectedIndex]
    },

    // --- Actions ---
    loadDataset: async () => {
      // Idempotent: skip if we already have data or are loading.
      if (get().loading || get().entries.length > 0) return

      set((state) => {
        state.loading = true
        state.error = null
      })

      try {
        const resp = await fetch('/dataset.jsonl')
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)

        const text = await resp.text()
        const entries: DatasetEntry[] = text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as DatasetEntry)

        set((state) => {
          state.entries = entries
          state.loading = false
        })
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : String(err)
          state.loading = false
        })
      }
    },

    selectEntry: (index: number | null) => {
      set((state) => {
        state.selectedIndex = index
      })
    },

    setSearchQuery: (query: string) => {
      set((state) => {
        state.searchQuery = query
        // Reset selection when filter changes so we don't show a stale model
        state.selectedIndex = null
      })
    },

    setStabilityFilter: (filter: StabilityFilter) => {
      set((state) => {
        state.stabilityFilter = filter
        state.selectedIndex = null
      })
    },
  })),
)
