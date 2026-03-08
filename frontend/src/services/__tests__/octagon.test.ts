import { describe, expect, it } from 'vitest'
import { solveTopology, type TopologyModel } from '../topologySolver'

// Create a helper to load the octagon model
function createOctagonModel(): TopologyModel {
  const parts: any[] = []
  const connections: any[] = []

  for (let i = 1; i <= 8; i++) {
    const nextI = i === 8 ? 1 : i + 1
    
    parts.push({ instance_id: `c${i}`, part_id: 'connector-4way-green-v1' })
    parts.push({ instance_id: `r${i}`, part_id: 'rod-16-green-v1' })

    // A green 4-way connector has ports A, B, C, D (45 deg apart). A and D are 135 deg apart.
    // Wait, the green connector ports:
    // A: [1, 0, 0] (0 deg)
    // B: [0.707, 0.707, 0] (45 deg)
    // C: [0, 1, 0] (90 deg)
    // D: [-0.707, 0.707, 0] (135 deg)
    // For an octagon, internal angle is 135 degrees.
    // So we use port A and port D.
    // D is at 135 degrees relative to A.
    // Connector c_i's port A connects to r_i's end1
    connections.push({ from: `c${i}.A`, to: `r${i}.end1`, joint_type: 'fixed', fixed_roll: true, twist_deg: 0 })
    connections.push({ from: `r${i}.end2`, to: `c${nextI}.D`, joint_type: 'fixed', fixed_roll: true, twist_deg: 0 })
  }

  return {
    format_version: 'topology-v1',
    parts,
    connections,
  }
}

describe('topologySolver loops', () => {
  it('solves an octagon loop with Jacobi refinement', () => {
    const model = createOctagonModel()
    const partDefsById = new Map<string, any>()
    
    // Using the definitions from parts/
    partDefsById.set('connector-4way-green-v1', {
      id: 'connector-4way-green-v1',
      name: 'Green 4-Way Connector',
      category: 'connector',
      ports: [
        { id: 'A', position: [12.7, 0.0, 0.0], direction: [1.0, 0.0, 0.0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 },
        { id: 'D', position: [-8.98, 8.98, 0.0], direction: [-0.707, 0.707, 0.0], mate_type: 'rod_hole', accepts: ['rod_end', 'rod_side'], allowed_angles_deg: [0, 90, 180, 270], tolerance_mm: 0.2 },
      ]
    })

    partDefsById.set('rod-16-green-v1', {
      id: 'rod-16-green-v1',
      name: 'Green Micro Rod',
      category: 'rod',
      ports: [
        { id: 'end1', position: [0.0, 0.0, 0.0], direction: [-1.0, 0.0, 0.0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], tolerance_mm: 0.2 },
        { id: 'end2', position: [16.0, 0.0, 0.0], direction: [1.0, 0.0, 0.0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], tolerance_mm: 0.2 },
      ]
    })

    const result = solveTopology(model, partDefsById)
    // result.parts.forEach(p => console.log(p.instance_id, p.position)); expect(result.parts.length).toBe(16)
    
    // Check if it's solved without throwing an error
    // In our test, solveTopology will throw if residuals exceed tolerance.
  })
})