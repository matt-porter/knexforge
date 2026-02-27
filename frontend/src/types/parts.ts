/**
 * TypeScript types mirroring the K'Nex part JSON schema.
 * These types are used throughout the frontend for type-safe part handling.
 */

/** A connection port on a K'Nex part. */
export interface Port {
  id: string
  position: [number, number, number]
  direction: [number, number, number]
  mate_type: 'rod_end' | 'rod_hole' | 'tab' | 'clip' | 'rod_side' | 'slide_hole' | 'connector_slot' | 'rotational_hole' | 'slider_hole'
  accepts: ('rod_end' | 'rod_hole' | 'tab' | 'clip' | 'rod_side' | 'slide_hole' | 'connector_slot' | 'rotational_hole' | 'slider_hole')[]
  allowed_angles_deg: number[]
}

/** A K'Nex part definition loaded from JSON. */
export interface KnexPartDef {
  format_version: string
  id: string
  name: string
  category: 'rod' | 'connector' | 'wheel' | 'special'
  mesh_file: string
  default_color: string
  mass_grams: number
  ports: Port[]
}

/** A placed instance of a part in a build. */
export interface PartInstance {
  instance_id: string
  part_id: string
  position: [number, number, number]
  rotation: [number, number, number, number] // quaternion [x, y, z, w]
  color?: string // override default_color
}

/** A connection between two part instances. */
export interface Connection {
  from_instance: string
  from_port: string
  to_instance: string
  to_port: string
  joint_type?: 'fixed' | 'revolute' | 'prismatic'
}

/** The complete state of a K'Nex build. */
export interface BuildState {
  parts: PartInstance[]
  connections: Connection[]
}
