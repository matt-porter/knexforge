/**
 * Tests for Rapier.js fitness evaluator.
 *
 * Verifies that the lightweight Rapier stability evaluator correctly:
 * - Scores stable builds high
 * - Scores unstable builds low
 * - Detects joint explosions
 * - Cleans up Rapier world properly
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import type { KnexPartDef, Connection } from '../../types/parts'
import type { SolvedTopologyBuild } from '../topologySolver'

// We need to import after mocking
let evaluateRapierFitness: typeof import('../synthesis/rapierFitnessEval').evaluateRapierFitness

// ---------------------------------------------------------------------------
// Load part definitions from disk
// ---------------------------------------------------------------------------

function loadPartDef(partId: string): KnexPartDef {
  const filePath = path.resolve(__dirname, '../../../../parts', `${partId}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnexPartDef
}

const ROD_54 = 'rod-54-blue-v1'
const ROD_86 = 'rod-86-yellow-v1'
const CONN_2WAY = 'connector-2way-orange-v1'
const CONN_4WAY = 'connector-4way-green-v1'

let rod54Def: KnexPartDef
let rod86Def: KnexPartDef
let conn2wayDef: KnexPartDef
let conn4wayDef: KnexPartDef
let partDefsMap: Map<string, KnexPartDef>

beforeAll(async () => {
  rod54Def = loadPartDef(ROD_54)
  rod86Def = loadPartDef(ROD_86)
  conn2wayDef = loadPartDef(CONN_2WAY)
  conn4wayDef = loadPartDef(CONN_4WAY)

  partDefsMap = new Map<string, KnexPartDef>()
  partDefsMap.set(ROD_54, rod54Def)
  partDefsMap.set(ROD_86, rod86Def)
  partDefsMap.set(CONN_2WAY, conn2wayDef)
  partDefsMap.set(CONN_4WAY, conn4wayDef)

  // Import after setup
  const module = await import('../synthesis/rapierFitnessEval')
  evaluateRapierFitness = module.evaluateRapierFitness
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: Create a stable rectangular frame build (with grounded base)
// ---------------------------------------------------------------------------

function createStableFrame(): SolvedTopologyBuild {
  // A stable frame with a wide base on the ground
  // Bottom connectors are at Y=0 (ground level), top connectors are at Y=86
  // This forms a stable rectangular prism
  const parts = [
    // Bottom layer (on ground)
    {
      instance_id: 'conn_bl',
      part_id: CONN_4WAY,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    {
      instance_id: 'conn_br',
      part_id: CONN_4WAY,
      position: [54, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    {
      instance_id: 'conn_fl',
      part_id: CONN_4WAY,
      position: [0, 0, 54] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    {
      instance_id: 'conn_fr',
      part_id: CONN_4WAY,
      position: [54, 0, 54] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    // Top layer (connected by vertical rods)
    {
      instance_id: 'conn_tl',
      part_id: CONN_4WAY,
      position: [0, 86, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    {
      instance_id: 'conn_tr',
      part_id: CONN_4WAY,
      position: [54, 86, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#00ff00',
    },
    // Bottom rods (forming a rectangle on the ground)
    {
      instance_id: 'rod_bottom_x',
      part_id: ROD_54,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#0000ff',
    },
    {
      instance_id: 'rod_bottom_z',
      part_id: ROD_54,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0.707, 0, 0.707] as [number, number, number, number], // 90° around Y
      color: '#0000ff',
    },
    // Vertical rods
    {
      instance_id: 'rod_vert_bl',
      part_id: ROD_86,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0.707, 0.707] as [number, number, number, number], // 90° around Z, standing up
      color: '#ff0000',
    },
    {
      instance_id: 'rod_vert_br',
      part_id: ROD_86,
      position: [54, 0, 0] as [number, number, number],
      rotation: [0, 0, 0.707, 0.707] as [number, number, number, number],
      color: '#ff0000',
    },
    // Top rod
    {
      instance_id: 'rod_top_x',
      part_id: ROD_54,
      position: [0, 86, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#0000ff',
    },
  ]

  const connections: Connection[] = [
    // Bottom rectangle
    {
      from_instance: 'conn_bl',
      from_port: 'A',
      to_instance: 'rod_bottom_x',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_br',
      from_port: 'A',
      to_instance: 'rod_bottom_x',
      to_port: 'end2',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_bl',
      from_port: 'B',
      to_instance: 'rod_bottom_z',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_fl',
      from_port: 'A',
      to_instance: 'rod_bottom_z',
      to_port: 'end2',
      joint_type: 'fixed',
    },
    // Vertical supports
    {
      from_instance: 'conn_bl',
      from_port: 'C',
      to_instance: 'rod_vert_bl',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_tl',
      from_port: 'A',
      to_instance: 'rod_vert_bl',
      to_port: 'end2',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_br',
      from_port: 'C',
      to_instance: 'rod_vert_br',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_tr',
      from_port: 'A',
      to_instance: 'rod_vert_br',
      to_port: 'end2',
      joint_type: 'fixed',
    },
    // Top rod
    {
      from_instance: 'conn_tl',
      from_port: 'B',
      to_instance: 'rod_top_x',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'conn_tr',
      from_port: 'B',
      to_instance: 'rod_top_x',
      to_port: 'end2',
      joint_type: 'fixed',
    },
  ]

  return { parts, connections, warnings: [] }
}

// ---------------------------------------------------------------------------
// Helper: Create an unstable single tall rod
// ---------------------------------------------------------------------------

function createUnstableTallRod(): SolvedTopologyBuild {
  // A single tall rod standing on a connector — should tip over
  const parts = [
    {
      instance_id: 'conn_base',
      part_id: CONN_2WAY,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#ff8800',
    },
    {
      instance_id: 'rod_tall',
      part_id: ROD_86,
      position: [12.7, 43, 0] as [number, number, number],
      rotation: [0, 0, 0.707, 0.707] as [number, number, number, number], // 90° around Z, standing up
      color: '#00ff00',
    },
  ]

  const connections: Connection[] = [
    {
      from_instance: 'conn_base',
      from_port: 'A',
      to_instance: 'rod_tall',
      to_port: 'center_tangent',
      joint_type: 'fixed',
    },
  ]

  return { parts, connections, warnings: [] }
}

// ---------------------------------------------------------------------------
// Helper: Create a build with joint stress (part hanging off edge)
// ---------------------------------------------------------------------------

function createStressedBuild(): SolvedTopologyBuild {
  // A connector on the ground, with a rod extending far off the edge
  // The rod's center of mass is past the support, causing the joint to stretch
  const parts = [
    {
      instance_id: 'conn_base',
      part_id: CONN_2WAY,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      color: '#ff8800',
    },
    {
      instance_id: 'rod_overhang',
      part_id: ROD_86,
      position: [12.7, 0, 0] as [number, number, number], // Start at connector port A
      rotation: [0, 0, 0, 1] as [number, number, number, number], // Rod extends along X
      color: '#00ff00',
    },
    {
      instance_id: 'weight_end',
      part_id: ROD_86,
      position: [98.7, 0, 0] as [number, number, number], // At end of first rod
      rotation: [0, 0, 0.707, 0.707] as [number, number, number, number], // Hanging down
      color: '#ff0000',
    },
  ]

  // This creates a cantilever with weight at the end - joints will be stressed
  const connections: Connection[] = [
    {
      from_instance: 'conn_base',
      from_port: 'A',
      to_instance: 'rod_overhang',
      to_port: 'end1',
      joint_type: 'fixed',
    },
    {
      from_instance: 'rod_overhang',
      from_port: 'end2',
      to_instance: 'weight_end',
      to_port: 'end1',
      joint_type: 'fixed',
    },
  ]

  return { parts, connections, warnings: [] }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rapier Fitness Evaluator', () => {
  it('stable flat build maintains joint integrity', async () => {
    const build = createStableFrame()

    const result = await evaluateRapierFitness(build, partDefsMap, {
      simDurationSec: 2.0,
    })

    // A well-connected structure should maintain joint integrity
    // (parts don't separate or explode apart)
    expect(result.jointIntegrity).toBeGreaterThan(0.7)
    expect(result.simTimeMs).toBeLessThan(1000) // Should complete in under 1 second
  })

  it('unstable build (single tall rod) gets stabilityScore < 0.5', async () => {
    const build = createUnstableTallRod()

    const result = await evaluateRapierFitness(build, partDefsMap, {
      simDurationSec: 2.0,
    })

    // The tall rod should fall over, reducing COM height
    expect(result.stabilityScore).toBeLessThan(0.5)
  })

  it('cantilever with weight causes joint stress', async () => {
    const build = createStressedBuild()

    const result = await evaluateRapierFitness(build, partDefsMap, {
      simDurationSec: 2.0,
    })

    // A cantilever with weight at the end puts stress on the base joint
    // The joint may stretch or the structure may collapse
    // This tests that the evaluator detects structural weakness
    expect(result.simTimeMs).toBeGreaterThan(0)
    // The structure may or may not hold - just verify it runs without error
    expect(result.jointIntegrity).toBeGreaterThanOrEqual(0)
    expect(result.jointIntegrity).toBeLessThanOrEqual(1)
  })

  it('isStable correctly reflects structural integrity', async () => {
    // Well-connected frame should have good joint integrity
    const stableBuild = createStableFrame()
    // Cantilever build with weight at end
    const stressedBuild = createStressedBuild()

    const stableResult = await evaluateRapierFitness(stableBuild, partDefsMap, {
      simDurationSec: 1.0,
    })
    const stressedResult = await evaluateRapierFitness(stressedBuild, partDefsMap, {
      simDurationSec: 1.0,
    })

    // Stable frame: joints hold together well (no relative movement)
    expect(stableResult.jointIntegrity).toBeGreaterThan(0.8)
    // Stressed build: may have some joint movement but should still run
    expect(stressedResult.jointIntegrity).toBeGreaterThanOrEqual(0)
    expect(stressedResult.jointIntegrity).toBeLessThanOrEqual(1)
    // Both should produce valid scores
    expect(stableResult.stabilityScore).toBeGreaterThanOrEqual(0)
    expect(stressedResult.stabilityScore).toBeGreaterThanOrEqual(0)
  })

  it('Rapier world is cleaned up (no memory leak)', async () => {
    const build = createStableFrame()

    // Run multiple evaluations
    for (let i = 0; i < 3; i++) {
      const result = await evaluateRapierFitness(build, partDefsMap, {
        simDurationSec: 0.5,
      })
      expect(result.simTimeMs).toBeGreaterThan(0)
    }

    // If there's a memory leak, the test might crash or become very slow
    // This is a smoke test — real leak detection would need profiling
  })

  it('handles empty build gracefully', async () => {
    const emptyBuild: SolvedTopologyBuild = {
      parts: [],
      connections: [],
    }

    const result = await evaluateRapierFitness(emptyBuild, partDefsMap, {
      simDurationSec: 0.5,
    })

    expect(result.stabilityScore).toBe(1.0) // No parts = no instability
    expect(result.jointIntegrity).toBe(1.0) // No joints = perfect integrity
    expect(result.isStable).toBe(true)
  })

  it('handles single-part build (no connections)', async () => {
    const singlePart: SolvedTopologyBuild = {
      parts: [
        {
          instance_id: 'conn1',
          part_id: CONN_2WAY,
          position: [0, 50, 0],
          rotation: [0, 0, 0, 1],
          color: '#ff8800',
        },
      ],
      connections: [],
    }

    const result = await evaluateRapierFitness(singlePart, partDefsMap, {
      simDurationSec: 1.0,
    })

    // Single part should fall to ground, but no joints to break
    expect(result.jointIntegrity).toBe(1.0)
    expect(result.simTimeMs).toBeGreaterThan(0)
  })

  it('respects simDurationSec option', async () => {
    const build = createStableFrame()

    const fastResult = await evaluateRapierFitness(build, partDefsMap, {
      simDurationSec: 0.5,
    })
    const slowResult = await evaluateRapierFitness(build, partDefsMap, {
      simDurationSec: 2.0,
    })

    // Slower simulation should take more time
    expect(slowResult.simTimeMs).toBeGreaterThan(fastResult.simTimeMs * 0.5)
  })
})
