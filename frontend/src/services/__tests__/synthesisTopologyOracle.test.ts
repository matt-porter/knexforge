import { describe, it, expect } from 'vitest'
import { TopologyOracle } from '../synthesis/topologyOracle'
import { partDefsById } from './partFixtures'
import type { TopologyModel } from '../topologySolver'
import { spinnerTemplate } from '../synthesis/templateCatalog/spinner'

describe('TopologyOracle', () => {
  const oracle = new TopologyOracle(partDefsById)

  it('evaluates a valid topology and returns a solved build', () => {
    const validModel = spinnerTemplate.generate({ requireMotor: true })
    const result = oracle.evaluate(validModel)

    if (!result.isValid) {
      console.log('Failed to evaluate valid model:', result.diagnostics)
    }

    expect(result.isValid).toBe(true)
    if (result.isValid) {
      expect(result.canonicalTopology.format_version).toBe('topology-v1')
      expect(result.solvedBuild.parts.length).toBeGreaterThan(0)
      expect(result.solvedBuild.connections.length).toBeGreaterThan(0)
    }
  })

  it('rejects a topology with an unknown part ID', () => {
    const invalidModel: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'bad_part', part_id: 'fake-part-id-that-does-not-exist' },
      ],
      connections: [],
    }

    const result = oracle.evaluate(invalidModel)

    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.reasonCode).toBe('topology_validation_failed')
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'unknown_part_id',
          }),
        ])
      )
    }
  })

  it('rejects an impossible closed loop', () => {
    // 3 rods of different lengths trying to form a triangle with 90-degree connectors
    const impossibleLoop: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'r1', part_id: 'test-rod-100-v1' },
        { instance_id: 'r2', part_id: 'test-rod-80-v1' },
        { instance_id: 'r3', part_id: 'test-rod-16-v1' },
        { instance_id: 'c1', part_id: 'test-connector-90-v1' },
        { instance_id: 'c2', part_id: 'test-connector-90-v1' },
        { instance_id: 'c3', part_id: 'test-connector-90-v1' },
      ],
      connections: [
        { from: 'c1.A', to: 'r1.end1', joint_type: 'fixed' },
        { from: 'r1.end2', to: 'c2.A', joint_type: 'fixed' },
        { from: 'c2.B', to: 'r2.end1', joint_type: 'fixed' },
        { from: 'r2.end2', to: 'c3.A', joint_type: 'fixed' },
        { from: 'c3.B', to: 'r3.end1', joint_type: 'fixed' },
        { from: 'r3.end2', to: 'c1.B', joint_type: 'fixed' },
      ],
    }

    const result = oracle.evaluate(impossibleLoop)

    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.reasonCode).toBe('topology_solve_failed')
      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics[0].code).toBe('loop_constraint_violation')
    }
  })
})
