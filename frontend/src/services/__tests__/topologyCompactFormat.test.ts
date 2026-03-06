import { describe, expect, it } from 'vitest'

import { parseCompactTopology, stringifyCompactTopology } from '../topologyCompactFormat'

describe('topologyCompactFormat', () => {
  it('parses explicit part declarations with mixed joint operators', () => {
    const text = `
part c1 connector-4way-green-v1
part r1 rod-128-red-v1
part m1 motor-v1

r1.end1 -- c1.A
m1.drive_axle ~~ r1.end2
`

    const model = parseCompactTopology(text)
    expect(model.parts).toHaveLength(3)
    expect(model.connections).toEqual([
      { from: 'c1.A', to: 'r1.end1', joint_type: 'fixed' },
      { from: 'm1.drive_axle', to: 'r1.end2', joint_type: 'revolute' },
    ])
  })

  it('supports semantic alias inference when no part declarations are present', () => {
    const text = `
rc3_1.A -- wr_1.end1
wr_1.end2 -- rc3_2.C
`

    const model = parseCompactTopology(text)
    const byInstance = new Map(model.parts.map((part) => [part.instance_id, part.part_id]))

    expect(byInstance.get('rc3_1')).toBe('connector-3way-red-v1')
    expect(byInstance.get('rc3_2')).toBe('connector-3way-red-v1')
    expect(byInstance.get('wr_1')).toBe('rod-32-white-v1')
  })

  it('stringifies topology into compact format and round-trips losslessly', () => {
    const initial = {
      format_version: 'topology-v1' as const,
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
      ],
      connections: [{ from: 'r1.end1', to: 'c1.A', joint_type: 'fixed' as const }],
    }

    const compact = stringifyCompactTopology(initial)
    const parsedBack = parseCompactTopology(compact)

    expect(parsedBack).toEqual({
      format_version: 'topology-v1',
      parts: [
        { instance_id: 'c1', part_id: 'connector-4way-green-v1' },
        { instance_id: 'r1', part_id: 'rod-128-red-v1' },
      ],
      connections: [{ from: 'c1.A', to: 'r1.end1', joint_type: 'fixed' }],
    })
  })

  it('throws actionable error for unknown alias inference', () => {
    expect(() => parseCompactTopology('mystery_1.A -- rc3_1.B')).toThrow(
      /Cannot infer part_id for instance 'mystery_1'/,
    )
  })

  it('handles connections with twist modifiers', () => {
    const text = `
part r1 rod-128-red-v1
part c1 connector-4way-green-v1
r1.center_tangent_y_pos -- c1.A @ 90
`.trim()
    const model = parseCompactTopology(text)
    expect(model.connections[0].twist_deg).toBe(90)

    const stringified = stringifyCompactTopology(model)
    expect(stringified).toContain('c1.A -- r1.center_tangent_y_pos @ 90')
  })
})
