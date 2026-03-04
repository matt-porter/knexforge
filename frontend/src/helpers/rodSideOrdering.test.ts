import { describe, expect, it } from 'vitest'

const LEGACY_ROD_SIDE_PORT_ID = 'center_tangent'

function normalizeRodSidePortId(portId: string): string {
  return portId === LEGACY_ROD_SIDE_PORT_ID ? 'center_tangent_y_pos' : portId
}

function rodSideSortRank(sideId: string): number {
  switch (sideId) {
    case 'center_tangent_y_pos':
      return 0
    case 'center_tangent_y_neg':
      return 1
    case 'center_tangent_z_pos':
      return 2
    case 'center_tangent_z_neg':
      return 3
    default:
      return 100
  }
}

describe('rod-side ordering regressions', () => {
  it('normalizes legacy center_tangent to +Y side', () => {
    expect(normalizeRodSidePortId('center_tangent')).toBe('center_tangent_y_pos')
  })

  it('keeps explicit side IDs unchanged', () => {
    expect(normalizeRodSidePortId('center_tangent_y_neg')).toBe('center_tangent_y_neg')
    expect(normalizeRodSidePortId('center_tangent_z_pos')).toBe('center_tangent_z_pos')
    expect(normalizeRodSidePortId('center_tangent_z_neg')).toBe('center_tangent_z_neg')
  })

  it('sorts sides in deterministic cycle order (+Y, -Y, +Z, -Z)', () => {
    const sides = [
      'center_tangent_z_neg',
      'center_tangent_y_neg',
      'center_tangent_z_pos',
      'center_tangent_y_pos',
    ]

    sides.sort((a, b) => {
      const rank = rodSideSortRank(a) - rodSideSortRank(b)
      if (rank !== 0) return rank
      return a.localeCompare(b)
    })

    expect(sides).toEqual([
      'center_tangent_y_pos',
      'center_tangent_y_neg',
      'center_tangent_z_pos',
      'center_tangent_z_neg',
    ])
  })
})
