import { describe, expect, it } from 'vitest'

import type { KnexPartDef } from '../../types/parts'
import { getCompactAutocomplete } from '../topologyCompactAutocomplete'

function makePartDef(id: string, name: string, ports: string[]): KnexPartDef {
  return {
    format_version: '1.1',
    id,
    name,
    category: 'connector',
    mesh_file: `meshes/${id}.glb`,
    default_color: '#ffffff',
    mass_grams: 1,
    ports: ports.map((port) => ({
      id: port,
      position: [0, 0, 0],
      direction: [1, 0, 0],
      mate_type: 'rod_hole',
      accepts: ['rod_end'],
      allowed_angles_deg: [0],
    })),
  }
}

describe('topologyCompactAutocomplete', () => {
  const defs = new Map<string, KnexPartDef>([
    ['connector-4way-green-v1', makePartDef('connector-4way-green-v1', 'Green 4-Way', ['A', 'B', 'C'])],
    ['rod-128-red-v1', makePartDef('rod-128-red-v1', 'Red Rod', ['end1', 'end2'])],
  ])

  it('suggests part ids on part declaration lines', () => {
    const text = 'part c1 conn'
    const result = getCompactAutocomplete(text, text.length, defs)
    expect(result?.suggestions.some((entry) => entry.insertText === 'connector-4way-green-v1')).toBe(true)
  })

  it('suggests available ports for known instance endpoint', () => {
    const text = 'part c1 connector-4way-green-v1\nc1.'
    const result = getCompactAutocomplete(text, text.length, defs)
    expect(result?.suggestions.map((entry) => entry.insertText)).toContain('c1.A')
    expect(result?.suggestions.map((entry) => entry.insertText)).toContain('c1.B')
  })

  it('suggests operators while typing an edge operator', () => {
    const text = 'c1.A -'
    const result = getCompactAutocomplete(text, text.length, defs)
    expect(result?.suggestions.map((entry) => entry.insertText)).toContain('--')
  })

  it('suggests known instances for endpoint start', () => {
    const text = 'part c1 connector-4way-green-v1\npart r1 rod-128-red-v1\nr'
    const result = getCompactAutocomplete(text, text.length, defs)
    expect(result?.suggestions.some((entry) => entry.insertText === 'r1.')).toBe(true)
  })
})
