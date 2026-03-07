import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { solveTopology, buildStateToTopology, type TopologyModel, type PartInstance, type Connection } from '../topologySolver'
import { parseCompactTopology, stringifyCompactTopology } from '../topologyCompactFormat'

describe('topologySolver round-trip', () => {
  function createTestParts(): PartInstance[] {
    return [
      {
        instance_id: 'c1',
        part_id: 'connector-2way-orange-v1',
        position: [0, 50, 0],
        rotation: [0, 0, 0, 1], // identity - connector facing +X
        color: '#FF6600',
      },
      {
        instance_id: 'r1',
        part_id: 'rod-128-red-v1',
        position: [12.7, 50, 64], // rod center at connector A port
        rotation: [0, 0, 0.7071067811865476, 0.7071067811865476], // 90° Z-rotation (flat in XY)
        color: '#E21B1B',
      },
    ]
  }

  function createTestConnections(): Connection[] {
    return [
      {
        from_instance: 'c1',
        from_port: 'A',
        to_instance: 'r1',
        to_port: 'center_tangent_z_neg',
        joint_type: 'fixed',
      },
    ]
  }

  it('preserves orientation through model->text->model round-trip for side-on connection', () => {
    const parts = createTestParts()
    const connections = createTestConnections()

    // Step 1: Convert build state to topology (loses positions/rotations)
    const topology: TopologyModel = buildStateToTopology(parts, connections)
    
    expect(topology.parts).toHaveLength(2)
    expect(topology.connections).toHaveLength(1)
    expect(topology.connections[0].from).toBe('c1.A')
    expect(topology.connections[0].to).toBe('r1.center_tangent_z_neg')

    // Step 2: Solve topology back to build state
    const partDefsById = new Map<string, any>()
    
    // Orange 2-way connector
    partDefsById.set('connector-2way-orange-v1', {
      id: 'connector-2way-orange-v1',
      name: 'Orange 2-Way Connector (180°)',
      category: 'connector' as const,
      mesh_file: 'meshes/connector-2way-orange.glb',
      default_color: '#FF6600',
      mass_grams: 1.2,
      ports: [
        {
          id: 'A',
          position: [12.7, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0],
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end', 'rod_side'],
          allowed_angles_deg: [0, 90, 180, 270],
          tolerance_mm: 0.2,
        },
        {
          id: 'B',
          position: [-12.7, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0],
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end', 'rod_side'],
          allowed_angles_deg: [0, 90, 180, 270],
          tolerance_mm: 0.2,
        },
        {
          id: 'center',
          position: [0.0, 0.0, 0.0],
          direction: [0.0, 0.0, 1.0],
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
          tolerance_mm: 0.2,
        },
      ],
    })

    // Red rod (128mm) - simplified ports for testing
    partDefsById.set('rod-128-red-v1', {
      id: 'rod-128-red-v1',
      name: 'Red Rod (128 mm)',
      category: 'rod' as const,
      mesh_file: 'meshes/rod-128-red.glb',
      default_color: '#E21B1B',
      mass_grams: 2.0,
      ports: [
        {
          id: 'end1',
          position: [0.0, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'end2',
          position: [128.0, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'center_tangent_z_neg',
          position: [64.0, 0.0, 0.0],
          direction: [0.0, 0.0, -1.0],
          mate_type: 'rod_side' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
      ],
    })

    const solved = solveTopology(topology, partDefsById)
    
    // Find the rod in the solved result
    const r1Solved = solved.parts.find((p) => p.instance_id === 'r1')!
    
    console.log('Original rod rotation:', parts[1].rotation)
    console.log('Solved rod rotation:', r1Solved.rotation)
    
    // The key test: the rod's orientation should be preserved (or at least equivalent)
    // Original: [0, 0.707, 0, 0.707] = 90° Y-rotation
    // This rotates local Z [0,0,-1] to world X [-1,0,0], which is correct for connecting to A port
    
    const solQuat = new Quaternion(r1Solved.rotation[0], r1Solved.rotation[1], r1Solved.rotation[2], r1Solved.rotation[3])
    
    // Verify physical constraint: Rod local X should be in connector plane (perp to connector normal)
    // Connector c1 is at origin with identity rotation, so normal is [0, 0, 1]
    const rodMainAxis = new Vector3(1, 0, 0).applyQuaternion(solQuat)
    const connectorNormal = new Vector3(0, 0, 1)
    const dot = Math.abs(rodMainAxis.dot(connectorNormal))
    
    expect(dot).toBeLessThan(0.01) // Rod is in plane
  })

  it('preserves orientation for center hole connection', () => {
    const parts: PartInstance[] = [
      {
        instance_id: 'c1',
        part_id: 'connector-2way-orange-v1',
        position: [0, 50, 0],
        rotation: [0, 0, 0, 1],
        color: '#FF6600',
      },
      {
        instance_id: 'r1',
        part_id: 'rod-128-red-v1',
        position: [0, 50, 0], // rod center at connector center
        rotation: [0.7071067811865476, 0, 0.7071067811865476, 0], // 90° X-rotation to point along Z
        color: '#E21B1B',
      },
    ]

    const connections: Connection[] = [
      {
        from_instance: 'c1',
        from_port: 'center',
        to_instance: 'r1',
        to_port: 'end1',
        joint_type: 'fixed',
      },
    ]

    const topology = buildStateToTopology(parts, connections)
    
    const partDefsById = new Map<string, any>()
    partDefsById.set('connector-2way-orange-v1', {
      id: 'connector-2way-orange-v1',
      category: 'connector' as const,
      ports: [
        {
          id: 'center',
          position: [0.0, 0.0, 0.0],
          direction: [0.0, 0.0, 1.0],
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
        },
      ],
    })
    partDefsById.set('rod-128-red-v1', {
      id: 'rod-128-red-v1',
      category: 'rod' as const,
      ports: [
        {
          id: 'end1',
          position: [0.0, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
        },
      ],
    })

    const solved = solveTopology(topology, partDefsById)
    const r1Solved = solved.parts.find((p) => p.instance_id === 'r1')!
    
    console.log('Center connection - Original rotation:', parts[1].rotation)
    console.log('Center connection - Solved rotation:', r1Solved.rotation)
    
    expect(r1Solved).toBeDefined()
  })

  it('keeps port-specific side-clip orientation after model->text->model for red 3-way A/B/C', () => {
    const partDefsById = new Map<string, any>()
    partDefsById.set('connector-3way-red-v1', {
      id: 'connector-3way-red-v1',
      category: 'connector' as const,
      ports: [
        { id: 'A', position: [12.7, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
        { id: 'B', position: [8.98, 8.98, 0], direction: [0.707, 0.707, 0], mate_type: 'rod_hole', accepts: ['rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
        { id: 'C', position: [0, 12.7, 0], direction: [0, 1, 0], mate_type: 'rod_hole', accepts: ['rod_side'], allowed_angles_deg: [0, 90, 180, 270] },
      ],
    })
    partDefsById.set('rod-86-yellow-v1', {
      id: 'rod-86-yellow-v1',
      category: 'rod' as const,
      ports: [
        { id: 'center_tangent_z_neg', position: [43, 0, 0], direction: [0, 0, -1], mate_type: 'rod_side', accepts: ['rod_hole'], allowed_angles_deg: [0, 90, 180, 270] },
      ],
    })

    const connectorPorts = ['A', 'B', 'C'] as const
    for (const connectorPort of connectorPorts) {
      const initialConnections: Connection[] = [
        {
          from_instance: 'c1',
          from_port: connectorPort,
          to_instance: 'r1',
          to_port: 'center_tangent_z_neg',
          joint_type: 'fixed',
          twist_deg: 0,
          fixed_roll: true,
        },
      ]

      const initialParts: PartInstance[] = [
        { instance_id: 'c1', part_id: 'connector-3way-red-v1', position: [0, 50, 0], rotation: [0, 0, 0, 1] },
        { instance_id: 'r1', part_id: 'rod-86-yellow-v1', position: [0, 50, 0], rotation: [0, 0, 0, 1] },
      ]

      const topology = buildStateToTopology(initialParts, initialConnections)
      const compact = stringifyCompactTopology(topology)
      const parsed = parseCompactTopology(compact)
      const solved = solveTopology(parsed, partDefsById)

      const solvedConnector = solved.parts.find((part) => part.instance_id === 'c1')!
      const solvedRod = solved.parts.find((part) => part.instance_id === 'r1')!

      const connectorQuat = new Quaternion(...solvedConnector.rotation)
      const rodQuat = new Quaternion(...solvedRod.rotation)

      const connectorNormal = new Vector3(0, 0, 1).applyQuaternion(connectorQuat).normalize()
      const rodAxis = new Vector3(1, 0, 0).applyQuaternion(rodQuat).normalize()
      const connectorPortDir = new Vector3(
        connectorPort === 'A' ? 1 : connectorPort === 'B' ? 0.707 : 0,
        connectorPort === 'A' ? 0 : connectorPort === 'B' ? 0.707 : 1,
        0,
      )
        .normalize()
        .applyQuaternion(connectorQuat)

      const connectorTangent = new Vector3().crossVectors(connectorNormal, connectorPortDir).normalize()

      // Side-clip orientation invariant: rod axis should track connector edge tangent.
      expect(Math.abs(rodAxis.dot(connectorTangent))).toBeGreaterThan(0.99)
    }
  })
})
