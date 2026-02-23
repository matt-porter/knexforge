import { describe, it, expect } from 'vitest'
import { getMeshCorrection, needsMeshCorrection } from '../helpers/meshCorrection'
import type { KnexPartDef } from '../types/parts'

function makePartDef(overrides: Partial<KnexPartDef> = {}): KnexPartDef {
  return {
    format_version: '1.0',
    id: 'test-part',
    name: 'Test Part',
    category: 'connector',
    mesh_file: 'meshes/test.glb',
    default_color: '#FF0000',
    mass_grams: 1.0,
    ports: [
      { id: 'A', position: [12.5, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0] },
    ],
    ...overrides,
  }
}

describe('meshCorrection', () => {
  describe('needsMeshCorrection', () => {
    it('returns true for rods', () => {
      const def = makePartDef({ category: 'rod' })
      expect(needsMeshCorrection(def)).toBe(true)
    })

    it('returns false for connectors', () => {
      const def = makePartDef({ category: 'connector' })
      expect(needsMeshCorrection(def)).toBe(false)
    })

    it('returns false for wheels', () => {
      const def = makePartDef({ category: 'wheel' })
      expect(needsMeshCorrection(def)).toBe(false)
    })
  })

  describe('getMeshCorrection', () => {
    it('returns identity for connectors', () => {
      const def = makePartDef({ category: 'connector' })
      const correction = getMeshCorrection(def)

      expect(correction.position.x).toBeCloseTo(0)
      expect(correction.position.y).toBeCloseTo(0)
      expect(correction.position.z).toBeCloseTo(0)
      expect(correction.rotation.x).toBeCloseTo(0)
      expect(correction.rotation.y).toBeCloseTo(0)
      expect(correction.rotation.z).toBeCloseTo(0)
    })

    it('returns -90° Y rotation for rods', () => {
      const def = makePartDef({
        category: 'rod',
        ports: [
          { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
          { id: 'end2', position: [55, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
        ],
      })
      const correction = getMeshCorrection(def)

      // Should rotate -90° around Y
      expect(correction.rotation.y).toBeCloseTo(-Math.PI / 2)
      expect(correction.rotation.x).toBeCloseTo(0)
      expect(correction.rotation.z).toBeCloseTo(0)
    })

    it('translates rod by half-length along X', () => {
      const def = makePartDef({
        category: 'rod',
        ports: [
          { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
          { id: 'end2', position: [55, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
        ],
      })
      const correction = getMeshCorrection(def)

      // Should translate by L/2 = 27.5 along X
      expect(correction.position.x).toBeCloseTo(27.5)
      expect(correction.position.y).toBeCloseTo(0)
      expect(correction.position.z).toBeCloseTo(0)
    })

    it('computes correct translation for different rod lengths', () => {
      const def17 = makePartDef({
        category: 'rod',
        ports: [
          { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
          { id: 'end2', position: [17, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
        ],
      })
      expect(getMeshCorrection(def17).position.x).toBeCloseTo(8.5)

      const def192 = makePartDef({
        category: 'rod',
        ports: [
          { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
          { id: 'end2', position: [192, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0] },
        ],
      })
      expect(getMeshCorrection(def192).position.x).toBeCloseTo(96)
    })
  })
})
