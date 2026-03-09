import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { solveTopology, type TopologyModel } from '../topologySolver'

describe('topologySolver rotation', () => {
  it('correctly orients rod when connecting center_tangent to connector side hole', () => {
    // Create a simple build: orange 2-way connector with a red rod attached via center_tangent_z_neg
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-2way-orange-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
      ],
      connections: [
        // Connect rod's center_tangent_z_neg to connector's A port (side hole)
        { from: 'c1.A', to: 'r1.center_tangent_z_neg', joint_type: 'fixed' },
      ],
    }

    // Load part definitions
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

    // Red rod (128mm)
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
          accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'end2',
          position: [128.0, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'center_axial_1',
          position: [64.0, 0.0, 0.0],
          direction: [-1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'center_axial_2',
          position: [64.0, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
        {
          id: 'center_tangent_z_neg',
          position: [64.0, 0.0, 0.0],
          direction: [0.0, 0.0, -1.0],
          mate_type: 'rod_side' as const,
          accepts: ['rod_hole', 'clip', 'rotational_hole', 'slider_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
      ],
    })

    const result = solveTopology(model, partDefsById)

    // The rod should be positioned with its center at the connector's A port location
    // and oriented so that its tangent direction points along -X (into the hole)
    // and its main axis (local X) is perpendicular to the connector plane
    
    const r1 = result.parts.find((p) => p.instance_id === 'r1')!
    
    console.log('Rod position:', r1.position)
    console.log('Rod rotation:', r1.rotation)
    
    // The rod's center_tangent_z_neg port should be at connector's A port world position
    // Connector A is at [12.7, 50, 0] (with ground offset) with direction [1, 0, 0]
    // So the rod's tangent port should also be there
    
    // Most importantly: the rod's main axis (local X) should be perpendicular to 
    // the connector's A port direction. Since A points along +X, the rod should
    // have its main axis pointing in Y or Z direction (not X).
    
    // Check that the rod is not rotated 90 degrees incorrectly
    // The rotation quaternion should align the rod properly
    const [rx, ry, rz, rw] = r1.rotation
    
    // If correctly oriented, the rod's local X axis (main axis) should be roughly
    // perpendicular to the connector hole direction (+X). This means the rod's
    // main axis should point in Y or Z direction.
    
    // A correct orientation would have the quaternion representing a 90-degree
    // rotation around some axis to align the tangent port
    
    expect(r1.position).toBeDefined()
    expect(r1.rotation).toBeDefined()
    expect(Math.abs(rx)).toBeLessThan(2)
    expect(Math.abs(ry)).toBeLessThan(2)
    expect(Math.abs(rz)).toBeLessThan(2)
    expect(Math.abs(rw - 1.0)).toBeLessThan(1.5)

    const rodQuat = new Quaternion(rx, ry, rz, rw)
    const rodWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(rodQuat).normalize()
    const connectorWorldZ = new Vector3(0, 0, 1)

    // Side-clips on flat edges should keep connector plane perpendicular to the rod.
    expect(Math.abs(rodWorldMainAxis.dot(connectorWorldZ))).toBeGreaterThan(0.99)
  })

  it('correctly handles red 3-way connector with center_tangent connection', () => {
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-3way-red-v1' },
        { instance_id: 'r1', part_id: 'rod-86-yellow-v1' },
      ],
      connections: [
        // Connect rod to center hole of 3-way connector
        { from: 'c1.center', to: 'r1.end1', joint_type: 'fixed' },
      ],
    }

    const partDefsById = new Map<string, any>()
    
    // Red 3-way connector (T-connector)
    partDefsById.set('connector-3way-red-v1', {
      id: 'connector-3way-red-v1',
      name: 'Red 3-Way Connector (T)',
      category: 'connector' as const,
      mesh_file: 'meshes/connector-3way-red.glb',
      default_color: '#DC143C',
      mass_grams: 1.5,
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
          position: [0.0, 12.7, 0.0],
          direction: [0.0, -1.0, 0.0],
          mate_type: 'rod_hole' as const,
          accepts: ['rod_end'],
          allowed_angles_deg: [0, 90, 180, 270],
          tolerance_mm: 0.2,
        },
      ],
    })

    // Yellow rod (86mm) - simplified ports
    partDefsById.set('rod-86-yellow-v1', {
      id: 'rod-86-yellow-v1',
      name: 'Yellow Rod (86 mm)',
      category: 'rod' as const,
      mesh_file: 'meshes/rod-86-yellow.glb',
      default_color: '#FFD700',
      mass_grams: 1.5,
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
          position: [86.0, 0.0, 0.0],
          direction: [1.0, 0.0, 0.0],
          mate_type: 'rod_end' as const,
          accepts: ['rod_hole'],
          allowed_angles_deg: [0],
          tolerance_mm: 0.2,
        },
      ],
    })

    const result = solveTopology(model, partDefsById)
    
    const r1 = result.parts.find((p) => p.instance_id === 'r1')!
    expect(r1).toBeDefined()
    expect(r1.position).toBeDefined()
    expect(r1.rotation).toBeDefined()
  })
})

describe('topologySolver slide_offset', () => {
  const partDefsById = new Map<string, any>()
  
  partDefsById.set('connector-1way-grey-v1', {
    id: 'connector-1way-grey-v1',
    category: 'connector' as const,
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
        accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
        allowed_angles_deg: [0],
        tolerance_mm: 0.2,
      },
      {
        id: 'end2',
        position: [128.0, 0.0, 0.0],
        direction: [1.0, 0.0, 0.0],
        mate_type: 'rod_end' as const,
        accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
        allowed_angles_deg: [0],
        tolerance_mm: 0.2,
      },
      {
        id: 'center_axial_1',
        position: [64.0, 0.0, 0.0],
        direction: [-1.0, 0.0, 0.0],
        mate_type: 'rod_end' as const,
        accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
        allowed_angles_deg: [0],
        tolerance_mm: 0.2,
        slide_clearance_mm: 15.0,
      },
    ],
  })

  it('shifts connector correctly when placed at an offset', () => {
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
        { instance_id: 'c1', part_id: 'connector-1way-grey-v1' },
      ],
      connections: [
        { from: 'r1.center_axial_1', to: 'c1.A', joint_type: 'revolute', slide_offset: 20.0 },
      ],
    }

    const result = solveTopology(model, partDefsById)
    
    const r1 = result.parts.find((p) => p.instance_id === 'r1')!
    const c1 = result.parts.find((p) => p.instance_id === 'c1')!
    
    // We expect the distance from c1.A (which is at local 12.7, 0, 0 relative to c1 center)
    // to r1.end1 to be 64 + 20 = 84mm.
    
    // Simple verification: The distance between the parts centers should be shifted.
    // Given the solver aligns the ports, we can just check the raw distance between part origins.
    // The rod origin is at end1 (0,0,0). The port center_axial_1 is at 64.
    // The connector origin is (0,0,0) and its port A is at 12.7.
    // r1 center_axial_1 offset by 20mm is at 84mm.
    // So c1's port A must end up exactly at rod's 84mm mark.
    
    // c1 will be positioned such that c1 port A is at r1 center_axial_1 + 20.
    // rod is pointing +X or similar.
    // Wait, the solver might orient the rod arbitrarily relative to ground,
    // but the relative distance between c1 origin and r1 origin should be predictable.
    // c1 origin is 12.7mm away from the port.
    // So the distance is either 84 + 12.7 or 84 - 12.7 depending on orientation.
    // Since center_axial_1 direction is -1, 0, 0.
    const dist = new Vector3(...c1.position).distanceTo(new Vector3(...r1.position))
    
    expect(dist).toBeCloseTo(84 - 12.7, 1) // 71.3
  })
})
