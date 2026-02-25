/**
 * Tests for datasetStore.ts
 *
 * Covers: initial state, loadDataset (success + failure + idempotency),
 * selectEntry, setSearchQuery, setStabilityFilter, filteredEntries, selectedEntry.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useDatasetStore } from './datasetStore'
import type { DatasetEntry } from '../types/dataset'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STABLE_ENTRY: DatasetEntry = {
  id: 'proc_0001',
  caption: 'A stable little structure.',
  stability: 75.0,
  is_stable: true,
  actions: [
    {
      step: 1,
      action: 'add_part',
      part_id: 'connector-4way-green-v1',
      instance_id: 'inst-a',
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      color: null,
    },
    {
      step: 2,
      action: 'add_part',
      part_id: 'rod-54-blue-v1',
      instance_id: 'inst-b',
      position: [0, 0, 27],
      quaternion: [0, 0.707, 0, 0.707],
      color: null,
    },
    {
      step: 3,
      action: 'snap',
      from_port: 'inst-a.center',
      to_port: 'inst-b.end1',
    },
  ],
}

const UNSTABLE_ENTRY: DatasetEntry = {
  id: 'proc_0000',
  caption: 'A wobbly random structure with 24 pieces.',
  stability: 42.5,
  is_stable: false,
  actions: [
    {
      step: 1,
      action: 'add_part',
      part_id: 'rod-16-green-v1',
      instance_id: 'inst-c',
      position: [10, 0, 0],
      quaternion: [0, 0, 0, 1],
      color: '#ff0000',
    },
  ],
}

function makeJsonl(...entries: DatasetEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the store to its initial state between tests. */
function resetStore() {
  useDatasetStore.setState({
    entries: [],
    loading: false,
    error: null,
    searchQuery: '',
    stabilityFilter: 'all',
    selectedIndex: null,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('datasetStore — initial state', () => {
  beforeEach(resetStore)

  it('starts with empty entries', () => {
    expect(useDatasetStore.getState().entries).toHaveLength(0)
  })

  it('starts not loading', () => {
    expect(useDatasetStore.getState().loading).toBe(false)
  })

  it('starts with no error', () => {
    expect(useDatasetStore.getState().error).toBeNull()
  })

  it('filteredEntries returns empty array when no entries', () => {
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(0)
  })

  it('selectedEntry returns null when nothing selected', () => {
    expect(useDatasetStore.getState().selectedEntry()).toBeNull()
  })
})

describe('datasetStore — loadDataset (success)', () => {
  beforeEach(() => {
    resetStore()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(makeJsonl(STABLE_ENTRY, UNSTABLE_ENTRY)),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('populates entries after load', async () => {
    await useDatasetStore.getState().loadDataset()
    expect(useDatasetStore.getState().entries).toHaveLength(2)
  })

  it('sets loading to false after load', async () => {
    await useDatasetStore.getState().loadDataset()
    expect(useDatasetStore.getState().loading).toBe(false)
  })

  it('preserves entry fields', async () => {
    await useDatasetStore.getState().loadDataset()
    const first = useDatasetStore.getState().entries[0]
    expect(first.id).toBe('proc_0001')
    expect(first.stability).toBeCloseTo(75.0)
    expect(first.is_stable).toBe(true)
    expect(first.actions).toHaveLength(3)
  })

  it('is idempotent — does not re-fetch when already loaded', async () => {
    await useDatasetStore.getState().loadDataset()
    await useDatasetStore.getState().loadDataset()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('datasetStore — loadDataset (failure)', () => {
  beforeEach(() => {
    resetStore()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets error on HTTP failure', async () => {
    await useDatasetStore.getState().loadDataset()
    expect(useDatasetStore.getState().error).toMatch(/404/)
  })

  it('leaves entries empty on failure', async () => {
    await useDatasetStore.getState().loadDataset()
    expect(useDatasetStore.getState().entries).toHaveLength(0)
  })

  it('sets loading to false after failure', async () => {
    await useDatasetStore.getState().loadDataset()
    expect(useDatasetStore.getState().loading).toBe(false)
  })
})

describe('datasetStore — selectEntry', () => {
  beforeEach(() => {
    resetStore()
    useDatasetStore.setState({ entries: [STABLE_ENTRY, UNSTABLE_ENTRY] })
  })

  it('sets selectedIndex', () => {
    useDatasetStore.getState().selectEntry(1)
    expect(useDatasetStore.getState().selectedIndex).toBe(1)
  })

  it('selectedEntry returns correct entry', () => {
    useDatasetStore.getState().selectEntry(1)
    expect(useDatasetStore.getState().selectedEntry()?.id).toBe('proc_0000')
  })

  it('can deselect by passing null', () => {
    useDatasetStore.getState().selectEntry(0)
    useDatasetStore.getState().selectEntry(null)
    expect(useDatasetStore.getState().selectedIndex).toBeNull()
    expect(useDatasetStore.getState().selectedEntry()).toBeNull()
  })
})

describe('datasetStore — filteredEntries text search', () => {
  beforeEach(() => {
    resetStore()
    useDatasetStore.setState({ entries: [STABLE_ENTRY, UNSTABLE_ENTRY] })
  })

  it('returns all entries when query is empty', () => {
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(2)
  })

  it('filters by entry id', () => {
    useDatasetStore.getState().setSearchQuery('proc_0001')
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(1)
    expect(useDatasetStore.getState().filteredEntries()[0].id).toBe('proc_0001')
  })

  it('filters by caption (case-insensitive)', () => {
    useDatasetStore.getState().setSearchQuery('WOBBLY')
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(1)
    expect(useDatasetStore.getState().filteredEntries()[0].id).toBe('proc_0000')
  })

  it('returns empty when no match', () => {
    useDatasetStore.getState().setSearchQuery('xyzzy')
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(0)
  })

  it('resets selectedIndex when query changes', () => {
    useDatasetStore.getState().selectEntry(0)
    useDatasetStore.getState().setSearchQuery('proc')
    expect(useDatasetStore.getState().selectedIndex).toBeNull()
  })
})

describe('datasetStore — filteredEntries stability filter', () => {
  beforeEach(() => {
    resetStore()
    useDatasetStore.setState({ entries: [STABLE_ENTRY, UNSTABLE_ENTRY] })
  })

  it('stable filter returns only stable entries', () => {
    useDatasetStore.getState().setStabilityFilter('stable')
    const results = useDatasetStore.getState().filteredEntries()
    expect(results).toHaveLength(1)
    expect(results[0].is_stable).toBe(true)
  })

  it('unstable filter returns only unstable entries', () => {
    useDatasetStore.getState().setStabilityFilter('unstable')
    const results = useDatasetStore.getState().filteredEntries()
    expect(results).toHaveLength(1)
    expect(results[0].is_stable).toBe(false)
  })

  it('all filter returns everything', () => {
    useDatasetStore.getState().setStabilityFilter('all')
    expect(useDatasetStore.getState().filteredEntries()).toHaveLength(2)
  })

  it('resets selectedIndex when filter changes', () => {
    useDatasetStore.getState().selectEntry(0)
    useDatasetStore.getState().setStabilityFilter('unstable')
    expect(useDatasetStore.getState().selectedIndex).toBeNull()
  })
})

describe('datasetStore — combined text + stability filters', () => {
  beforeEach(() => {
    resetStore()
    useDatasetStore.setState({ entries: [STABLE_ENTRY, UNSTABLE_ENTRY] })
  })

  it('applies both filters simultaneously', () => {
    useDatasetStore.getState().setSearchQuery('proc_000')
    useDatasetStore.getState().setStabilityFilter('stable')
    const results = useDatasetStore.getState().filteredEntries()
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('proc_0001')
  })
})
