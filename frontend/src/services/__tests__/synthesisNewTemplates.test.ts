import { describe, it, expect } from 'vitest'
import { ferrisWheelTemplate } from '../synthesis/templateCatalog/ferrisWheel'
import { vehicleChassisTemplate } from '../synthesis/templateCatalog/vehicleChassis'
import { towerBridgeTemplate } from '../synthesis/templateCatalog/towerBridge'
import { craneTemplate } from '../synthesis/templateCatalog/crane'
import { windmillTemplate } from '../synthesis/templateCatalog/windmill'
import { templateCatalog } from '../synthesis/templateCatalog'
import { validateTemplateOutput } from '../synthesis/templates'
import { TopologyOracle } from '../synthesis/topologyOracle'
import { partDefsById } from './partFixtures'

const NEW_TEMPLATES = [
  ferrisWheelTemplate,
  vehicleChassisTemplate,
  towerBridgeTemplate,
  craneTemplate,
  windmillTemplate,
] as const

const MIN_PARTS_FOR_NEW_TEMPLATES = 15

describe('Phase 16.1 — New Synthesis Templates', () => {
  it('catalog contains all 9 templates (4 original + 5 new)', () => {
    const ids = Object.keys(templateCatalog)
    expect(ids).toContain('spinner-v1')
    expect(ids).toContain('crank-slider-v1')
    expect(ids).toContain('linkage-loop-v1')
    expect(ids).toContain('motor-chain-v1')
    expect(ids).toContain('ferris-wheel-v1')
    expect(ids).toContain('vehicle-chassis-v1')
    expect(ids).toContain('tower-bridge-v1')
    expect(ids).toContain('crane-v1')
    expect(ids).toContain('windmill-v1')
    expect(ids).toHaveLength(9)
  })

  describe.each(NEW_TEMPLATES.map(t => [t.id, t] as const))('%s', (_id, template) => {
    it('has required metadata', () => {
      expect(template.id).toBeTruthy()
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
    })

    it('generates a valid topology with default parameters', () => {
      const model = template.generate({})
      const { valid, errors } = validateTemplateOutput(model, partDefsById)
      expect(errors).toEqual([])
      expect(valid).toBe(true)
      expect(model.format_version).toBe('topology-v1')
    })

    it(`generates at least ${MIN_PARTS_FOR_NEW_TEMPLATES} parts`, () => {
      const model = template.generate({})
      expect(model.parts.length).toBeGreaterThanOrEqual(MIN_PARTS_FOR_NEW_TEMPLATES)
    })

    it('generates a valid topology with requireMotor = false', () => {
      const model = template.generate({ requireMotor: false })
      const { valid, errors } = validateTemplateOutput(model, partDefsById)
      expect(errors).toEqual([])
      expect(valid).toBe(true)
    })

    it('generates topologies that pass the topology oracle', () => {
      const oracle = new TopologyOracle(partDefsById)
      const model = template.generate({})
      const result = oracle.evaluate(model)
      expect(result.isValid).toBe(true)
    })

    it('uses only part IDs that exist in the part library', () => {
      const model = template.generate({})
      for (const part of model.parts) {
        expect(partDefsById.has(part.part_id)).toBe(true)
      }
    })
  })

  // Template-specific parameter tests
  describe('Ferris Wheel', () => {
    it('respects spokeCount parameter', () => {
      const model4 = ferrisWheelTemplate.generate({ spokeCount: 4 })
      const model6 = ferrisWheelTemplate.generate({ spokeCount: 6 })
      expect(model6.parts.length).toBeGreaterThan(model4.parts.length)
    })
  })

  describe('Tower/Bridge', () => {
    it('respects panelCount parameter', () => {
      const model2 = towerBridgeTemplate.generate({ panelCount: 2 })
      const model4 = towerBridgeTemplate.generate({ panelCount: 4 })
      expect(model4.parts.length).toBeGreaterThan(model2.parts.length)
    })
  })

  describe('Windmill', () => {
    it('respects bladeCount parameter', () => {
      const model3 = windmillTemplate.generate({ bladeCount: 3 })
      const model5 = windmillTemplate.generate({ bladeCount: 5 })
      expect(model5.parts.length).toBeGreaterThan(model3.parts.length)
    })
  })
})
