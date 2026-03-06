import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { getPortWorldPose, findNearestSnap, computeGhostTransform } from '../helpers/snapHelper'
import type { KnexPartDef, PartInstance, Port } from '../types/parts'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePort(overrides: Partial<Port> = {}): Port {
  return {
    id: 'A',
    position: [0, 0, 0],
    direction: [1, 0, 0],
    mate_type: 'rod_hole',
    accepts: ['rod_end'],
    allowed_angles_deg: [0],
    ...overrides,
  }
}

function makePartDef(overrides: Partial<KnexPartDef> = {}): KnexPartDef {
  return {
    format_version: '1.0',
    id: 'test-part',
    name: 'Test Part',
    category: 'connector',
    mesh_file: 'meshes/test.glb',
    default_color: '#FF0000',
    mass_grams: 1.0,
    ports: [makePort()],
    ...overrides,
  }
}

function makeInstance(overrides: Partial<PartInstance> = {}): PartInstance {
  return {
    instance_id: 'inst-1',
    part_id: 'test-part',
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1], // identity
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getPortWorldPose
// ---------------------------------------------------------------------------

describe('getPortWorldPose', () => {
  it('returns port position in world space (identity rotation)', () => {
    const instance = makeInstance({ position: [10, 20, 30] })
    const port = makePort({ position: [5, 0, 0] })

    const { position } = getPortWorldPose(instance, port)

    expect(position.x).toBeCloseTo(15)
    expect(position.y).toBeCloseTo(20)
    expect(position.z).toBeCloseTo(30)
  })

  it('returns port direction in world space (identity rotation)', () => {
    const instance = makeInstance()
    const port = makePort({ direction: [0, 1, 0] })

    const { direction } = getPortWorldPose(instance, port)

    expect(direction.x).toBeCloseTo(0)
    expect(direction.y).toBeCloseTo(1)
    expect(direction.z).toBeCloseTo(0)
  })

  it('applies rotation to port position', () => {
    // 90° rotation around Z axis: quat = [0, 0, sin(45°), cos(45°)]
    const s = Math.sin(Math.PI / 4)
    const c = Math.cos(Math.PI / 4)
    const instance = makeInstance({
      position: [0, 0, 0],
      rotation: [0, 0, s, c],
    })
    const port = makePort({ position: [10, 0, 0] })

    const { position } = getPortWorldPose(instance, port)

    // 90° around Z rotates X→Y
    expect(position.x).toBeCloseTo(0)
    expect(position.y).toBeCloseTo(10)
    expect(position.z).toBeCloseTo(0)
  })

  it('applies rotation to port direction', () => {
    const s = Math.sin(Math.PI / 4)
    const c = Math.cos(Math.PI / 4)
    const instance = makeInstance({
      rotation: [0, 0, s, c],
    })
    const port = makePort({ direction: [1, 0, 0] })

    const { direction } = getPortWorldPose(instance, port)

    expect(direction.x).toBeCloseTo(0)
    expect(direction.y).toBeCloseTo(1)
    expect(direction.z).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// findNearestSnap
// ---------------------------------------------------------------------------

describe('findNearestSnap', () => {
  it('returns null candidate when no parts exist', () => {
    const placingDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const result = findNearestSnap([0, 0, 0], placingDef, {}, new Map())

    expect(result.candidate).toBeNull()
  })

  it('finds a nearby compatible port', () => {
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [makePort({ id: 'A', position: [12.5, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] })],
    })

    const rodDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ id: 'end1', mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    // Cursor near the port at [12.5, 0, 0]
    const result = findNearestSnap([15, 0, 0], rodDef, existingParts, defs)

    expect(result.candidate).not.toBeNull()
    expect(result.candidate!.instanceId).toBe('c1')
    expect(result.candidate!.portId).toBe('A')
  })

  it('returns null when cursor is too far from any port', () => {
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [makePort({ id: 'A', position: [12.5, 0, 0] })],
    })

    const rodDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ id: 'end1', mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    // Cursor 100mm away — beyond default snapRadius of 30
    const result = findNearestSnap([100, 0, 0], rodDef, existingParts, defs)

    expect(result.candidate).toBeNull()
  })

  it('skips incompatible port types', () => {
    // Both have rod_hole — not compatible (need rod_end ↔ rod_hole)
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [makePort({ id: 'A', mate_type: 'rod_hole', accepts: ['rod_end'] })],
    })

    const connectorDef2 = makePartDef({
      id: 'conn-2',
      ports: [makePort({ id: 'B', mate_type: 'rod_hole', accepts: ['rod_end'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('conn-2', connectorDef2)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    const result = findNearestSnap([12.5, 0, 0], connectorDef2, existingParts, defs)

    expect(result.candidate).toBeNull()
  })

  it('picks the closest port when multiple are nearby', () => {
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [
        makePort({ id: 'A', position: [12.5, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] }),
        makePort({ id: 'B', position: [-12.5, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] }),
      ],
    })

    const rodDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ id: 'end1', mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    // Cursor closer to port A (12.5) than port B (-12.5)
    const result = findNearestSnap([14, 0, 0], rodDef, existingParts, defs)

    expect(result.candidate!.portId).toBe('A')
  })

  it('computes ghost position and rotation when snapped', () => {
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [makePort({ id: 'A', position: [12.5, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] })],
    })

    const rodDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    const result = findNearestSnap([13, 0, 0], rodDef, existingParts, defs)

    expect(result.ghostPosition).not.toBeNull()
    expect(result.ghostRotation).not.toBeNull()

    // Ghost position should place rod end1 (at [0,0,0] local) at port A world pos [12.5,0,0]
    expect(result.ghostPosition![0]).toBeCloseTo(12.5)
    expect(result.ghostPosition![1]).toBeCloseTo(0)
    expect(result.ghostPosition![2]).toBeCloseTo(0)
  })

  it('picks the correct rod end based on cursor proximity', () => {
    // Connector with port A at [12.5, 0, 0] pointing right
    // and port B at [-12.5, 0, 0] pointing left
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [
        makePort({ id: 'A', position: [12.5, 0, 0], direction: [1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] }),
        makePort({ id: 'B', position: [-12.5, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] }),
      ],
    })

    // Rod with both ends: end1 at [0,0,0] dir [-1,0,0], end2 at [55,0,0] dir [1,0,0]
    const rodDef = makePartDef({
      id: 'rod-1',
      category: 'rod',
      ports: [
        makePort({ id: 'end1', position: [0, 0, 0], direction: [-1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'] }),
        makePort({ id: 'end2', position: [55, 0, 0], direction: [1, 0, 0], mate_type: 'rod_end', accepts: ['rod_hole'] }),
      ],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    // Cursor to the RIGHT of port A — should snap end1 to port A
    // (rod extends rightward from connector)
    const resultRight = findNearestSnap([20, 0, 0], rodDef, existingParts, defs)
    expect(resultRight.candidate).not.toBeNull()
    expect(resultRight.candidate!.portId).toBe('A')
    expect(resultRight.candidate!.placingPortId).toBe('end1')

    // Cursor to the LEFT of port B — should snap end1 to port B
    // (rod extends leftward from connector)
    const resultLeft = findNearestSnap([-20, 0, 0], rodDef, existingParts, defs)
    expect(resultLeft.candidate).not.toBeNull()
    expect(resultLeft.candidate!.portId).toBe('B')
    expect(resultLeft.candidate!.placingPortId).toBe('end1')
  })

  it('includes placingPortId in candidate', () => {
    const connectorDef = makePartDef({
      id: 'conn-1',
      ports: [makePort({ id: 'A', position: [12.5, 0, 0], mate_type: 'rod_hole', accepts: ['rod_end'] })],
    })

    const rodDef = makePartDef({
      id: 'rod-1',
      ports: [makePort({ id: 'end1', mate_type: 'rod_end', accepts: ['rod_hole'] })],
    })

    const defs = new Map<string, KnexPartDef>()
    defs.set('conn-1', connectorDef)
    defs.set('rod-1', rodDef)

    const existingParts: Record<string, PartInstance> = {
      'c1': makeInstance({ instance_id: 'c1', part_id: 'conn-1', position: [0, 0, 0] }),
    }

    const result = findNearestSnap([13, 0, 0], rodDef, existingParts, defs)
    expect(result.candidate!.placingPortId).toBe('end1')
  })
})

// ---------------------------------------------------------------------------
// computeGhostTransform
// ---------------------------------------------------------------------------

describe('computeGhostTransform', () => {
  it('aligns placing port to target port (opposite directions)', () => {
    const targetPort = makePort({ direction: [0, 1, 0] }) // Target points Up
    const placingPort = makePort({ direction: [1, 0, 0] }) // Placing points Right
    const targetWorldPos = new Vector3(0, 0, 0)
    const targetWorldDir = new Vector3(0, 1, 0)

    const { rotation } = computeGhostTransform(placingPort, targetPort, targetWorldPos, targetWorldDir)

    // To align [1,0,0] -> [0,-1,0], we need -90° around Z
    const direction = new Vector3(1, 0, 0).applyQuaternion(rotation)
    expect(direction.x).toBeCloseTo(0)
    expect(direction.y).toBeCloseTo(-1)
    expect(direction.z).toBeCloseTo(0)
  })

  it('applies twist angle around target direction', () => {
    const targetPort = makePort({ direction: [0, 0, 1] })
    const placingPort = makePort({ direction: [0, 0, -1] }) // Already aligned
    const targetWorldPos = new Vector3(0, 0, 0)
    const targetWorldDir = new Vector3(0, 0, 1)

    // 90° twist around Z
    const { rotation } = computeGhostTransform(placingPort, targetPort, targetWorldPos, targetWorldDir, 90)

    // Local [1,0,0] should rotate to world [0,1,0]
    const localX = new Vector3(1, 0, 0).applyQuaternion(rotation)
    expect(localX.x).toBeCloseTo(0)
    expect(localX.y).toBeCloseTo(1)
    expect(localX.z).toBeCloseTo(0)
  })

  it('enforces deterministic orientation for rod-side clips', () => {
    // Target is a Rod pointing along world Y (rotated 90° Z)
    const s = Math.sin(Math.PI / 4)
    const c = Math.cos(Math.PI / 4)
    const rodInstance = makeInstance({
      part_id: 'rod-1',
      rotation: [0, 0, s, c] // 90° Z: local X [1,0,0] -> world Y [0,1,0]
    })
    const rodDef = makePartDef({ id: 'rod-1', category: 'rod' })
    
    // Rod side port pointing along world X (local Y [0,1,0] rotated 90° Z -> world -X [-1,0,0])
    const rodPort = makePort({ 
      id: 'center_tangent_y_pos', 
      direction: [0, 1, 0], 
      mate_type: 'rod_side' 
    })
    const targetWorldPos = new Vector3(0, 0, 0)
    const targetWorldDir = new Vector3(-1, 0, 0)

    // Placing is a Connector
    const connDef = makePartDef({ id: 'conn-1', category: 'connector' })
    const connPort = makePort({ 
      id: 'A', 
      direction: [1, 0, 0], 
      mate_type: 'rod_hole' 
    })

    const { rotation } = computeGhostTransform(
      connPort,
      rodPort,
      targetWorldPos,
      targetWorldDir,
      0,
      rodInstance,
      connDef,
      rodDef,
      false // isPlacingRod
    )

    // 1. Check alignment: connPort [1,0,0] should face targetWorldDir [-1,0,0] -> Opposed
    const dir = new Vector3(1, 0, 0).applyQuaternion(rotation)
    expect(dir.x).toBeCloseTo(1) // targetWorldDir is [-1,0,0], opposite is [1,0,0]
    expect(dir.y).toBeCloseTo(0)
    expect(dir.z).toBeCloseTo(0)

    // 2. Check deterministic orientation: connector must be FLAT in rod plane.
    // Rod main axis is world Y [0,1,0].
    // Flat orientation means connector local Y [0,1,0] aligns with rod world Y [0,1,0].
    const localY = new Vector3(0, 1, 0).applyQuaternion(rotation)
    expect(localY.x).toBeCloseTo(0)
    expect(localY.y).toBeCloseTo(1)
    expect(localY.z).toBeCloseTo(0)

  })
})
