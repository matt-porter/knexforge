import fs from 'fs'
import path from 'path'

import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import type { KnexPartDef, Port } from '../../types/parts'
import {
  buildStateToTopology,
  canonicalizeTopology,
  solveTopology,
  TopologySolveError,
  TopologyValidationError,
  type TopologyModel,
} from '../topologySolver'

function loadPartDef(partId: string): KnexPartDef {
  const filePath = path.resolve(__dirname, '../../../../parts', `${partId}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnexPartDef
}

function loadPartDefs(): Map<string, KnexPartDef> {
  const ids = [
    'connector-4way-green-v1',
    'connector-3way-red-v1',
    'rod-128-red-v1',
    'rod-32-white-v1',
  ]

  const result = new Map<string, KnexPartDef>()
  for (const id of ids) {
    result.set(id, loadPartDef(id))
  }
  return result
}

function findPort(part: KnexPartDef, portId: string): Port {
  const port = part.ports.find((entry) => entry.id === portId)
  if (!port) {
    throw new Error(`Port '${portId}' not found on '${part.id}'`)
  }
  return port
}

function worldPort(
  position: [number, number, number],
  rotation: [number, number, number, number],
  port: Port,
): { position: Vector3; direction: Vector3 } {
  const q = new Quaternion(rotation[0], rotation[1], rotation[2], rotation[3])
  const localPosition = new Vector3(port.position[0], port.position[1], port.position[2])
  const localDirection = new Vector3(port.direction[0], port.direction[1], port.direction[2])

  return {
    position: localPosition.applyQuaternion(q).add(new Vector3(position[0], position[1], position[2])),
    direction: localDirection.applyQuaternion(q).normalize(),
  }
}

describe('topologySolver', () => {
  it('canonicalizeTopology sorts parts and normalizes reversed edges', () => {
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'z1', part_id: 'rod-128-red-v1' },
        { instance_id: 'a1', part_id: 'connector-4way-green-v1' },
      ],
      connections: [{ from: 'z1.end1', to: 'a1.A' }],
    }

    const canonical = canonicalizeTopology(model)
    expect(canonical.parts.map((part) => part.instance_id)).toEqual(['a1', 'z1'])
    expect(canonical.connections[0]).toEqual({
      from: 'a1.A',
      to: 'z1.end1',
      joint_type: undefined,
    })
  })

  it('rejects unknown parts and malformed refs with structured validation errors', () => {
    const defs = loadPartDefs()
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [{ instance_id: 'x1', part_id: 'nonexistent-part' }],
      connections: [{ from: 'x1', to: 'x2.A' }],
    }

    expect(() => solveTopology(model, defs)).toThrowError(TopologyValidationError)
    try {
      solveTopology(model, defs)
    } catch (error) {
      const validationError = error as TopologyValidationError
      expect(validationError.issues.some((issue) => issue.code === 'unknown_part_id')).toBe(true)
      expect(validationError.issues.some((issue) => issue.code === 'invalid_connection_ref')).toBe(true)
    }
  })

  it('rejects duplicate/reversed duplicate connections and reused ports', () => {
    const defs = loadPartDefs()
    const model: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
        { instance_id: 'r2', part_id: 'rod-128-red-v1' },
      ],
      connections: [
        { from: 'c1.A', to: 'r1.end1' },
        { from: 'r1.end1', to: 'c1.A' },
        { from: 'c1.A', to: 'r2.end1' },
      ],
    }

    expect(() => solveTopology(model, defs)).toThrowError(TopologyValidationError)
    try {
      solveTopology(model, defs)
    } catch (error) {
      const validationError = error as TopologyValidationError
      expect(validationError.issues.some((issue) => issue.code === 'duplicate_connection')).toBe(true)
      expect(validationError.issues.some((issue) => issue.code === 'port_reused')).toBe(true)
    }
  })

  it('solves a simple topology and enforces positional/angle residuals', () => {
    const defs = loadPartDefs()
    const topology: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
      ],
      connections: [{ from: 'r1.end1', to: 'c1.A' }],
    }

    const solved = solveTopology(topology, defs)
    expect(solved.parts).toHaveLength(2)
    expect(solved.connections).toHaveLength(1)

    const byId = new Map(solved.parts.map((part) => [part.instance_id, part]))
    const connector = byId.get('c1')!
    const rod = byId.get('r1')!

    const cDef = defs.get(connector.part_id)!
    const rDef = defs.get(rod.part_id)!

    const cPort = worldPort(connector.position, connector.rotation, findPort(cDef, 'A'))
    const rPort = worldPort(rod.position, rod.rotation, findPort(rDef, 'end1'))

    const distance = cPort.position.distanceTo(rPort.position)
    const directionDot = cPort.direction.dot(rPort.direction.clone().negate())

    expect(distance).toBeLessThan(0.5)
    expect(directionDot).toBeGreaterThan(0.99)
  })

  it('is deterministic for shuffled equivalent input', () => {
    const defs = loadPartDefs()

    const topologyA: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
        { instance_id: 'c2', part_id: 'connector-4way-green-v1' },
      ],
      connections: [
        { from: 'r1.end1', to: 'c1.A' },
        { from: 'r1.end2', to: 'c2.A' },
      ],
    }

    const topologyB: TopologyModel = {
      format_version: 'topology-v1',
      parts: [...topologyA.parts].reverse(),
      connections: [
        { from: 'c2.A', to: 'r1.end2' },
        { from: 'c1.A', to: 'r1.end1' },
      ],
    }

    const solvedA = solveTopology(topologyA, defs)
    const solvedB = solveTopology(topologyB, defs)

    const norm = (parts: typeof solvedA.parts) =>
      [...parts]
        .sort((left, right) => left.instance_id.localeCompare(right.instance_id))
        .map((part) => ({
          id: part.instance_id,
          pos: part.position.map((value) => Number(value.toFixed(6))),
          rot: part.rotation.map((value) => Number(value.toFixed(6))),
        }))

    expect(norm(solvedA.parts)).toEqual(norm(solvedB.parts))
  })

  it('anchors disconnected components with deterministic spacing', () => {
    const defs = loadPartDefs()
    const topology: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'a_connector', part_id: 'connector-4way-green-v1' },
        { instance_id: 'b_connector', part_id: 'connector-4way-green-v1' },
      ],
      connections: [],
    }

    const solved = solveTopology(topology, defs, { componentSpacingMm: 300 })
    const byId = new Map(solved.parts.map((part) => [part.instance_id, part]))

    expect(byId.get('a_connector')?.position).toEqual([0, 0, 0])
    expect(byId.get('b_connector')?.position).toEqual([300, 0, 0])
  })

  it('fails with a closed-loop residual violation for inconsistent constraints', () => {
    const defs = loadPartDefs()
    const topology: TopologyModel = {
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'c2', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
        { instance_id: 'r2', part_id: 'rod-128-red-v1' },
      ],
      connections: [
        { from: 'r1.end1', to: 'c1.A' },
        { from: 'r1.end2', to: 'c2.A' },
        { from: 'r2.end1', to: 'c1.B' },
        { from: 'r2.end2', to: 'c2.C' },
      ],
    }

    expect(() => solveTopology(topology, defs)).toThrowError(TopologySolveError)
  })

  it('buildStateToTopology strips transforms and keeps graph semantics', () => {
    const topology = buildStateToTopology(
      [
        {
          instance_id: 'r1',
          part_id: 'rod-128-red-v1',
          position: [10, 20, 30],
          rotation: [0, 0, 0, 1],
          color: '#FFFFFF',
        },
      ],
      [
        {
          from_instance: 'r1',
          from_port: 'end1',
          to_instance: 'c1',
          to_port: 'A',
          joint_type: 'fixed',
        },
      ],
    )

    expect(topology.format_version).toBe('topology-v1')
    expect(topology.parts[0]).toEqual({
      instance_id: 'r1',
      part_id: 'rod-128-red-v1',
      color: '#FFFFFF',
    })
    expect(topology.connections[0]).toEqual({
      from: 'c1.A',
      to: 'r1.end1',
      joint_type: 'fixed',
    })
  })
})
