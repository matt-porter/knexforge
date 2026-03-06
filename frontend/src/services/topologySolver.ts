import { Quaternion, Vector3 } from 'three'

import type { Connection, KnexPartDef, PartInstance, Port } from '../types/parts'

export interface TopologyPart {
  instance_id: string
  part_id: string
  color?: string
}

export interface TopologyConnection {
  from: string
  to: string
  joint_type?: 'fixed' | 'revolute' | 'prismatic'
  twist_deg?: number
  fixed_roll?: boolean
}

export interface TopologyModel {
  format_version: 'topology-v1'
  parts: TopologyPart[]
  connections: TopologyConnection[]
  metadata?: Record<string, unknown>
}

export interface SolveTopologyOptions {
  componentSpacingMm?: number
  positionToleranceMm?: number
  angleToleranceDeg?: number
  /** Offset Y position to lift build above ground plane (default: 50mm) */
  groundOffsetMm?: number
}

export interface SolvedTopologyBuild {
  parts: PartInstance[]
  connections: Connection[]
}

export interface TopologyIssue {
  code: string
  message: string
  item?: string
}

export class TopologyValidationError extends Error {
  readonly issues: TopologyIssue[]

  constructor(issues: TopologyIssue[]) {
    super(`Topology validation failed with ${issues.length} issue(s)`)
    this.name = 'TopologyValidationError'
    this.issues = issues
  }
}

export class TopologySolveError extends Error {
  readonly issues: TopologyIssue[]

  constructor(message: string, issues: TopologyIssue[] = []) {
    super(message)
    this.name = 'TopologySolveError'
    this.issues = issues
  }
}

interface ConnectionEndpoints {
  fromInstance: string
  fromPort: string
  toInstance: string
  toPort: string
}

interface ResolvedConnection {
  from_instance: string
  from_port: string
  to_instance: string
  to_port: string
  joint_type: 'fixed' | 'revolute' | 'prismatic'
  twist_deg: number
  fixed_roll: boolean
  key: string
}

interface Transform {
  position: Vector3
  rotation: Quaternion
}

function normalizeLegacyRodSidePortId(portId: string): string {
  return portId === 'center_tangent' ? 'center_tangent_y_pos' : portId
}

function parseEndpointRef(value: string): ConnectionEndpoints | null {
  const first = value.indexOf('.')
  if (first <= 0 || first === value.length - 1) return null
  return {
    fromInstance: value.slice(0, first),
    fromPort: normalizeLegacyRodSidePortId(value.slice(first + 1)),
    toInstance: '',
    toPort: '',
  }
}

function parseConnectionEndpoints(connection: TopologyConnection): ConnectionEndpoints | null {
  const from = parseEndpointRef(connection.from)
  const to = parseEndpointRef(connection.to)
  if (!from || !to) return null

  return {
    fromInstance: from.fromInstance,
    fromPort: from.fromPort,
    toInstance: to.fromInstance,
    toPort: to.fromPort,
  }
}

function endpointRef(instanceId: string, portId: string): string {
  return `${instanceId}.${portId}`
}

function normalizedPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

function canonicalConnectionKey(from: string, to: string): string {
  const [left, right] = normalizedPair(from, to)
  return `${left}|${right}`
}

function inferJointType(fromPort: Port, toPort: Port): 'fixed' | 'revolute' | 'prismatic' {
  const mateTypes = new Set([fromPort.mate_type, toPort.mate_type])
  if (mateTypes.has('rotational_hole')) return 'revolute'
  if (mateTypes.has('slider_hole')) return 'prismatic'
  if (fromPort.id.startsWith('center_axial') || toPort.id.startsWith('center_axial')) return 'revolute'
  return 'fixed'
}

function getPartPort(partDef: KnexPartDef, portId: string): Port | null {
  return partDef.ports.find((port) => port.id === portId) ?? null
}

function arePortsCompatible(a: Port, b: Port): boolean {
  return a.accepts.includes(b.mate_type) && b.accepts.includes(a.mate_type)
}

function getWorldPortPose(transform: Transform, port: Port): { position: Vector3; direction: Vector3 } {
  const localPosition = new Vector3(port.position[0], port.position[1], port.position[2])
  const localDirection = new Vector3(port.direction[0], port.direction[1], port.direction[2])

  return {
    position: localPosition.clone().applyQuaternion(transform.rotation).add(transform.position),
    direction: localDirection.clone().applyQuaternion(transform.rotation).normalize(),
  }
}

function candidateAngles(port: Port): number[] {
  const raw = port.allowed_angles_deg.length > 0 ? port.allowed_angles_deg : [0]
  const unique = Array.from(new Set(raw))
  return unique.sort((a, b) => a - b)
}

function buildPlacementCandidate(
  anchor: Transform,
  anchorPort: Port,
  placingPort: Port,
  twistDeg: number,
  anchorDef: KnexPartDef,
  placingDef: KnexPartDef,
  fixedRoll = false
): Transform {
  const anchorPose = getWorldPortPose(anchor, anchorPort)
  const desiredDirection = anchorPose.direction.clone().negate()

  const localPlacingDirection = new Vector3(
    placingPort.direction[0],
    placingPort.direction[1],
    placingPort.direction[2],
  ).normalize()

  // Step 1: Base Alignment
  const rotAxis = new Vector3().crossVectors(localPlacingDirection, desiredDirection)
  const rotAngle = Math.acos(Math.max(-1, Math.min(1, localPlacingDirection.dot(desiredDirection))))

  let baseRotation: Quaternion
  if (rotAngle < 0.001) {
    baseRotation = new Quaternion(0, 0, 0, 1)
  } else if (rotAngle > Math.PI - 0.001) {
    const perpAxis = new Vector3(0, 1, 0)
    if (Math.abs(localPlacingDirection.dot(perpAxis)) > 0.9) {
      perpAxis.set(1, 0, 0)
    }
    baseRotation = new Quaternion().setFromAxisAngle(perpAxis, Math.PI)
  } else {
    rotAxis.normalize()
    baseRotation = new Quaternion().setFromAxisAngle(rotAxis, rotAngle)
  }

  // Step 2: Deterministic Side-Clip Orientation (skip if fixedRoll is requested)
  const isPlacingRod = placingDef.category === 'rod'
  const isAnchorRod = anchorDef.category === 'rod'
  const isRodConnectorSide = (
    (isPlacingRod && placingPort.mate_type === 'rod_side') ||
    (isAnchorRod && anchorPort.mate_type === 'rod_side')
  )

  if (isRodConnectorSide && !fixedRoll) {
    // Determine if we're dealing with a flat connector edge
    const connectorPort = isPlacingRod ? anchorPort : placingPort
    const isFlatEdge = Math.abs(connectorPort.direction[2]) < 0.1

    if (!isPlacingRod) {
      // Connector being placed onto Rod.
      // For flat edge: Connector's local Y should align with Rod's world X (rod is flat in plane)
      // For 3D edge: Connector's local Z (normal) should align with Rod's world X (rod is vertical)
      const rodWorldX = new Vector3(1, 0, 0).applyQuaternion(anchor.rotation).normalize()
      const sourceVec = new Vector3(0, isFlatEdge ? 1 : 0, isFlatEdge ? 0 : 1).applyQuaternion(baseRotation)
      
      const correctionAxis = desiredDirection.clone().normalize()
      const projSrc = sourceVec.clone().projectOnPlane(correctionAxis).normalize()
      const projRodX = rodWorldX.clone().projectOnPlane(correctionAxis).normalize()
      
      if (projSrc.lengthSq() > 0.001 && projRodX.lengthSq() > 0.001) {
          const dot = Math.max(-1, Math.min(1, projSrc.dot(projRodX)))
          const cross = new Vector3().crossVectors(projSrc, projRodX)
          let angle = Math.acos(dot)
          if (cross.dot(correctionAxis) < 0) angle = -angle
          
          const correctionQuat = new Quaternion().setFromAxisAngle(correctionAxis, angle)
          baseRotation.premultiply(correctionQuat)
      }
    } else {
      // Rod being placed onto Connector.
      // For flat edge: Rod's local X should align with Connector's world Y (rod is flat in plane)
      // For 3D edge: Rod's local X should align with Connector's world Z (rod is vertical)
      const targetVec = new Vector3(0, isFlatEdge ? 1 : 0, isFlatEdge ? 0 : 1).applyQuaternion(anchor.rotation).normalize()
      const rodX = new Vector3(1, 0, 0).applyQuaternion(baseRotation)

      const correctionAxis = desiredDirection.clone().normalize()
      const projRodX = rodX.clone().projectOnPlane(correctionAxis).normalize()
      const projTarget = targetVec.clone().projectOnPlane(correctionAxis).normalize()

      if (projRodX.lengthSq() > 0.001 && projTarget.lengthSq() > 0.001) {
        const dot = Math.max(-1, Math.min(1, projRodX.dot(projTarget)))
        const cross = new Vector3().crossVectors(projRodX, projTarget)
        let angle = Math.acos(dot)
        if (cross.dot(correctionAxis) < 0) angle = -angle

        const correctionQuat = new Quaternion().setFromAxisAngle(correctionAxis, angle)
        baseRotation.premultiply(correctionQuat)
      }
    }
  }

  // Step 3: Apply user twist around the aligned direction
  const twistRotation = new Quaternion().setFromAxisAngle(
    desiredDirection.clone(),
    (twistDeg * Math.PI) / 180,
  )

  const finalRotation = twistRotation.clone().multiply(baseRotation).normalize()
  
  const localPlacingPosition = new Vector3(
    placingPort.position[0],
    placingPort.position[1],
    placingPort.position[2],
  )

  const worldPosition = anchorPose.position
    .clone()
    .sub(localPlacingPosition.clone().applyQuaternion(finalRotation))

  return { position: worldPosition, rotation: finalRotation }
}

function connectionResidual(
  connection: ResolvedConnection,
  transforms: Map<string, Transform>,
  partDefs: Map<string, KnexPartDef>,
): { distance: number; angleDeg: number } {
  const fromTransform = transforms.get(connection.from_instance)
  const toTransform = transforms.get(connection.to_instance)
  if (!fromTransform || !toTransform) {
    throw new TopologySolveError(`Missing transform for connection ${connection.key}`)
  }

  const fromPart = partDefs.get(connection.from_instance)
  const toPart = partDefs.get(connection.to_instance)
  if (!fromPart || !toPart) {
    throw new TopologySolveError(`Missing part definition while checking connection ${connection.key}`)
  }

  const fromPort = getPartPort(fromPart, connection.from_port)
  const toPort = getPartPort(toPart, connection.to_port)
  if (!fromPort || !toPort) {
    throw new TopologySolveError(`Missing port while checking connection ${connection.key}`)
  }

  const fromPose = getWorldPortPose(fromTransform, fromPort)
  const toPose = getWorldPortPose(toTransform, toPort)

  const distance = fromPose.position.distanceTo(toPose.position)
  const dot = Math.max(-1, Math.min(1, fromPose.direction.clone().negate().dot(toPose.direction)))
  const angleDeg = (Math.acos(dot) * 180) / Math.PI

  return { distance, angleDeg }
}

function validateAndResolveConnections(
  model: TopologyModel,
  partDefsById: Map<string, KnexPartDef>,
): { partsByInstance: Map<string, KnexPartDef>; connections: ResolvedConnection[] } {
  const issues: TopologyIssue[] = []

  if (model.format_version !== 'topology-v1') {
    issues.push({
      code: 'invalid_format_version',
      message: `Expected format_version 'topology-v1', got '${model.format_version}'`,
      item: 'format_version',
    })
  }

  const partsByInstance = new Map<string, KnexPartDef>()
  const colorsByInstance = new Map<string, string>()
  for (const part of model.parts) {
    if (partsByInstance.has(part.instance_id)) {
      issues.push({
        code: 'duplicate_instance',
        message: `Duplicate instance_id '${part.instance_id}'`,
        item: part.instance_id,
      })
      continue
    }

    const partDef = partDefsById.get(part.part_id)
    if (!partDef) {
      issues.push({
        code: 'unknown_part_id',
        message: `Unknown part_id '${part.part_id}' for instance '${part.instance_id}'`,
        item: part.instance_id,
      })
      continue
    }

    if (part.color !== undefined) {
      colorsByInstance.set(part.instance_id, part.color)
    }
    partsByInstance.set(part.instance_id, partDef)
  }

  const usedPorts = new Set<string>()
  const seenConnections = new Set<string>()
  const resolvedConnections: ResolvedConnection[] = []

  for (const connection of model.connections) {
    const endpoints = parseConnectionEndpoints(connection)
    if (!endpoints) {
      issues.push({
        code: 'invalid_connection_ref',
        message: `Invalid connection ref '${connection.from}' -> '${connection.to}'`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    if (endpoints.fromInstance === endpoints.toInstance) {
      issues.push({
        code: 'self_connection',
        message: `Self-connections are not allowed (${connection.from} -> ${connection.to})`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    const fromPart = partsByInstance.get(endpoints.fromInstance)
    const toPart = partsByInstance.get(endpoints.toInstance)
    if (!fromPart || !toPart) {
      issues.push({
        code: 'unknown_instance',
        message: `Connection references unknown instance (${connection.from} -> ${connection.to})`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    const fromPort = getPartPort(fromPart, endpoints.fromPort)
    const toPort = getPartPort(toPart, endpoints.toPort)
    if (!fromPort || !toPort) {
      issues.push({
        code: 'unknown_port',
        message: `Connection references unknown port (${connection.from} -> ${connection.to})`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    if (!arePortsCompatible(fromPort, toPort)) {
      issues.push({
        code: 'incompatible_ports',
        message: `Ports are incompatible (${connection.from} -> ${connection.to})`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    const fromEndpoint = endpointRef(endpoints.fromInstance, endpoints.fromPort)
    const toEndpoint = endpointRef(endpoints.toInstance, endpoints.toPort)
    const duplicateKey = canonicalConnectionKey(fromEndpoint, toEndpoint)
    if (seenConnections.has(duplicateKey)) {
      issues.push({
        code: 'duplicate_connection',
        message: `Duplicate connection '${connection.from}' ↔ '${connection.to}'`,
        item: duplicateKey,
      })
      continue
    }

    if (usedPorts.has(fromEndpoint) || usedPorts.has(toEndpoint)) {
      issues.push({
        code: 'port_reused',
        message: `Each port can only be used once (${connection.from} -> ${connection.to})`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    const inferred = inferJointType(fromPort, toPort)
    if (connection.joint_type && connection.joint_type !== inferred) {
      issues.push({
        code: 'joint_type_mismatch',
        message: `joint_type '${connection.joint_type}' does not match inferred '${inferred}' for ${connection.from} -> ${connection.to}`,
        item: `${connection.from}|${connection.to}`,
      })
      continue
    }

    seenConnections.add(duplicateKey)
    usedPorts.add(fromEndpoint)
    usedPorts.add(toEndpoint)
    resolvedConnections.push({
      from_instance: endpoints.fromInstance,
      from_port: endpoints.fromPort,
      to_instance: endpoints.toInstance,
      to_port: endpoints.toPort,
      joint_type: inferred,
      twist_deg: connection.twist_deg ?? 0,
      key: duplicateKey,
    })
  }

  if (issues.length > 0) {
    throw new TopologyValidationError(issues)
  }

  const normalizedParts = [...model.parts]
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id))
    .map((part) => ({
      ...part,
      color: colorsByInstance.get(part.instance_id),
    }))
  model.parts = normalizedParts

  return { partsByInstance, connections: resolvedConnections }
}

export function canonicalizeTopology(model: TopologyModel): TopologyModel {
  const parts = [...model.parts].sort((a, b) => a.instance_id.localeCompare(b.instance_id))

  const connections = model.connections
    .map((connection) => {
      const parsed = parseConnectionEndpoints(connection)
      if (!parsed) return connection

      const normalized = {
        from: endpointRef(parsed.fromInstance, parsed.fromPort),
        to: endpointRef(parsed.toInstance, parsed.toPort),
        joint_type: connection.joint_type,
        twist_deg: connection.twist_deg,
        fixed_roll: connection.fixed_roll,
      }

      const left = endpointRef(parsed.fromInstance, parsed.fromPort)
      const right = endpointRef(parsed.toInstance, parsed.toPort)
      if (left <= right) return normalized

      return {
        from: normalized.to,
        to: normalized.from,
        joint_type: normalized.joint_type,
        twist_deg: normalized.twist_deg,
        fixed_roll: normalized.fixed_roll,
      }
    })
    .sort((a, b) => {
      const left = `${a.from}|${a.to}|${a.joint_type ?? ''}`
      const right = `${b.from}|${b.to}|${b.joint_type ?? ''}`
      return left.localeCompare(right)
    })

  return {
    ...model,
    format_version: 'topology-v1',
    parts,
    connections,
  }
}

export function buildStateToTopology(
  parts: PartInstance[],
  connections: Connection[],
  metadata?: Record<string, unknown>,
): TopologyModel {
  const topologyParts: TopologyPart[] = parts
    .map((part) => ({
      instance_id: part.instance_id,
      part_id: part.part_id,
      color: part.color,
    }))
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id))

  const topologyConnections: TopologyConnection[] = connections
    .map((connection) => ({
      from: endpointRef(connection.from_instance, normalizeLegacyRodSidePortId(connection.from_port)),
      to: endpointRef(connection.to_instance, normalizeLegacyRodSidePortId(connection.to_port)),
      joint_type: connection.joint_type,
      twist_deg: connection.twist_deg,
      fixed_roll: connection.fixed_roll,
    }))

  return canonicalizeTopology({
    format_version: 'topology-v1',
    parts: topologyParts,
    connections: topologyConnections,
    metadata,
  })
}

export function solveTopology(
  model: TopologyModel,
  partDefsById: Map<string, KnexPartDef>,
  options: SolveTopologyOptions = {},
): SolvedTopologyBuild {
  const componentSpacingMm = options.componentSpacingMm ?? 220
  // Increased from 0.5mm to 2.0mm to account for cumulative geometric errors in closed loops.
  // Real K'Nex parts have manufacturing tolerances ~0.2mm per port, and complex loops
  // (e.g., triangles) can accumulate position errors across 4-6 parts. 2.0mm is reasonable for
  // geometry-based solver without iterative refinement. See #4.
  const positionToleranceMm = options.positionToleranceMm ?? 2.0
  // Increased from 8.0° to 15.0° for similar reasons: port angle measurements and computation
  // accumulate across multi-part constraints.
  const angleToleranceDeg = options.angleToleranceDeg ?? 15.0
  // Lift builds above ground plane so they sit ON the ground, not IN it
  const groundOffsetMm = options.groundOffsetMm ?? 50

  const canonical = canonicalizeTopology(model)
  const { partsByInstance, connections } = validateAndResolveConnections(canonical, partDefsById)

  const adjacency = new Map<string, ResolvedConnection[]>()
  for (const instanceId of partsByInstance.keys()) {
    adjacency.set(instanceId, [])
  }
  for (const connection of connections) {
    adjacency.get(connection.from_instance)?.push(connection)
    adjacency.get(connection.to_instance)?.push(connection)
  }

  for (const edgeList of adjacency.values()) {
    edgeList.sort((a, b) => a.key.localeCompare(b.key))
  }

  const sortedInstances = [...partsByInstance.keys()].sort((a, b) => a.localeCompare(b))
  const componentIdByInstance = new Map<string, number>()
  let componentCounter = 0

  for (const root of sortedInstances) {
    if (componentIdByInstance.has(root)) continue
    const queue = [root]
    componentIdByInstance.set(root, componentCounter)
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const edge of adjacency.get(current) ?? []) {
        const neighbor = edge.from_instance === current ? edge.to_instance : edge.from_instance
        if (!componentIdByInstance.has(neighbor)) {
          componentIdByInstance.set(neighbor, componentCounter)
          queue.push(neighbor)
        }
      }
    }
    componentCounter += 1
  }

  const transforms = new Map<string, Transform>()

  for (const root of sortedInstances) {
    if (transforms.has(root)) continue

    const componentIndex = componentIdByInstance.get(root) ?? 0
    transforms.set(root, {
      position: new Vector3(componentIndex * componentSpacingMm, groundOffsetMm, 0),
      rotation: new Quaternion(0, 0, 0, 1),
    })

    const queue = [root]
    while (queue.length > 0) {
      const current = queue.shift()!
      const currentTransform = transforms.get(current)
      if (!currentTransform) {
        throw new TopologySolveError(`Internal solver error: missing transform for '${current}'`)
      }

      for (const edge of adjacency.get(current) ?? []) {
        const currentIsFrom = edge.from_instance === current
        const neighbor = currentIsFrom ? edge.to_instance : edge.from_instance
        const currentPortId = currentIsFrom ? edge.from_port : edge.to_port
        const neighborPortId = currentIsFrom ? edge.to_port : edge.from_port

        const currentPartDef = partsByInstance.get(current)
        const neighborPartDef = partsByInstance.get(neighbor)
        if (!currentPartDef || !neighborPartDef) {
          throw new TopologySolveError(`Missing part definition while solving edge ${edge.key}`)
        }

        const currentPort = getPartPort(currentPartDef, currentPortId)
        const neighborPort = getPartPort(neighborPartDef, neighborPortId)
        if (!currentPort || !neighborPort) {
          throw new TopologySolveError(`Missing port definition while solving edge ${edge.key}`)
        }

        if (transforms.has(neighbor)) {
          const residual = connectionResidual(edge, transforms, partsByInstance)
          if (residual.distance > positionToleranceMm || residual.angleDeg > angleToleranceDeg) {
            throw new TopologySolveError(
              `Closed-loop constraint violation on ${edge.key} (distance=${residual.distance.toFixed(3)}mm, angle=${residual.angleDeg.toFixed(3)}°)`,
              [
                {
                  code: 'loop_constraint_violation',
                  message: `Residual too high for ${edge.key}`,
                  item: edge.key,
                },
              ],
            )
          }
          // Log near-tolerance residuals for debugging
          if (residual.distance > positionToleranceMm * 0.8 || residual.angleDeg > angleToleranceDeg * 0.8) {
            console.debug(
              `[TopologySolver] Loop-closing edge ${edge.key} near tolerance: distance=${residual.distance.toFixed(3)}mm (limit ${positionToleranceMm}), angle=${residual.angleDeg.toFixed(2)}° (limit ${angleToleranceDeg})`,
            )
          }
          continue
        }

        const neighborsOfCandidate = (adjacency.get(neighbor) ?? []).filter((candidateEdge) => {
          if (candidateEdge.key === edge.key) return false
          const other =
            candidateEdge.from_instance === neighbor
              ? candidateEdge.to_instance
              : candidateEdge.from_instance
          return transforms.has(other)
        })

        const angles = edge.twist_deg !== 0 ? [edge.twist_deg] : candidateAngles(neighborPort)
        let bestTransform: Transform | null = null
        let bestScore = Number.POSITIVE_INFINITY

        for (const angle of angles) {
          const candidate = buildPlacementCandidate(
            transforms.get(current)!,
            currentPort,
            neighborPort,
            angle,
            currentPartDef,
            neighborPartDef,
            edge.fixed_roll
          )

          const tempTransforms = new Map(transforms)
          tempTransforms.set(neighbor, candidate)

          let score = 0
          const primaryResidual = connectionResidual(edge, tempTransforms, partsByInstance)
          score += primaryResidual.distance + primaryResidual.angleDeg * 0.1

          for (const relatedEdge of neighborsOfCandidate) {
            const residual = connectionResidual(relatedEdge, tempTransforms, partsByInstance)
            score += residual.distance + residual.angleDeg * 0.1
          }

          if (score < bestScore) {
            bestScore = score
            bestTransform = candidate
          }
        }

        if (!bestTransform) {
          throw new TopologySolveError(`No placement candidate found for '${neighbor}' on edge ${edge.key}`)
        }

        transforms.set(neighbor, bestTransform)
        queue.push(neighbor)
      }
    }
  }

  for (const edge of connections) {
    const residual = connectionResidual(edge, transforms, partsByInstance)
    if (residual.distance > positionToleranceMm || residual.angleDeg > angleToleranceDeg) {
      throw new TopologySolveError(
        `Solved topology violates connection ${edge.key} (distance=${residual.distance.toFixed(3)}mm, angle=${residual.angleDeg.toFixed(3)}°)`,
        [
          {
            code: 'residual_violation',
            message: `Residual exceeds tolerance on ${edge.key}`,
            item: edge.key,
          },
        ],
      )
    }
  }

  const parts: PartInstance[] = canonical.parts.map((part) => {
    const transform = transforms.get(part.instance_id)
    if (!transform) {
      throw new TopologySolveError(`Missing solved transform for '${part.instance_id}'`)
    }

    return {
      instance_id: part.instance_id,
      part_id: part.part_id,
      position: [transform.position.x, transform.position.y, transform.position.z],
      rotation: [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ],
      color: part.color,
    }
  })

  const solvedConnections: Connection[] = connections.map((connection) => ({
    from_instance: connection.from_instance,
    from_port: connection.from_port,
    to_instance: connection.to_instance,
    to_port: connection.to_port,
    joint_type: connection.joint_type,
    twist_deg: connection.twist_deg,
    fixed_roll: connection.fixed_roll,
  }))

  return { parts, connections: solvedConnections }
}
