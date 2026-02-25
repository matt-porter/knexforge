/**
 * Tests for useDataset.ts — datasetEntryToBuild and countParts helpers.
 *
 * These are pure conversion functions so they don't need React or a DOM.
 */

import { describe, it, expect } from 'vitest'
import { datasetEntryToBuild, countParts } from './useDataset'
import type { DatasetEntry } from '../types/dataset'

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE: DatasetEntry = {
  id: 'proc_0001',
  caption: 'Test structure',
  stability: 71.4,
  is_stable: true,
  actions: [
    {
      step: 1,
      action: 'add_part',
      part_id: 'connector-4way-green-v1',
      instance_id: '0806aba9-7318-412d-ae82-1e4088e1d3c0',
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      color: null,
    },
    {
      step: 2,
      action: 'add_part',
      part_id: 'rod-54-blue-v1',
      instance_id: 'ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e',
      position: [0, 0, 27],
      quaternion: [0, 0.707, 0, 0.707],
      color: null,
    },
    {
      step: 3,
      action: 'snap',
      from_port: '0806aba9-7318-412d-ae82-1e4088e1d3c0.center',
      to_port: 'ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e.center_axial_2',
    },
    {
      step: 4,
      action: 'add_part',
      part_id: 'connector-5way-blue-v1',
      instance_id: 'd8bec2d7-4d34-41c4-819d-d2bb64e6434c',
      position: [0, 0, -40],
      quaternion: [0.41, 0.57, 0, 0.707],
      color: '#ff0000',
    },
    {
      step: 5,
      action: 'snap',
      from_port: 'ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e.end2',
      to_port: 'd8bec2d7-4d34-41c4-819d-d2bb64e6434c.C',
    },
  ],
}

// ---------------------------------------------------------------------------
// countParts
// ---------------------------------------------------------------------------

describe('countParts', () => {
  it('counts only add_part actions', () => {
    expect(countParts(FIXTURE)).toBe(3)
  })

  it('returns 0 for an entry with no add_part actions', () => {
    const empty: DatasetEntry = { ...FIXTURE, actions: [] }
    expect(countParts(empty)).toBe(0)
  })

  it('ignores snap actions', () => {
    const snapsOnly: DatasetEntry = {
      ...FIXTURE,
      actions: [
        { step: 1, action: 'snap', from_port: 'a.p1', to_port: 'b.p2' },
        { step: 2, action: 'snap', from_port: 'b.p2', to_port: 'c.p3' },
      ],
    }
    expect(countParts(snapsOnly)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// datasetEntryToBuild — parts
// ---------------------------------------------------------------------------

describe('datasetEntryToBuild — PartInstance conversion', () => {
  it('produces one PartInstance per add_part action', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    expect(parts).toHaveLength(3)
  })

  it('maps instance_id correctly', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    expect(parts.map((p) => p.instance_id)).toContain('0806aba9-7318-412d-ae82-1e4088e1d3c0')
    expect(parts.map((p) => p.instance_id)).toContain('ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e')
    expect(parts.map((p) => p.instance_id)).toContain('d8bec2d7-4d34-41c4-819d-d2bb64e6434c')
  })

  it('maps part_id correctly', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    const connector = parts.find((p) => p.instance_id === '0806aba9-7318-412d-ae82-1e4088e1d3c0')
    expect(connector?.part_id).toBe('connector-4way-green-v1')
  })

  it('maps position correctly', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    const rod = parts.find((p) => p.instance_id === 'ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e')
    expect(rod?.position).toEqual([0, 0, 27])
  })

  it('maps quaternion → rotation in [x,y,z,w] order', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    const rod = parts.find((p) => p.instance_id === 'ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e')
    expect(rod?.rotation).toEqual([0, 0.707, 0, 0.707])
  })

  it('maps non-null color to color field', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    const colored = parts.find((p) => p.instance_id === 'd8bec2d7-4d34-41c4-819d-d2bb64e6434c')
    expect(colored?.color).toBe('#ff0000')
  })

  it('maps null color to undefined', () => {
    const { parts } = datasetEntryToBuild(FIXTURE)
    const noColor = parts.find((p) => p.instance_id === '0806aba9-7318-412d-ae82-1e4088e1d3c0')
    expect(noColor?.color).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// datasetEntryToBuild — connections
// ---------------------------------------------------------------------------

describe('datasetEntryToBuild — Connection conversion', () => {
  it('produces one Connection per snap action', () => {
    const { connections } = datasetEntryToBuild(FIXTURE)
    expect(connections).toHaveLength(2)
  })

  it('parses from_port into from_instance + from_port fields', () => {
    const { connections } = datasetEntryToBuild(FIXTURE)
    const first = connections[0]
    expect(first.from_instance).toBe('0806aba9-7318-412d-ae82-1e4088e1d3c0')
    expect(first.from_port).toBe('center')
  })

  it('parses to_port into to_instance + to_port fields', () => {
    const { connections } = datasetEntryToBuild(FIXTURE)
    const first = connections[0]
    expect(first.to_instance).toBe('ab4b13f4-cbb8-42b9-9e4d-1f28b6e0992e')
    expect(first.to_port).toBe('center_axial_2')
  })

  it('handles port IDs that include underscores and numbers', () => {
    const { connections } = datasetEntryToBuild(FIXTURE)
    const second = connections[1]
    expect(second.from_port).toBe('end2')
    expect(second.to_port).toBe('C')
  })

  it('skips snap actions with malformed port strings (no dot)', () => {
    const badEntry: DatasetEntry = {
      ...FIXTURE,
      actions: [
        { step: 1, action: 'snap', from_port: 'no-dot-here', to_port: 'also-no-dot' },
      ],
    }
    const { connections } = datasetEntryToBuild(badEntry)
    expect(connections).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Real-world entry from dataset.jsonl (proc_0001 — 7 piece build)
// ---------------------------------------------------------------------------

describe('datasetEntryToBuild — real dataset entry (proc_0001)', () => {
  const REAL: DatasetEntry = {
    id: 'proc_0001',
    caption: "A random K'Nex structure with 7 pieces.",
    stability: 71.40172384694472,
    is_stable: true,
    actions: [
      { step: 1, action: 'add_part', part_id: 'connector-4way-green-v1', instance_id: '0806aba9', position: [0, 0, 0], quaternion: [0, 0, 0, 1], color: null },
      { step: 2, action: 'add_part', part_id: 'rod-54-blue-v1', instance_id: 'ab4b13f4', position: [0, 0, 27], quaternion: [0, 0.707, 0, 0.707], color: null },
      { step: 3, action: 'snap', from_port: '0806aba9.center', to_port: 'ab4b13f4.center_axial_2' },
      { step: 4, action: 'add_part', part_id: 'connector-5way-blue-v1', instance_id: 'd8bec2d7', position: [0, 0, -40], quaternion: [0.41, 0.57, 0, 0.707], color: null },
      { step: 5, action: 'snap', from_port: 'ab4b13f4.end2', to_port: 'd8bec2d7.C' },
      { step: 6, action: 'add_part', part_id: 'rod-128-red-v1', instance_id: 'b96b8573', position: [-37, -51, -39], quaternion: [0, 0, 0.45, 0.89], color: null },
      { step: 7, action: 'snap', from_port: 'd8bec2d7.center', to_port: 'b96b8573.center_tangent' },
      { step: 8, action: 'add_part', part_id: 'rod-128-red-v1', instance_id: 'f39cabc4', position: [36, -36, 0], quaternion: [0, 0, 0.92, 0.38], color: null },
      { step: 9, action: 'snap', from_port: '0806aba9.D', to_port: 'f39cabc4.center_axial_1' },
      { step: 10, action: 'add_part', part_id: 'connector-5way-yellow-v1', instance_id: '50c84772', position: [-45, -62, -39], quaternion: [0, 0, -0.64, 0.76], color: null },
      { step: 11, action: 'snap', from_port: 'b96b8573.end1', to_port: '50c84772.D' },
      { step: 12, action: 'add_part', part_id: 'connector-2way-red-v1', instance_id: 'ebc459ba', position: [0, 12.7, 0], quaternion: [0, 0, -1, 0], color: null },
      { step: 13, action: 'snap', from_port: 'ab4b13f4.center_tangent', to_port: 'ebc459ba.B' },
    ],
  }

  it('produces 7 parts', () => {
    expect(countParts(REAL)).toBe(7)
    expect(datasetEntryToBuild(REAL).parts).toHaveLength(7)
  })

  it('produces 6 connections', () => {
    expect(datasetEntryToBuild(REAL).connections).toHaveLength(6)
  })
})
