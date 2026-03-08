import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { solveTopology, buildStateToTopology, type TopologyModel, type PartInstance, type Connection } from '../topologySolver'

describe('topologySolver realistic round-trip', () => {
  // Helper to compute world direction of a local vector after rotation using Three.js Quaternion
  function applyRotation(localVec: [number, number, number], quat: [number, number, number, number]): [number, number, number] {
    const v = new Vector3(localVec[0], localVec[1], localVec[2])
    const q = new Quaternion(quat[0], quat[1], quat[2], quat[3])
    
    // Use Three.js Quaternion's applyVector3 method for correct rotation
    const result = v.clone().applyQuaternion(q)
    return [result.x, result.y, result.z]
  }

  it('correctly orients rod when connecting center_tangent_z_neg to connector A port', () => {
    // This simulates the user's bug report: orange 2-way connector with red rod on center_tangent
    
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-2way-orange-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
      ],
      connections: [
        // Rod's center_tangent_z_neg connects to connector's A port (side hole)
        { from: 'c1.A', to: 'r1.center_tangent_z_neg', joint_type: 'fixed' },
      ],
    }

    const partDefsById = new Map<string, any>()
    
    // Orange 2-way connector - A port points along +X
    partDefsById.set('connector-2way-orange-v1', {
      id: 'connector-2way-orange-v1',
      category: 'connector' as const,
      ports: [
        {
          id: 'A',
          position: [12.7, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0], // Points along +X
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end', 'rod_side'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
      ],
    })

    // Red rod - center_tangent_z_neg points along -Z (tangent to rod's main axis)
    partDefsById.set('rod-128-red-v1', {
      id: 'rod-128-red-v1',
      category: 'rod' as const,
      ports: [
        {
          id: 'center_tangent_z_neg',
          position: [64.0, 0.0, 0.0],
          direction: [0.0, 0.0, -1.0], // Points along -Z (tangent)
          mate_type: 'rod_side' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
        },
      ],
    })

    const solved = solveTopology(model, partDefsById)
    const r1 = solved.parts.find((p) => p.instance_id === 'r1')!
    
    // The rod's center_tangent_z_neg port direction should point opposite to connector A
    // Connector A points +X, so the tangent port should point -X in world space
    
    const [tx, ty, tz] = r1.rotation
    const localTangentDir: [number, number, number] = [0.0, 0.0, -1.0]
    const worldTangentDir = applyRotation(localTangentDir, r1.rotation)
    
    console.log('Rod rotation:', r1.rotation)
    console.log('Local tangent dir:', localTangentDir)
    console.log('World tangent dir:', worldTangentDir)
    
    // The tangent direction should be approximately [-1, 0, 0] (opposite to connector A's +X)
    expect(Math.abs(worldTangentDir[0] - (-1.0))).toBeLessThan(0.1)
    expect(Math.abs(worldTangentDir[1])).toBeLessThan(0.1)
    expect(Math.abs(worldTangentDir[2])).toBeLessThan(0.1)
    
    // Most importantly: the rod's MAIN AXIS (local X [1, 0, 0]) should be PERPENDICULAR 
    // to the connector hole direction (+X). This means the main axis should point in Y or Z.
    const localMainAxis: [number, number, number] = [1.0, 0.0, 0.0]
    const worldMainAxis = applyRotation(localMainAxis, r1.rotation)
    
    console.log('Local main axis:', localMainAxis)
    console.log('World main axis:', worldMainAxis)
    
    // Main axis should be perpendicular to +X (dot product ≈ 0)
    const dotProduct = worldMainAxis[0] * 1.0 + worldMainAxis[1] * 0.0 + worldMainAxis[2] * 0.0
    expect(Math.abs(dotProduct)).toBeLessThan(0.1, 
      `Rod main axis should be perpendicular to connector hole direction, but dot product is ${dotProduct}`)
    
    // The bug would manifest as the main axis being parallel to +X (dot ≈ 1), which means
    // the rod is rotated 90° incorrectly and its tangent port lies in the same plane as the rod.
  })

  it('correctly handles red 3-way connector with center_tangent connection', () => {
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-3way-red-v1' },
        { instance_id: 'r1', part_id: 'rod-86-yellow-v1' },
      ],
      connections: [
        // Connect rod to center hole of 3-way connector (port C)
        { from: 'c1.C', to: 'r1.end1', joint_type: 'fixed' },
      ],
    }

    const partDefsById = new Map<string, any>()
    
    // Red 3-way connector - port C points along +Y
    partDefsById.set('connector-3way-red-v1', {
      id: 'connector-3way-red-v1',
      category: 'connector' as const,
      ports: [
        {
          id: 'C',
          position: [0.0, 12.7, 0.0],
          direction: [0.0, 1.0, 0.0], // Points along +Y
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
      ],
    })

    // Yellow rod - end1 points along -X
    partDefsById.set('rod-86-yellow-v1', {
      id: 'rod-86-yellow-v1',
      category: 'rod' as const,
      ports: [
        {
          id: 'end1',
          position: [0.0, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0], // Points along -X
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
        },
      ],
    })

    const solved = solveTopology(model, partDefsById)
    const r1 = solved.parts.find((p) => p.instance_id === 'r1')!
    
    // Rod end1 should point opposite to connector C (+Y), so -Y in world space
    const [tx, ty, tz, tw] = r1.rotation
    const localEndDir: [number, number, number] = [-1.0, 0.0, 0.0]
    const worldEndDir = applyRotation(localEndDir, r1.rotation)
    
    console.log('3-way connector - Rod rotation:', r1.rotation)
    console.log('Local end dir:', localEndDir)
    console.log('World end dir:', worldEndDir)
    
    // End direction should be approximately [0, -1, 0] (opposite to +Y)
    expect(Math.abs(worldEndDir[0])).toBeLessThan(0.1)
    expect(Math.abs(worldEndDir[1] - (-1.0))).toBeLessThan(0.1)
    expect(Math.abs(worldEndDir[2])).toBeLessThan(0.1)
  })

  it('handles all three ports of 3-way connector correctly', () => {
    const partDefsById = new Map<string, any>()
    
    // Red 3-way connector with all three side ports
    partDefsById.set('connector-3way-red-v1', {
      id: 'connector-3way-red-v1',
      category: 'connector' as const,
      ports: [
        {
          id: 'A',
          position: [12.7, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0], // +X
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
        {
          id: 'B',
          position: [8.98, 8.98, 0.0],
          direction: [0.707, 0.707, 0.0], // +45° in XY plane
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
        {
          id: 'C',
          position: [0.0, 12.7, 0.0],
          direction: [0.0, 1.0, 0.0], // +Y
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
      ],
    })

    partDefsById.set('rod-86-yellow-v1', {
      id: 'rod-86-yellow-v1',
      category: 'rod' as const,
      ports: [
        {
          id: 'end1',
          position: [0.0, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0], // -X
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
        },
      ],
    })

    // Test each port individually
    for (const portId of ['A', 'B', 'C'] as const) {
      const model: TopologyModel = {
        format_version: 'topology-v1',
        parts: [
          { instance_id: 'c1', part_id: 'connector-3way-red-v1' },
          { instance_id: 'r1', part_id: 'rod-86-yellow-v1' },
        ],
        connections: [
          { from: `c1.${portId}`, to: 'r1.end1', joint_type: 'fixed' },
        ],
      }

      const solved = solveTopology(model, partDefsById)
      const r1 = solved.parts.find((p) => p.instance_id === 'r1')!
      
      // Get the connector port's world direction (connector is at origin with identity rotation)
      let expectedRodDir: [number, number, number]
      if (portId === 'A') expectedRodDir = [-1.0, 0.0, 0.0] // Opposite of +X
      else if (portId === 'B') expectedRodDir = [-0.707, -0.707, 0.0] // Opposite of +45°
      else expectedRodDir = [0.0, -1.0, 0.0] // Opposite of +Y
      
      const localEndDir: [number, number, number] = [-1.0, 0.0, 0.0]
      const worldEndDir = applyRotation(localEndDir, r1.rotation)
      
      console.log(`Port ${portId}: expected rod dir`, expectedRodDir, 'got', worldEndDir)
      
      // Rod end should point opposite to connector port direction
      expect(Math.abs(worldEndDir[0] - expectedRodDir[0])).toBeLessThan(0.1)
      expect(Math.abs(worldEndDir[1] - expectedRodDir[1])).toBeLessThan(0.1)
      expect(Math.abs(worldEndDir[2] - expectedRodDir[2])).toBeLessThan(0.1)
    }
  })
})
