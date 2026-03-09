import { describe, it, expect } from 'vitest'
import { parseCompactTopology, stringifyCompactTopology } from '../topologyCompactFormat'
import { solveTopology } from '../topologySolver'
import type { KnexPartDef } from '../../types/parts'

describe('slide_offset frontend integration', () => {
  const partDefs = new Map<string, any>()
  partDefs.set('rr', {
    id: 'rr',
    category: 'rod',
    ports: [
      { id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], slide_clearance_mm: 15.0 },
      { id: 'end2', position: [128, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], slide_clearance_mm: 15.0 },
      { id: 'center_axial_1', position: [64, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], slide_clearance_mm: 15.0 },
    ]
  })
  partDefs.set('cg', {
    id: 'cg',
    category: 'connector',
    ports: [
      { id: 'A', position: [12, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0] }
    ]
  })

  it('compact format parsing and emitting', () => {
    const text = `part r1 rr\npart c1 cg\nr1.center_axial_1 -- c1.A @ 90! slide=+25`
    const parsed = parseCompactTopology(text)
    
    expect(parsed.connections[0].slide_offset).toBe(25)
    expect(parsed.connections[0].twist_deg).toBe(90)
    expect(parsed.connections[0].fixed_roll).toBe(true)

    const emitted = stringifyCompactTopology(parsed)
    expect(emitted).toContain('@ 90! slide=+25')
  })

  it('topology solver with slide offset', () => {
    const model = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: 'r1', part_id: 'rr' },
        { instance_id: 'c1', part_id: 'cg' },
      ],
      connections: [
        { from: 'r1.center_axial_1', to: 'c1.A', joint_type: 'revolute' as const, slide_offset: 20 },
      ]
    }

    const { parts, warnings } = solveTopology(model, partDefs)
    expect(warnings.length).toBe(0)
    
    const r1 = parts.find(p => p.instance_id === 'r1')!
    const c1 = parts.find(p => p.instance_id === 'c1')!
    
    // Check relative distance. r1 center is at 64. offset is 20 -> 84.
    // c1 center is at 12 from its port.
    // The relative distance between part origins should be 84 - 12 = 72
    const dx = c1.position[0] - r1.position[0]
    const dy = c1.position[1] - r1.position[1]
    const dz = c1.position[2] - r1.position[2]
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
    
    expect(dist).toBeCloseTo(72, 1)
  })
})
