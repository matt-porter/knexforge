import { describe, it, expect } from 'vitest'
import { templateCatalog } from '../synthesis/templateCatalog'
import { validateTemplateOutput } from '../synthesis/templates'
import { partDefsById } from './partFixtures'

describe('Synthesis Templates', () => {
  it('catalog contains all baseline mechanism families', () => {
    expect(Object.keys(templateCatalog)).toContain('spinner-v1')
    expect(Object.keys(templateCatalog)).toContain('crank-slider-v1')
    expect(Object.keys(templateCatalog)).toContain('linkage-loop-v1')
    expect(Object.keys(templateCatalog)).toContain('motor-chain-v1')
  })

  describe.each(Object.entries(templateCatalog))('%s', (id, template) => {
    it('has required metadata', () => {
      expect(template.id).toBe(id)
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
    })

    it('generates a valid topology with default parameters', () => {
      const model = template.generate({})
      const { valid, errors } = validateTemplateOutput(model, partDefsById)
      expect(errors).toEqual([])
      expect(valid).toBe(true)
      expect(model.format_version).toBe('topology-v1')
      expect(model.parts.length).toBeGreaterThan(0)
    })

    it('generates a valid topology with requireMotor = false (if applicable)', () => {
      const model = template.generate({ requireMotor: false })
      const { valid, errors } = validateTemplateOutput(model, partDefsById)
      expect(errors).toEqual([])
      expect(valid).toBe(true)
    })

    if (id === 'motor-chain-v1') {
      it('respects chainLength parameter', () => {
        const model3 = template.generate({ chainLength: 3 })
        const { valid: valid3, errors: err3 } = validateTemplateOutput(model3, partDefsById)
        expect(err3).toEqual([])
        expect(valid3).toBe(true)
        // 1 base, 1 base_mount_rod, 1 motor, 3 rods, 3 connectors = 9 parts
        expect(model3.parts.length).toBe(9)
      })
    }
  })
})
