import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import {
  solveTopology,
  TopologySolveError,
  type SolvedTopologyBuild,
  type TopologyConnection,
  type TopologyModel,
} from '../topologySolver'
import { parseCompactTopology } from '../topologyCompactFormat'
import { partDefsById } from './partFixtures'
import type { KnexPartDef, Port } from '../../types/parts'

type Transform = {
  position: Vector3
  rotation: Quaternion
}

type ConnectionOverride = {
  fromPort?: string
  toPort?: string
  connection?: Partial<TopologyConnection>
}

function getPartPort(partDef: KnexPartDef, portId: string): Port {
  const port = partDef.ports.find((candidate) => candidate.id === portId)
  if (!port) {
    throw new Error(`Missing port '${portId}' on '${partDef.id}'`)
  }
  return port
}

function getWorldPortPose(transform: Transform, port: Port): { position: Vector3; direction: Vector3 } {
  const localPosition = new Vector3(port.position[0], port.position[1], port.position[2])
  const localDirection = new Vector3(port.direction[0], port.direction[1], port.direction[2])

  return {
    position: localPosition.applyQuaternion(transform.rotation).add(transform.position),
    direction: localDirection.applyQuaternion(transform.rotation).normalize(),
  }
}

function createTransformMap(build: SolvedTopologyBuild): Map<string, Transform> {
  return new Map(
    build.parts.map((part) => [
      part.instance_id,
      {
        position: new Vector3(...part.position),
        rotation: new Quaternion(...part.rotation).normalize(),
      },
    ]),
  )
}

function assertResidualWithinTolerance(
  build: SolvedTopologyBuild,
  partDefs: Map<string, KnexPartDef>,
  posTolMm = 2,
  angleTolDeg = 15,
): void {
  const transforms = createTransformMap(build)
  const partsByInstance = new Map(build.parts.map((part) => [part.instance_id, part]))

  for (const connection of build.connections) {
    const fromPart = partsByInstance.get(connection.from_instance)
    const toPart = partsByInstance.get(connection.to_instance)

    expect(fromPart).toBeDefined()
    expect(toPart).toBeDefined()

    const fromPartDef = partDefs.get(fromPart!.part_id)
    const toPartDef = partDefs.get(toPart!.part_id)

    expect(fromPartDef).toBeDefined()
    expect(toPartDef).toBeDefined()

    const fromPose = getWorldPortPose(
      transforms.get(connection.from_instance)!,
      getPartPort(fromPartDef!, connection.from_port),
    )
    const toPose = getWorldPortPose(
      transforms.get(connection.to_instance)!,
      getPartPort(toPartDef!, connection.to_port),
    )

    const distance = fromPose.position.distanceTo(toPose.position)
    const dot = Math.max(-1, Math.min(1, fromPose.direction.clone().negate().dot(toPose.direction)))
    const angleDeg = (Math.acos(dot) * 180) / Math.PI

    expect(distance).toBeLessThanOrEqual(posTolMm)
    expect(angleDeg).toBeLessThanOrEqual(angleTolDeg)
  }
}

function normalizeBuild(build: SolvedTopologyBuild) {
  const sortedParts = [...build.parts].sort((a, b) => a.instance_id.localeCompare(b.instance_id))
  const anchor = sortedParts[0]
  const anchorPosition = new Vector3(...anchor.position)
  const anchorRotation = new Quaternion(...anchor.rotation).normalize()
  const anchorInverse = anchorRotation.clone().invert()

  return sortedParts.map((part) => {
    const position = new Vector3(...part.position).sub(anchorPosition).applyQuaternion(anchorInverse)
    const rotation = anchorInverse.clone().multiply(new Quaternion(...part.rotation).normalize()).normalize()
    return {
      instance_id: part.instance_id,
      position,
      rotation,
    }
  })
}

function assertGeometryEquivalent(
  buildA: SolvedTopologyBuild,
  buildB: SolvedTopologyBuild,
  posEpsilonMm = 0.1,
  rotEpsilonDot = 0.999,
): void {
  const normalizedA = normalizeBuild(buildA)
  const normalizedB = normalizeBuild(buildB)

  expect(normalizedA.length).toBe(normalizedB.length)

  for (let index = 0; index < normalizedA.length; index += 1) {
    const left = normalizedA[index]
    const right = normalizedB[index]

    expect(left.instance_id).toBe(right.instance_id)
    expect(left.position.distanceTo(right.position)).toBeLessThan(posEpsilonMm)
    expect(Math.abs(left.rotation.dot(right.rotation))).toBeGreaterThan(rotEpsilonDot)
  }
}

function solveAndAssert(
  model: TopologyModel,
): SolvedTopologyBuild {
  const solved = solveTopology(model, partDefsById)
  assertResidualWithinTolerance(solved, partDefsById)
  return solved
}

function createLoopModel(params: {
  sideCount: number
  connectorPartId?: string
  connectorPartIds?: string[]
  rodPartIds: string[]
  connectorEntryPort: string
  connectorExitPort: string
  prefix?: string
  overrides?: Record<string, ConnectionOverride>
}): TopologyModel {
  const {
    sideCount,
    connectorPartId,
    connectorPartIds,
    rodPartIds,
    connectorEntryPort,
    connectorExitPort,
    prefix = '',
    overrides = {},
  } = params

  const resolvedConnectorPartIds =
    connectorPartIds ?? Array.from({ length: sideCount }, () => connectorPartId ?? '')

  if (rodPartIds.length !== sideCount) {
    throw new Error(`Expected ${sideCount} rod part ids, got ${rodPartIds.length}`)
  }
  if (resolvedConnectorPartIds.length !== sideCount) {
    throw new Error(`Expected ${sideCount} connector part ids, got ${resolvedConnectorPartIds.length}`)
  }

  const id = (kind: 'c' | 'r', index: number): string => (prefix ? `${prefix}_${kind}${index}` : `${kind}${index}`)
  const parts = []
  const connections: TopologyConnection[] = []

  for (let index = 1; index <= sideCount; index += 1) {
    parts.push({ instance_id: id('c', index), part_id: resolvedConnectorPartIds[index - 1] })
    parts.push({ instance_id: id('r', index), part_id: rodPartIds[index - 1] })
  }

  for (let index = 1; index <= sideCount; index += 1) {
    const nextIndex = index === sideCount ? 1 : index + 1
    const entryOverride = overrides[`entry:${index}`] ?? {}
    const exitOverride = overrides[`exit:${index}`] ?? {}

    connections.push({
      from: `${id('c', index)}.${entryOverride.fromPort ?? connectorEntryPort}`,
      to: `${id('r', index)}.${entryOverride.toPort ?? 'end1'}`,
      joint_type: 'fixed',
      twist_deg: 0,
      fixed_roll: true,
      ...entryOverride.connection,
    })

    connections.push({
      from: `${id('r', index)}.${exitOverride.fromPort ?? 'end2'}`,
      to: `${id('c', nextIndex)}.${exitOverride.toPort ?? connectorExitPort}`,
      joint_type: 'fixed',
      twist_deg: 0,
      fixed_roll: true,
      ...exitOverride.connection,
    })
  }

  return {
    format_version: 'topology-v1',
    parts,
    connections,
  }
}

function mergeModels(...models: TopologyModel[]): TopologyModel {
  return {
    format_version: 'topology-v1',
    parts: models.flatMap((model) => model.parts),
    connections: models.flatMap((model) => model.connections),
  }
}

function createOctagonModel(prefix?: string): TopologyModel {
  return createLoopModel({
    sideCount: 8,
    connectorPartId: 'test-connector-135-v1',
    rodPartIds: Array.from({ length: 8 }, () => 'test-rod-16-v1'),
    connectorEntryPort: 'A',
    connectorExitPort: 'D',
    prefix,
  })
}

function createSquareModel(prefix?: string, rodPartIds?: string[]): TopologyModel {
  return createLoopModel({
    sideCount: 4,
    connectorPartId: 'test-connector-90-v1',
    rodPartIds: rodPartIds ?? Array.from({ length: 4 }, () => 'test-rod-100-v1'),
    connectorEntryPort: 'A',
    connectorExitPort: 'B',
    prefix,
  })
}

function createOctagonCompactText(): string {
  const lines: string[] = []

  for (let index = 1; index <= 8; index += 1) {
    lines.push(`part c${index} test-connector-135-v1`)
    lines.push(`part r${index} test-rod-16-v1`)
  }

  lines.push('')

  for (let index = 1; index <= 8; index += 1) {
    const nextIndex = index === 8 ? 1 : index + 1
    lines.push(`c${index}.A -- r${index}.end1 @ 0!`)
    lines.push(`r${index}.end2 -- c${nextIndex}.D @ 0!`)
  }

  return lines.join('\n')
}

describe('topologySolver loop refinement tests', () => {
  describe('Category 1: Valid Loop Closure', () => {
    it('1.1: solves the locked-roll octagon regression', () => {
      const solved = solveAndAssert(createOctagonModel())
      expect(solved.parts.length).toBe(16)
    })

    it('1.2: solves a 4-part square loop', () => {
      const solved = solveAndAssert(createSquareModel())
      expect(solved.parts.length).toBe(8)
    })

    it('1.3: solves the square when expressed through compact syntax', () => {
      const text = `
part c1 test-connector-90-v1
part c2 test-connector-90-v1
part c3 test-connector-90-v1
part c4 test-connector-90-v1
part r1 test-rod-100-v1
part r2 test-rod-100-v1
part r3 test-rod-100-v1
part r4 test-rod-100-v1

c1.A -- r1.end1 @ 0!
r1.end2 -- c2.B @ 0!
c2.A -- r2.end1 @ 0!
r2.end2 -- c3.B @ 0!
c3.A -- r3.end1 @ 0!
r3.end2 -- c4.B @ 0!
c4.A -- r4.end1 @ 0!
r4.end2 -- c1.B @ 0!
      `.trim()

      const solved = solveAndAssert(parseCompactTopology(text))
      expect(solved.parts.length).toBe(8)
    })

    it('1.4: solves the octagon when expressed through compact syntax', () => {
      const solved = solveAndAssert(parseCompactTopology(createOctagonCompactText()))
      expect(solved.parts.length).toBe(16)
    })
  })

  describe('Category 2: Order Independence', () => {
    it('2.1: octagon solve is equivalent under shuffled connection order', () => {
      const normal = createOctagonModel()
      const shuffled: TopologyModel = {
        ...normal,
        connections: [
          normal.connections[10],
          normal.connections[3],
          normal.connections[15],
          normal.connections[0],
          normal.connections[7],
          normal.connections[12],
          normal.connections[1],
          normal.connections[8],
          normal.connections[5],
          normal.connections[14],
          normal.connections[2],
          normal.connections[9],
          normal.connections[6],
          normal.connections[13],
          normal.connections[4],
          normal.connections[11],
        ],
      }

      assertGeometryEquivalent(solveAndAssert(normal), solveAndAssert(shuffled))
    })

    it('2.2: square solve is equivalent when each edge direction is reversed', () => {
      const normal = createSquareModel()
      const reversed: TopologyModel = {
        ...normal,
        connections: normal.connections.map((connection) => ({
          ...connection,
          from: connection.to,
          to: connection.from,
        })),
      }

      assertGeometryEquivalent(solveAndAssert(normal), solveAndAssert(reversed))
    })
  })

  describe('Category 3: Infeasible Loops', () => {
    it('3.1: rejects a square with one short rod', () => {
      const rodPartIds = ['test-rod-100-v1', 'test-rod-100-v1', 'test-rod-100-v1', 'test-rod-80-v1']
      expect(() => solveTopology(createSquareModel('', rodPartIds), partDefsById)).toThrow(TopologySolveError)
    })

    it('3.2: rejects an octagon with one short rod', () => {
      const rodPartIds = Array.from({ length: 8 }, (_, index) =>
        index === 4 ? 'test-rod-80-v1' : 'test-rod-16-v1',
      )
      expect(() => solveTopology(createLoopModel({
        sideCount: 8,
        connectorPartId: 'test-connector-135-v1',
        rodPartIds,
        connectorEntryPort: 'A',
        connectorExitPort: 'D',
      }), partDefsById)).toThrow(TopologySolveError)
    })

    it('3.3: rejects a square with one wrong connector angle', () => {
      const connectorPartIds = [
        'test-connector-120-v1',
        'test-connector-90-v1',
        'test-connector-90-v1',
        'test-connector-90-v1',
      ]
      expect(() => solveTopology(createLoopModel({
        sideCount: 4,
        connectorPartIds,
        rodPartIds: Array.from({ length: 4 }, () => 'test-rod-100-v1'),
        connectorEntryPort: 'A',
        connectorExitPort: 'B',
      }), partDefsById)).toThrow(TopologySolveError)
    })
  })

  describe('Category 4: Mixed Joint Types', () => {
    it('4.1: solves a loop with one inferred revolute joint', () => {
      const model = createLoopModel({
        sideCount: 4,
        connectorPartIds: [
          'test-connector-90-rot-v1',
          'test-connector-90-v1',
          'test-connector-90-v1',
          'test-connector-90-v1',
        ],
        rodPartIds: Array.from({ length: 4 }, () => 'test-rod-100-v1'),
        connectorEntryPort: 'A',
        connectorExitPort: 'B',
        overrides: {
          'exit:4': {
            connection: {
              joint_type: 'revolute',
              fixed_roll: false,
            },
          },
        },
      })

      const solved = solveAndAssert(model)
      expect(solved.parts.length).toBe(8)
    })

    it('4.2: solves a loop with one inferred prismatic joint', () => {
      const model = createLoopModel({
        sideCount: 4,
        connectorPartIds: [
          'test-connector-90-slide-v1',
          'test-connector-90-v1',
          'test-connector-90-v1',
          'test-connector-90-v1',
        ],
        rodPartIds: Array.from({ length: 4 }, () => 'test-rod-100-v1'),
        connectorEntryPort: 'A',
        connectorExitPort: 'B',
        overrides: {
          'exit:4': {
            connection: {
              joint_type: 'prismatic',
              fixed_roll: false,
            },
          },
        },
      })

      const solved = solveAndAssert(model)
      expect(solved.parts.length).toBe(8)
    })

    it('4.3: solves and tags a center-axial connection as revolute-compatible', () => {
      const model: TopologyModel = {
        format_version: 'topology-v1',
        parts: [
          { instance_id: 'c1', part_id: 'test-connector-center-v1' },
          { instance_id: 'r1', part_id: 'test-rod-200-axial-v1' },
        ],
        connections: [
          {
            from: 'c1.center',
            to: 'r1.center_axial_1',
            joint_type: 'revolute',
            twist_deg: 0,
            fixed_roll: false,
          },
        ],
      }

      const solved = solveAndAssert(model)
      expect(solved.parts.length).toBe(2)
      expect(solved.connections[0].joint_type).toBe('revolute')
    })
  })

  describe('Category 5: Regression (Open Chains)', () => {
    it('5.1: simple 2-part chain still solves', () => {
      const text = `
part c1 connector-3way-red-v1
part r1 rod-128-red-v1
c1.A -- r1.end1
      `.trim()

      const solved = solveAndAssert(parseCompactTopology(text))
      expect(solved.parts.length).toBe(2)
    })

    it('5.2: disconnected loop and chain components still solve', () => {
      const loopModel = createSquareModel('loop')
      const chainModel: TopologyModel = {
        format_version: 'topology-v1',
        parts: [
          { instance_id: 'chain_c1', part_id: 'connector-3way-red-v1' },
          { instance_id: 'chain_r1', part_id: 'rod-128-red-v1' },
        ],
        connections: [{ from: 'chain_c1.A', to: 'chain_r1.end1', joint_type: 'fixed', twist_deg: 0, fixed_roll: false }],
      }

      const solved = solveAndAssert(mergeModels(loopModel, chainModel))
      expect(solved.parts.length).toBe(10)
    })
  })

  describe('Category 6: Diagnostics And Residuals', () => {
    it('6.1: infeasible loops expose structured residual details', () => {
      try {
        solveTopology(
          createSquareModel('', ['test-rod-100-v1', 'test-rod-100-v1', 'test-rod-100-v1', 'test-rod-80-v1']),
          partDefsById,
        )
        throw new Error('Expected square solve to fail')
      } catch (error) {
        expect(error).toBeInstanceOf(TopologySolveError)
        const solveError = error as TopologySolveError
        expect(solveError.issues[0]?.code).toBe('loop_constraint_violation')
        expect(solveError.issues[0]?.details?.residualDistanceMm).toBeGreaterThan(0)
        expect(solveError.issues[0]?.details?.toleranceDistanceMm).toBe(2)
      }
    })

    it('6.2: open chains do not report loop-refinement warnings', () => {
      const model: TopologyModel = {
        format_version: 'topology-v1',
        parts: [
          { instance_id: 'c1', part_id: 'connector-3way-red-v1' },
          { instance_id: 'r1', part_id: 'rod-128-red-v1' },
        ],
        connections: [{ from: 'c1.A', to: 'r1.end1', joint_type: 'fixed', twist_deg: 0, fixed_roll: false }],
      }

      const solved = solveAndAssert(model)
      expect(solved.warnings ?? []).toHaveLength(0)
    })
  })
})
