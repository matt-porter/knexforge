import red3Way from '../../../../parts/connector-3way-red-v1.json'
import green4Way from '../../../../parts/connector-4way-green-v1.json'
import yellow5Way from '../../../../parts/connector-5way-yellow-v1.json'
import redRod128 from '../../../../parts/rod-128-red-v1.json'
import yellowRod86 from '../../../../parts/rod-86-yellow-v1.json'
import greenRod16 from '../../../../parts/rod-16-green-v1.json'
import whiteRod32 from '../../../../parts/rod-32-white-v1.json'
import blueRod54 from '../../../../parts/rod-54-blue-v1.json'
import greyRod190 from '../../../../parts/rod-190-grey-v1.json'
import grey2Way from '../../../../parts/connector-2way-grey-v1.json'
import orange2Way from '../../../../parts/connector-2way-orange-v1.json'
import grey1Way from '../../../../parts/connector-1way-grey-v1.json'
import purple4Way3d from '../../../../parts/connector-4way-3d-purple-v1.json'
import blue7Way3d from '../../../../parts/connector-7way-blue-v1.json'
import white8Way from '../../../../parts/connector-8way-white-v1.json'
import motor from '../../../../parts/motor-v1.json'

import type { KnexPartDef, Port } from '../../types/parts'

function makePort(
  id: string,
  direction: [number, number, number],
  mate_type: Port['mate_type'] = 'rod_hole',
  accepts: Port['accepts'] = ['rod_end'],
): Port {
  return {
    id,
    position: [0, 0, 0],
    direction,
    mate_type,
    accepts,
    allowed_angles_deg: [0, 90, 180, 270],
  }
}

function makeConnector(id: string, name: string, ports: Port[]): KnexPartDef {
  return {
    format_version: '1.1',
    id,
    name,
    category: 'connector',
    mesh_file: `meshes/${id}.glb`,
    default_color: '#888888',
    mass_grams: 1,
    ports,
  }
}

function makeRod(id: string, name: string, lengthMm: number, extraPorts: Port[] = []): KnexPartDef {
  return {
    format_version: '1.1',
    id,
    name,
    category: 'rod',
    mesh_file: `meshes/${id}.glb`,
    default_color: '#cccccc',
    mass_grams: 1,
    ports: [
      {
        id: 'end1',
        position: [0, 0, 0],
        direction: [-1, 0, 0],
        mate_type: 'rod_end',
        accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
        allowed_angles_deg: [0],
      },
      {
        id: 'end2',
        position: [lengthMm, 0, 0],
        direction: [1, 0, 0],
        mate_type: 'rod_end',
        accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
        allowed_angles_deg: [0],
      },
      ...extraPorts,
    ],
  }
}

const SQRT_1_2 = Math.SQRT1_2
const SQRT_3_OVER_2 = 0.8660254037844386

const syntheticPartDefs: KnexPartDef[] = [
  makeConnector('test-connector-90-v1', 'Test Connector 90', [
    makePort('A', [1, 0, 0]),
    makePort('B', [0, 1, 0]),
  ]),
  makeConnector('test-connector-90-rot-v1', 'Test Connector 90 Revolute', [
    makePort('A', [1, 0, 0]),
    makePort('B', [0, 1, 0], 'rotational_hole', ['rod_end']),
  ]),
  makeConnector('test-connector-90-slide-v1', 'Test Connector 90 Prismatic', [
    makePort('A', [1, 0, 0]),
    makePort('B', [0, 1, 0], 'slider_hole', ['rod_end']),
  ]),
  makeConnector('test-connector-120-v1', 'Test Connector 120', [
    makePort('A', [1, 0, 0]),
    makePort('B', [-0.5, SQRT_3_OVER_2, 0]),
  ]),
  makeConnector('test-connector-135-v1', 'Test Connector 135', [
    makePort('A', [1, 0, 0]),
    makePort('D', [-SQRT_1_2, SQRT_1_2, 0]),
  ]),
  makeConnector('test-connector-center-v1', 'Test Connector With Center', [
    makePort('A', [1, 0, 0]),
    makePort('B', [0, 1, 0]),
    makePort('center', [0, 0, 1], 'rod_hole', ['rod_end']),
  ]),
  makeRod('test-rod-16-v1', 'Test Rod 16', 16),
  makeRod('test-rod-100-v1', 'Test Rod 100', 100),
  makeRod('test-rod-80-v1', 'Test Rod 80', 80),
  makeRod('test-rod-200-axial-v1', 'Test Rod 200 Axial', 200, [
    {
      id: 'center_axial_1',
      position: [100, 0, 0],
      direction: [-1, 0, 0],
      mate_type: 'rod_end',
      accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
      allowed_angles_deg: [0],
    },
    {
      id: 'center_axial_2',
      position: [100, 0, 0],
      direction: [1, 0, 0],
      mate_type: 'rod_end',
      accepts: ['rod_hole', 'rotational_hole', 'slider_hole'],
      allowed_angles_deg: [0],
    },
  ]),
]

export const partDefsById = new Map<string, KnexPartDef>([
  ['connector-1way-grey-v1', grey1Way as any],
  ['connector-2way-grey-v1', grey2Way as any],
  ['connector-2way-orange-v1', orange2Way as any],
  ['connector-3way-red-v1', red3Way as any],
  ['connector-4way-green-v1', green4Way as any],
  ['connector-4way-3d-purple-v1', purple4Way3d as any],
  ['connector-5way-yellow-v1', yellow5Way as any],
  ['connector-7way-blue-v1', blue7Way3d as any],
  ['connector-8way-white-v1', white8Way as any],
  ['rod-16-green-v1', greenRod16 as any],
  ['rod-32-white-v1', whiteRod32 as any],
  ['rod-54-blue-v1', blueRod54 as any],
  ['rod-86-yellow-v1', yellowRod86 as any],
  ['rod-128-red-v1', redRod128 as any],
  ['rod-190-grey-v1', greyRod190 as any],
  ['motor-v1', motor as any],
  ...syntheticPartDefs.map((partDef) => [partDef.id, partDef] as const),
])
