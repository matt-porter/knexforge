/**
 * Vitest port of src/core/tests/test_connector_orientation.py
 *
 * Verifies that Rapier.js joints don't cause phantom orientation flips
 * when a connector is clipped to a rod (side-on or end-on) and the
 * simulation runs with zero gravity.
 *
 * Flip threshold: 45° (same as Python tests).
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Quaternion, Vector3 } from 'three'
import { RapierSimulator } from '../rapierSimulator'
import type { KnexPartDef, PartInstance, Connection } from '../../types/parts'

// ---------------------------------------------------------------------------
// Load part definitions from disk (bypasses fetch)
// ---------------------------------------------------------------------------

function loadPartDef(partId: string): KnexPartDef {
  const filePath = path.resolve(__dirname, '../../../../parts', `${partId}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnexPartDef
}

const CONNECTOR_ID = 'connector-2way-orange-v1'
const ROD_ID = 'rod-54-blue-v1'
const MOTOR_ID = 'motor-v1'

let connDef: KnexPartDef
let rodDef: KnexPartDef
let motorDef: KnexPartDef
let partDefsMap: Map<string, KnexPartDef>

beforeAll(() => {
  connDef = loadPartDef(CONNECTOR_ID)
  rodDef = loadPartDef(ROD_ID)
  motorDef = loadPartDef(MOTOR_ID)

  partDefsMap = new Map<string, KnexPartDef>()
  partDefsMap.set(CONNECTOR_ID, connDef)
  partDefsMap.set(ROD_ID, rodDef)
  partDefsMap.set(MOTOR_ID, motorDef)

  // Mock loadAllPartDefs so the simulator doesn't fetch over network
  vi.mock('../../hooks/usePartLibrary', () => ({
    loadAllPartDefs: async () => partDefsMap,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Quaternion helpers (matching Python test helpers)
// ---------------------------------------------------------------------------

type Quat = [number, number, number, number] // [x, y, z, w]

function quatAngleDeg(q1: Quat, q2: Quat): number {
  const dot = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3]
  return (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI
}

const FLIP_THRESHOLD_DEG = 45.0

// ---------------------------------------------------------------------------
// Helper: run zero-gravity simulation for N frames
// ---------------------------------------------------------------------------

async function runZeroGravitySim(
  parts: Record<string, PartInstance>,
  connections: Connection[],
  frames: number = 10,
): Promise<{ initial: Record<string, Quat>; after: Record<string, Quat> }> {
  const sim = new RapierSimulator()
  await sim.init(parts, connections, 0) // motorSpeed=0, no torque

  // Capture initial transforms (frame 0)
  const initial: Record<string, Quat> = {}
  const firstFrame = sim.step()
  for (const [id, t] of Object.entries(firstFrame)) {
    initial[id] = t.quaternion
  }

  // Step remaining frames
  let lastFrame = firstFrame
  for (let i = 1; i < frames; i++) {
    lastFrame = sim.step()
  }

  const after: Record<string, Quat> = {}
  for (const [id, t] of Object.entries(lastFrame)) {
    after[id] = t.quaternion
  }

  sim.destroy()
  return { initial, after }
}

// ---------------------------------------------------------------------------
// a) End-on clip: rod end1 → connector port A
//    Rod extends along X from connector's port A.
//    No alignment rotation needed: end1 direction [-1,0,0] opposes port A [1,0,0].
// ---------------------------------------------------------------------------

describe('Connector orientation stability (Rapier)', () => {
  it('end-on clip: no orientation flip', async () => {
    const parts: Record<string, PartInstance> = {
      conn1: {
        instance_id: 'conn1',
        part_id: CONNECTOR_ID,
        position: [0, 0, 50],
        rotation: [0, 0, 0, 1],
      },
      rod1: {
        instance_id: 'rod1',
        part_id: ROD_ID,
        position: [12.7, 0, 50], // end1 at connector port A world position
        rotation: [0, 0, 0, 1], // identity — rod along X, end1 dir [-1,0,0] opposes A dir [1,0,0]
      },
    }

    const connections: Connection[] = [
      {
        from_instance: 'rod1',
        from_port: 'end1',
        to_instance: 'conn1',
        to_port: 'A',
        joint_type: 'fixed',
      },
    ]

    const { initial, after } = await runZeroGravitySim(parts, connections, 10)

    const connDelta = quatAngleDeg(initial['conn1'], after['conn1'])
    const rodDelta = quatAngleDeg(initial['rod1'], after['rod1'])

    expect(connDelta).toBeLessThan(FLIP_THRESHOLD_DEG)
    expect(rodDelta).toBeLessThan(FLIP_THRESHOLD_DEG)
  })

  // ---------------------------------------------------------------------------
  // b) Side-on clip: rod center_tangent → connector port A
  //    Rod perpendicular to connector.
  //    Rod rotated -90° around Z so center_tangent dir [0,1,0] → [-1,0,0] (opposing A's [1,0,0])
  // ---------------------------------------------------------------------------

  it('side-on clip: no orientation flip', async () => {
    const SIN45 = Math.SQRT1_2

    const parts: Record<string, PartInstance> = {
      conn1: {
        instance_id: 'conn1',
        part_id: CONNECTOR_ID,
        position: [0, 0, 50],
        rotation: [0, 0, 0, 1],
      },
      rod1: {
        instance_id: 'rod1',
        part_id: ROD_ID,
        // Position computed: target_world - R(-90°Z).apply(center_tangent_local [27,0,0])
        // R(-90°Z).[27,0,0] = [0, -27, 0]
        // pos = [12.7, 0, 50] - [0, -27, 0] = [12.7, 27, 50]
        position: [12.7, 27, 50],
        // -90° around Z: [0, 0, -sin(45°), cos(45°)]
        rotation: [0, 0, -SIN45, SIN45],
      },
    }

    const connections: Connection[] = [
      {
        from_instance: 'rod1',
        from_port: 'center_tangent',
        to_instance: 'conn1',
        to_port: 'A',
        joint_type: 'fixed',
      },
    ]

    const { initial, after } = await runZeroGravitySim(parts, connections, 10)

    const connDelta = quatAngleDeg(initial['conn1'], after['conn1'])
    const rodDelta = quatAngleDeg(initial['rod1'], after['rod1'])

    expect(connDelta).toBeLessThan(FLIP_THRESHOLD_DEG)
    expect(rodDelta).toBeLessThan(FLIP_THRESHOLD_DEG)
  })

  it('side-on clip: explicit rod-side ports remain stable for all four sides', async () => {
    const targetWorldPos = new Vector3(12.7, 0, 50)
    const targetWorldDir = new Vector3(1, 0, 0)
    const desiredDir = targetWorldDir.clone().negate()

    const sidePortIds = [
      'center_tangent_y_pos',
      'center_tangent_y_neg',
      'center_tangent_z_pos',
      'center_tangent_z_neg',
    ]

    for (const sidePortId of sidePortIds) {
      const sidePort = rodDef.ports.find((port) => port.id === sidePortId)
      expect(sidePort, `missing rod-side port ${sidePortId}`).toBeDefined()

      const localDir = new Vector3(...sidePort!.direction)
      const localPos = new Vector3(...sidePort!.position)
      const ghostQuat = new Quaternion().setFromUnitVectors(localDir, desiredDir)
      const ghostPos = targetWorldPos.clone().sub(localPos.clone().applyQuaternion(ghostQuat))

      const parts: Record<string, PartInstance> = {
        conn1: {
          instance_id: 'conn1',
          part_id: CONNECTOR_ID,
          position: [0, 0, 50],
          rotation: [0, 0, 0, 1],
        },
        rod1: {
          instance_id: 'rod1',
          part_id: ROD_ID,
          position: [ghostPos.x, ghostPos.y, ghostPos.z],
          rotation: [ghostQuat.x, ghostQuat.y, ghostQuat.z, ghostQuat.w],
        },
      }

      const connections: Connection[] = [
        {
          from_instance: 'rod1',
          from_port: sidePortId,
          to_instance: 'conn1',
          to_port: 'A',
          joint_type: 'fixed',
        },
      ]

      const { initial, after } = await runZeroGravitySim(parts, connections, 10)
      const connDelta = quatAngleDeg(initial['conn1'], after['conn1'])
      const rodDelta = quatAngleDeg(initial['rod1'], after['rod1'])

      expect(connDelta, `${sidePortId} connector flipped`).toBeLessThan(FLIP_THRESHOLD_DEG)
      expect(rodDelta, `${sidePortId} rod flipped`).toBeLessThan(FLIP_THRESHOLD_DEG)
    }
  })

  // ---------------------------------------------------------------------------
  // c) Motor-driven chain: motor → rod (revolute) → connector (fixed)
  //    Motor anchored (fixed body), rod spins on drive_axle, connector attached to rod end2.
  //    Apply motor torque for 1 frame — neither connector nor rod should flip.
  // ---------------------------------------------------------------------------

  it('motor-driven chain: no first-frame flip', async () => {
    const SIN45 = Math.SQRT1_2

    const parts: Record<string, PartInstance> = {
      motor1: {
        instance_id: 'motor1',
        part_id: MOTOR_ID,
        position: [0, 0, 50],
        rotation: [0, 0, 0, 1],
      },
      rod1: {
        instance_id: 'rod1',
        part_id: ROD_ID,
        position: [0, 0, 50],
        rotation: [0, -SIN45, 0, SIN45], // -90° around Y
      },
      conn1: {
        instance_id: 'conn1',
        part_id: CONNECTOR_ID,
        position: [0, 0, 116.7],
        rotation: [0, SIN45, 0, SIN45], // 90° around Y
      },
    }

    const connections: Connection[] = [
      {
        from_instance: 'motor1',
        from_port: 'drive_axle',
        to_instance: 'rod1',
        to_port: 'end1',
        joint_type: 'revolute',
      },
      {
        from_instance: 'rod1',
        from_port: 'end2',
        to_instance: 'conn1',
        to_port: 'A',
        joint_type: 'fixed',
      },
    ]

    const sim = new RapierSimulator()
    await sim.init(parts, connections, 10.0)

    const firstFrame = sim.step()
    const connQ0 = firstFrame['conn1'].quaternion
    const rodQ0 = firstFrame['rod1'].quaternion

    let lastFrame = firstFrame
    for (let i = 0; i < 3; i++) {
      lastFrame = sim.step()
    }

    const connQ1 = lastFrame['conn1'].quaternion
    const rodQ1 = lastFrame['rod1'].quaternion

    const rodDelta = quatAngleDeg(rodQ0, rodQ1)
    const connDelta = quatAngleDeg(connQ0, connQ1)

    expect(connDelta).toBeLessThan(FLIP_THRESHOLD_DEG)
    sim.destroy()
  })

  // ---------------------------------------------------------------------------
  // c2) Cylindrical joint: connector onto rod
  // ---------------------------------------------------------------------------
  it('cylindrical joint: dummy body properly initializes when connector is fromInst', async () => {
    // A rod at origin, a connector attached to center_axial_1.
    // The connection direction is connector -> rod to trigger the dummy body bug path.
    const parts: Record<string, PartInstance> = {
      rod1: {
        instance_id: 'rod1',
        part_id: ROD_ID,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
      conn1: {
        instance_id: 'conn1',
        part_id: CONNECTOR_ID,
        position: [27, 0, 0], // Center of a 54mm rod
        rotation: [0, 0, 0, 1],
      },
    }

    const connections: Connection[] = [
      {
        from_instance: 'conn1',
        from_port: 'A',
        to_instance: 'rod1',
        to_port: 'center_axial_1',
        joint_type: 'revolute', // Rapier forces cylindrical internally
        slide_offset: 0,
      },
    ]

    // If dummy body uses toInst (rod1) instead of connector, it spawns at [0,0,0]
    // The prismatic joint then violently snaps the connector to [0,0,0], causing a huge translation delta.
    const sim = new RapierSimulator()
    await sim.init(parts, connections, 0.0)

    const firstFrame = sim.step()
    const connPos = firstFrame['conn1'].position
    
    // The connector should stay at [27,0,0] in the first frame (zero gravity test, no forces)
    expect(connPos[0]).toBeCloseTo(27, 1)
    expect(connPos[1]).toBeCloseTo(0, 1)
    expect(connPos[2]).toBeCloseTo(0, 1)
    
    sim.destroy()
  })

  // ---------------------------------------------------------------------------
  // d) Orientation delta diagnostic — logs detailed info for debugging
  // ---------------------------------------------------------------------------

  it('orientation delta diagnostic', async () => {
    const SIN45 = Math.SQRT1_2

    const configs: Array<{
      label: string
      parts: Record<string, PartInstance>
      connections: Connection[]
    }> = [
      {
        label: 'end-on',
        parts: {
          conn1: {
            instance_id: 'conn1',
            part_id: CONNECTOR_ID,
            position: [0, 0, 50],
            rotation: [0, 0, 0, 1],
          },
          rod1: {
            instance_id: 'rod1',
            part_id: ROD_ID,
            position: [12.7, 0, 50],
            rotation: [0, 0, 0, 1],
          },
        },
        connections: [
          {
            from_instance: 'rod1',
            from_port: 'end1',
            to_instance: 'conn1',
            to_port: 'A',
            joint_type: 'fixed',
          },
        ],
      },
      {
        label: 'side-on',
        parts: {
          conn1: {
            instance_id: 'conn1',
            part_id: CONNECTOR_ID,
            position: [0, 0, 50],
            rotation: [0, 0, 0, 1],
          },
          rod1: {
            instance_id: 'rod1',
            part_id: ROD_ID,
            position: [12.7, 27, 50],
            rotation: [0, 0, -SIN45, SIN45],
          },
        },
        connections: [
          {
            from_instance: 'rod1',
            from_port: 'center_tangent',
            to_instance: 'conn1',
            to_port: 'A',
            joint_type: 'fixed',
          },
        ],
      },
    ]

    let anyFlipped = false

    for (const { label, parts, connections } of configs) {
      const { initial, after } = await runZeroGravitySim(parts, connections, 4)

      console.log(`\n${'='.repeat(60)}`)
      console.log(`DIAGNOSTIC: ${label} connection (Rapier)`)
      console.log('='.repeat(60))

      for (const id of Object.keys(parts)) {
        const angle = quatAngleDeg(initial[id], after[id])
        const flipped = angle > FLIP_THRESHOLD_DEG
        if (flipped) anyFlipped = true

        console.log(`  ${id}: delta=${angle.toFixed(2)}° ${flipped ? 'FLIPPED! ⚠️' : 'ok'}`)
      }
    }

    expect(anyFlipped).toBe(false)
  })
})
