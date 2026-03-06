import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { parseCompactTopology } from '../topologyCompactFormat'
import { solveTopology } from '../topologySolver'
import { PartLoader } from '../../core/parts/loader' // Wait, this is TS, I need to mock or use the JS part data

// Since we're in Vitest, we can't easily import the Python PartLoader.
// I'll create a mock part library with just the needed parts.
import red3Way from '../../../../parts/connector-3way-red-v1.json'
import yellow5Way from '../../../../parts/connector-5way-yellow-v1.json'
import redRod128 from '../../../../parts/rod-128-red-v1.json'
import yellowRod86 from '../../../../parts/rod-86-yellow-v1.json'
import { KnexPartDef } from '../types/parts'

const partDefsById = new Map<string, KnexPartDef>([
  ['connector-3way-red-v1', red3Way as any],
  ['connector-5way-yellow-v1', yellow5Way as any],
  ['rod-128-red-v1', redRod128 as any],
  ['rod-86-yellow-v1', yellowRod86 as any],
])

describe('User bug reproduction: side-clip orientation on reload', () => {
  it('correctly orients red 3-way connectors when loaded from compact topology', () => {
    const text = `
part connector-3way-red-v1-mmewoqc4 connector-3way-red-v1
part connector-3way-red-v1-mmewoqc6 connector-3way-red-v1
part connector-3way-red-v1-mmewoqc8 connector-3way-red-v1
part connector-5way-yellow-v1-1-mmewspir connector-5way-yellow-v1
part rod-128-red-v1-mmewoqc3 rod-128-red-v1
part rod-128-red-v1-mmewoqc7 rod-128-red-v1
part rod-86-yellow-v1-mmewoqc5 rod-86-yellow-v1

connector-3way-red-v1-mmewoqc4.A -- rod-128-red-v1-mmewoqc3.center_tangent_y_neg
connector-3way-red-v1-mmewoqc6.A -- rod-86-yellow-v1-mmewoqc5.center_tangent_y_neg
connector-3way-red-v1-mmewoqc8.A -- rod-128-red-v1-mmewoqc7.center_tangent_z_pos
connector-5way-yellow-v1-1-mmewspir.B -- rod-86-yellow-v1-mmewoqc5.end1
connector-5way-yellow-v1-1-mmewspir.C -- rod-128-red-v1-mmewoqc3.end1
connector-5way-yellow-v1-1-mmewspir.D -- rod-128-red-v1-mmewoqc7.end1
`.trim()

    const model = parseCompactTopology(text)
    const solved = solveTopology(model, partDefsById)

    // Find the red 3-way connector attached to rod center_tangent_y_neg
    const conn4 = solved.parts.find(p => p.instance_id === 'connector-3way-red-v1-mmewoqc4')!
    const rod3 = solved.parts.find(p => p.instance_id === 'rod-128-red-v1-mmewoqc3')!

    // Log world axes for all parts to see the full structure
    solved.parts.forEach(p => {
      const q = new Quaternion(...p.rotation)
      const xAxis = new Vector3(1, 0, 0).applyQuaternion(q)
      const yAxis = new Vector3(0, 1, 0).applyQuaternion(q)
      const zAxis = new Vector3(0, 0, 1).applyQuaternion(q)
      console.log(`Part ${p.instance_id}:`)
      console.log(`  pos: [${p.position.map(v => v.toFixed(2))}]`)
      console.log(`  X: [${xAxis.x.toFixed(2)}, ${xAxis.y.toFixed(2)}, ${xAxis.z.toFixed(2)}]`)
      console.log(`  Y: [${yAxis.x.toFixed(2)}, ${yAxis.y.toFixed(2)}, ${yAxis.z.toFixed(2)}]`)
      console.log(`  Z: [${zAxis.x.toFixed(2)}, ${zAxis.y.toFixed(2)}, ${zAxis.z.toFixed(2)}]`)
    })

    // For a "correct" orientation, the connector plane should be aligned with the rod.
    // If the rod is horizontal (main axis X), the connector normal (local Z) should be orthogonal to Rod X.
    const connQuat = new Quaternion(...conn4.rotation)
    const rodQuat = new Quaternion(...rod3.rotation)
    
    const connNormal = new Vector3(0, 0, 1).applyQuaternion(connQuat)
    const rodAxis = new Vector3(1, 0, 0).applyQuaternion(rodQuat)
    
    const dot = Math.abs(connNormal.dot(rodAxis))
    expect(dot).toBeLessThan(0.01) // Should be flat!
  })
})
