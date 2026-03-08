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
  warnings?: TopologyIssue[]
}

export interface TopologyIssue {
  code: string
  message: string
  item?: string
  severity?: 'error' | 'warning' | 'info'
  details?: {
    residualDistanceMm?: number
    residualAngleDeg?: number
    toleranceDistanceMm?: number
    toleranceAngleDeg?: number
    refinementIterations?: number
  }
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

function candidateAnglesForConnection(anchorPort: Port, placingPort: Port): number[] {
  const anchorAngles = candidateAngles(anchorPort)
  const placingAngles = candidateAngles(placingPort)
  return placingAngles.length > anchorAngles.length ? placingAngles : anchorAngles
}

function buildPlacementCandidate(
  anchor: Transform,
  anchorPort: Port,
  placingPort: Port,
  twistDeg: number,
  anchorDef: KnexPartDef,
  placingDef: KnexPartDef,
  _fixedRoll = false
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
    let perpAxis = new Vector3(0, 0, 1).projectOnPlane(localPlacingDirection)
    if (perpAxis.lengthSq() < 0.01) {
      perpAxis = new Vector3(0, 1, 0).projectOnPlane(localPlacingDirection)
      if (perpAxis.lengthSq() < 0.01) {
        perpAxis = new Vector3(1, 0, 0).projectOnPlane(localPlacingDirection)
      }
    }
    perpAxis.normalize()
    baseRotation = new Quaternion().setFromAxisAngle(perpAxis, Math.PI)
  } else {
    rotAxis.normalize()
    baseRotation = new Quaternion().setFromAxisAngle(rotAxis, rotAngle)
  }

  // Step 2: Deterministic Side-Clip Orientation
  const isPlacingRod = placingDef.category === 'rod'
  const isAnchorRod = anchorDef.category === 'rod'
  const isRodConnectorSide = (
    (isPlacingRod && placingPort.mate_type === 'rod_side') ||
    (isAnchorRod && anchorPort.mate_type === 'rod_side')
  )

  if (isRodConnectorSide) {
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

function isPhysicallyValidRodConnectorOrientation(
  anchorTransform: Transform,
  anchorDef: KnexPartDef,
  anchorPort: Port,
  placingTransform: Transform,
  placingDef: KnexPartDef,
  placingPort: Port,
): boolean {
  const isRodConnector =
    (placingDef.category === 'rod' && anchorDef.category === 'connector') ||
    (placingDef.category === 'connector' && anchorDef.category === 'rod')
  if (!isRodConnector) return true

  const isPlacingRod = placingDef.category === 'rod'

  const rodTransform = isPlacingRod ? placingTransform : anchorTransform
  const connectorTransform = isPlacingRod ? anchorTransform : placingTransform
  const rodPort = isPlacingRod ? placingPort : anchorPort
  const connectorPort = isPlacingRod ? anchorPort : placingPort

  const rodWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(rodTransform.rotation).normalize()
  const connectorWorldZ = new Vector3(0, 0, 1)
    .applyQuaternion(connectorTransform.rotation)
    .normalize()

  const connectorDir = connectorPort.direction
  const rodMateType = rodPort.mate_type

  const isFlatConnectorEdge = Math.abs(connectorDir[2]) < 0.1
  const is3DConnectorEdge = Math.abs(connectorDir[2]) > 0.9

  if (rodMateType === 'rod_side') {
    const dot = Math.abs(rodWorldMainAxis.dot(connectorWorldZ))
    if (isFlatConnectorEdge && dot < 0.99) return false
    if (is3DConnectorEdge && dot > 0.1) return false
  }

  return true
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
      fixed_roll: connection.fixed_roll ?? false,
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

  // A connected component has a loop if edgeCount >= vertexCount
  // Count unique undirected edges per component (adjacency lists double-count,
  // so count via the ResolvedConnection[] array, not adjacency.get().length)
  const componentEdgeCounts = new Map<number, number>()
  const componentVertexCounts = new Map<number, number>()
  for (const edge of connections) {
    const compId = componentIdByInstance.get(edge.from_instance)!
    componentEdgeCounts.set(compId, (componentEdgeCounts.get(compId) ?? 0) + 1)
  }
  for (const [_, compId] of componentIdByInstance) {
    componentVertexCounts.set(compId, (componentVertexCounts.get(compId) ?? 0) + 1)
  }
  const componentHasLoop = new Map<number, boolean>()
  for (const compId of componentEdgeCounts.keys()) {
    componentHasLoop.set(compId, componentEdgeCounts.get(compId)! >= componentVertexCounts.get(compId)!)
  }

  const transforms = new Map<string, Transform>()
  const warnings: TopologyIssue[] = []

  for (const root of sortedInstances) {
    if (transforms.has(root)) continue

    const loopClosingEdges: ResolvedConnection[] = []

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
          // Log near-tolerance residuals for debugging
          const residual = connectionResidual(edge, transforms, partsByInstance)
          if (residual.distance > positionToleranceMm * 0.8 || residual.angleDeg > angleToleranceDeg * 0.8) {
            console.debug(
              `[TopologySolver] Loop-closing edge ${edge.key} near tolerance: distance=${residual.distance.toFixed(3)}mm (limit ${positionToleranceMm}), angle=${residual.angleDeg.toFixed(2)}° (limit ${angleToleranceDeg})`,
            )
          }
          // Record the loop-closing edge for post-BFS refinement
          if (!loopClosingEdges.some(e => e.key === edge.key)) {
            loopClosingEdges.push(edge)
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

        const lockRollToStoredTwist = edge.fixed_roll || edge.twist_deg !== 0
        const angles = lockRollToStoredTwist
          ? [edge.twist_deg]
          : candidateAnglesForConnection(currentPort, neighborPort)
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

          if (
            !isPhysicallyValidRodConnectorOrientation(
              transforms.get(current)!,
              currentPartDef,
              currentPort,
              candidate,
              neighborPartDef,
              neighborPort,
            )
          ) {
            continue
          }

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

    // Post-BFS refinement gate (per component, before final residual check)
    const componentId = componentIdByInstance.get(root)!
    if (componentHasLoop.get(componentId) && loopClosingEdges.length > 0) {
      // Check if any loop-closing edges exceed tolerance
      const failingLoopEdges = loopClosingEdges.filter((edge) => {
        const residual = connectionResidual(edge, transforms, partsByInstance)
        return residual.distance > positionToleranceMm || residual.angleDeg > angleToleranceDeg
      })

      if (failingLoopEdges.length > 0) {
        // Collect ALL edges in this component (tree edges + loop-closing edges)
        const componentEdges = connections.filter(
          (edge) => componentIdByInstance.get(edge.from_instance) === componentId
        )

        // Attempt iterative refinement
        const refined = refineLoopComponent(transforms, failingLoopEdges, componentEdges, partsByInstance, {
          positionToleranceMm,
          angleToleranceDeg,
        })

        if (refined) {
          warnings.push({
            code: 'near_tolerance_loop',
            message: 'Loop closed successfully after refinement, but original geometry was near or slightly beyond ideal limits. The build may be tight or fragile.',
            severity: 'info'
          })
        } else {
          // Refinement failed — throw with same error shape as before
          // Report ALL failing edges, not just the first
          const issues = failingLoopEdges.map((edge) => {
            const residual = connectionResidual(edge, transforms, partsByInstance)
            
            let message = ''
            const posFail = residual.distance > positionToleranceMm
            const angleFail = residual.angleDeg > angleToleranceDeg
            
            if (posFail && angleFail) {
              message = `Loop cannot close: ${edge.key} gap is ${residual.distance.toFixed(1)}mm and ${residual.angleDeg.toFixed(1)}° off.`
            } else if (posFail) {
              message = `Loop cannot close: ports in ${edge.key} are ${residual.distance.toFixed(1)}mm apart (limit: ${positionToleranceMm}mm).`
            } else {
              message = `Loop cannot close: ports in ${edge.key} are misaligned by ${residual.angleDeg.toFixed(1)}° (limit: ${angleToleranceDeg}°).`
            }
            
            let severity: 'error' | 'warning' | 'info' = 'error'
            if (residual.distance < positionToleranceMm * 3 && residual.angleDeg < angleToleranceDeg * 3) {
              severity = 'warning'
              message += ' Loop is close to closing. Try adjusting rod lengths.'
            } else if (residual.distance > positionToleranceMm * 10) {
              message += ' This combination of parts cannot form a closed loop.'
            } else {
              if (posFail) message += ' The loop geometry may need different rod lengths or connector angles.'
              if (!posFail && angleFail) message += ' Try a different connector type at this junction.'
            }

            return {
              code: 'loop_constraint_violation',
              message,
              item: edge.key,
              severity,
              details: {
                residualDistanceMm: residual.distance,
                residualAngleDeg: residual.angleDeg,
                toleranceDistanceMm: positionToleranceMm,
                toleranceAngleDeg: angleToleranceDeg,
                refinementIterations: 12,
              }
            }
          })
          throw new TopologySolveError(
            `Closed-loop constraint violation on ${issues.length} edge(s)`,
            issues,
          )
        }
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

  return { parts, connections: solvedConnections, warnings }
}

function getLocalPerpendicular(port: Port): Vector3 {
  const dir = new Vector3(port.direction[0], port.direction[1], port.direction[2]).normalize()
  const up = new Vector3(0, 1, 0)
  const cross = dir.clone().cross(up)
  if (cross.lengthSq() > 0.01) {
    return cross.normalize()
  } else {
    // If direction is nearly parallel to Y, use Z
    return dir.clone().cross(new Vector3(0, 0, 1)).normalize()
  }
}

function hasAxialFreedom(edge: ResolvedConnection, _partDefs: Map<string, KnexPartDef>): boolean {
  return edge.from_port.startsWith('center_axial') || edge.to_port.startsWith('center_axial')
}

function hasRollFreedom(edge: ResolvedConnection, partDefs: Map<string, KnexPartDef>): boolean {
  return edge.joint_type === 'revolute' || hasAxialFreedom(edge, partDefs)
}

function maskPositionError(
  posError: Vector3,
  edge: ResolvedConnection,
  transforms: Map<string, Transform>,
  partDefs: Map<string, KnexPartDef>,
): Vector3 {
  const hasFreeAxial = edge.joint_type === 'prismatic' || hasAxialFreedom(edge, partDefs)

  if (!hasFreeAxial) {
    return posError.clone()
  }

  const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
  const fromTransform = transforms.get(edge.from_instance)!
  const axis = getWorldPortPose(fromTransform, fromPort).direction.clone().normalize()

  const axialComponent = posError.dot(axis)
  return posError.clone().sub(axis.clone().multiplyScalar(axialComponent))
}

function snapRollAngles(
  transforms: Map<string, Transform>,
  edges: ResolvedConnection[],
  partDefs: Map<string, KnexPartDef>,
  rootId: string,
): void {
  for (const edge of edges) {
    if (hasRollFreedom(edge, partDefs) && !edge.fixed_roll) continue

    const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
    const toPort = getPartPort(partDefs.get(edge.to_instance)!, edge.to_port)!

    const allowedAngles = edge.fixed_roll
      ? [edge.twist_deg]
      : candidateAnglesForConnection(fromPort, toPort)

    if (allowedAngles.length <= 1 && allowedAngles[0] === 0 && !edge.fixed_roll) continue

    const fromTransform = transforms.get(edge.from_instance)!
    const toTransform = transforms.get(edge.to_instance)!

    const fromPose = getWorldPortPose(fromTransform, fromPort)
    const toPose = getWorldPortPose(toTransform, toPort)

    const matingAxis = fromPose.direction.clone().add(toPose.direction.clone().negate()).normalize()
    if (matingAxis.lengthSq() < 0.1) continue

    const fromRefLocal = getLocalPerpendicular(fromPort)
    const toRefLocal = getLocalPerpendicular(toPort)

    const fromRefWorld = fromRefLocal.applyQuaternion(fromTransform.rotation)
    const toRefWorld = toRefLocal.applyQuaternion(toTransform.rotation)

    fromRefWorld.sub(matingAxis.clone().multiplyScalar(fromRefWorld.dot(matingAxis))).normalize()
    toRefWorld.sub(matingAxis.clone().multiplyScalar(toRefWorld.dot(matingAxis))).normalize()

    if (fromRefWorld.lengthSq() < 0.1 || toRefWorld.lengthSq() < 0.1) continue

    const crossProd = fromRefWorld.clone().cross(toRefWorld)
    const sinA = crossProd.dot(matingAxis)
    const cosA = fromRefWorld.dot(toRefWorld)
    let currentRoll = Math.atan2(sinA, cosA) * (180 / Math.PI)
    if (currentRoll < 0) currentRoll += 360

    let nearestAngle = allowedAngles[0]
    let minDiff = Infinity
    for (const angle of allowedAngles) {
      let diff = Math.abs(angle - currentRoll)
      if (diff > 180) diff = 360 - diff
      if (diff < minDiff) {
        minDiff = diff
        nearestAngle = angle
      }
    }

    let correctionDeg = nearestAngle - currentRoll
    if (correctionDeg > 180) correctionDeg -= 360
    if (correctionDeg < -180) correctionDeg += 360

    const maxCorrectionDeg = 5.0
    if (correctionDeg > maxCorrectionDeg) correctionDeg = maxCorrectionDeg
    if (correctionDeg < -maxCorrectionDeg) correctionDeg = -maxCorrectionDeg

    if (Math.abs(correctionDeg) < 0.1) continue

    const correctionRad = correctionDeg * (Math.PI / 180)
    const correctionQuat = new Quaternion().setFromAxisAngle(matingAxis, correctionRad)

    const fromIsRoot = edge.from_instance === rootId
    const toIsRoot = edge.to_instance === rootId

    if (!fromIsRoot && !toIsRoot) {
      const halfQuat = new Quaternion().setFromAxisAngle(matingAxis, correctionRad * 0.5)
      const toLocalPortPos = new Vector3(toPort.position[0], toPort.position[1], toPort.position[2])
      toTransform.rotation.premultiply(halfQuat).normalize()
      toTransform.position.copy(toPose.position).sub(toLocalPortPos.applyQuaternion(toTransform.rotation))

      const halfQuatInv = new Quaternion().setFromAxisAngle(matingAxis, -correctionRad * 0.5)
      const fromLocalPortPos = new Vector3(fromPort.position[0], fromPort.position[1], fromPort.position[2])
      fromTransform.rotation.premultiply(halfQuatInv).normalize()
      fromTransform.position.copy(fromPose.position).sub(fromLocalPortPos.applyQuaternion(fromTransform.rotation))
      
    } else if (!toIsRoot) {
      const toLocalPortPos = new Vector3(toPort.position[0], toPort.position[1], toPort.position[2])
      toTransform.rotation.premultiply(correctionQuat).normalize()
      toTransform.position.copy(fromPose.position).sub(toLocalPortPos.applyQuaternion(toTransform.rotation))
    } else if (!fromIsRoot) {
      const correctionQuatInv = new Quaternion().setFromAxisAngle(matingAxis, -correctionRad)
      const fromLocalPortPos = new Vector3(fromPort.position[0], fromPort.position[1], fromPort.position[2])
      fromTransform.rotation.premultiply(correctionQuatInv).normalize()
      fromTransform.position.copy(toPose.position).sub(fromLocalPortPos.applyQuaternion(fromTransform.rotation))
    }
  }
}

const MAX_ITERATIONS = 12
const K_POS = 0.6
const K_ROT = 0.5

function refineLoopComponent(
  transforms: Map<string, Transform>,
  _failingEdges: ResolvedConnection[],
  allEdges: ResolvedConnection[],
  partDefs: Map<string, KnexPartDef>,
  tolerances: { positionToleranceMm: number; angleToleranceDeg: number },
): boolean {
  const componentParts = new Set<string>()
  for (const edge of allEdges) {
    componentParts.add(edge.from_instance)
    componentParts.add(edge.to_instance)
  }

  const rootId = [...componentParts].sort()[0]

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if ((iter + 1) % 3 === 0) {
      snapRollAngles(transforms, allEdges, partDefs, rootId)
    }

    const posDeltas = new Map<string, Vector3>()
    const rotDeltas = new Map<string, { axis: Vector3; angle: number; pivot: Vector3 }[]>()

    for (const partId of componentParts) {
      posDeltas.set(partId, new Vector3(0, 0, 0))
      rotDeltas.set(partId, [])
    }

    for (const edge of allEdges) {
      const fromTransform = transforms.get(edge.from_instance)!
      const toTransform = transforms.get(edge.to_instance)!
      const fromPort = getPartPort(partDefs.get(edge.from_instance)!, edge.from_port)!
      const toPort = getPartPort(partDefs.get(edge.to_instance)!, edge.to_port)!

      const fromPose = getWorldPortPose(fromTransform, fromPort)
      const toPose = getWorldPortPose(toTransform, toPort)

      const rawPosError = fromPose.position.clone().sub(toPose.position)
      const e_p = maskPositionError(rawPosError, edge, transforms, partDefs)

      const targetDir = toPose.direction.clone().negate()
      let e_omega = new Vector3().crossVectors(fromPose.direction, targetDir)

      const fromIsRoot = edge.from_instance === rootId
      const toIsRoot = edge.to_instance === rootId
      const fromWeight = fromIsRoot ? 0 : (toIsRoot ? 1 : 0.5)
      const toWeight = toIsRoot ? 0 : (fromIsRoot ? 1 : 0.5)

      posDeltas.get(edge.from_instance)!.sub(e_p.clone().multiplyScalar(K_POS * fromWeight))
      posDeltas.get(edge.to_instance)!.add(e_p.clone().multiplyScalar(K_POS * toWeight))

      let sinAngle = e_omega.length()
      const cosAngle = fromPose.direction.dot(targetDir)

      // Handle exact 180 degree flip where cross product is zero
      if (sinAngle < 1e-6 && cosAngle < -0.999) {
        // Find an arbitrary orthogonal axis to flip around
        e_omega = getLocalPerpendicular(fromPort).applyQuaternion(fromTransform.rotation)
        sinAngle = e_omega.length()
      }

      const angle = Math.atan2(sinAngle, cosAngle)

      if (Math.abs(angle) > 1e-6) {
        const axis = e_omega.clone().normalize()
        if (!Number.isNaN(axis.x) && !Number.isNaN(axis.y) && !Number.isNaN(axis.z)) {
          const pivot = fromPose.position.clone().add(toPose.position).multiplyScalar(0.5)
          // from rotates around +axis to reach targetDir
          rotDeltas.get(edge.from_instance)!.push({ axis: axis.clone(), angle: K_ROT * angle * fromWeight, pivot })
          // to rotates around -axis to reach -fromDir
          rotDeltas.get(edge.to_instance)!.push({ axis: axis.clone().negate(), angle: K_ROT * angle * toWeight, pivot })
        }
      }
    }

    for (const partId of componentParts) {
      if (partId === rootId) continue
      const t = transforms.get(partId)!

      t.position.add(posDeltas.get(partId)!)

      for (const { axis, angle, pivot } of rotDeltas.get(partId)!) {
        const dq = new Quaternion().setFromAxisAngle(axis, angle)
        t.position.sub(pivot).applyQuaternion(dq).add(pivot)
        t.rotation.premultiply(dq).normalize()
      }
    }

    let maxPosMm = 0
    let maxAngleDeg = 0
    for (const edge of allEdges) {
      const residual = connectionResidual(edge, transforms, partDefs)
      maxPosMm = Math.max(maxPosMm, residual.distance)
      maxAngleDeg = Math.max(maxAngleDeg, residual.angleDeg)
    }

    if (maxPosMm <= tolerances.positionToleranceMm && maxAngleDeg <= tolerances.angleToleranceDeg) {
      console.debug(`[TopologySolver] Loop refinement converged in ${iter + 1} iterations (pos=${maxPosMm.toFixed(3)}mm, angle=${maxAngleDeg.toFixed(2)}°)`)
      return true
    }
  }

  console.debug(`[TopologySolver] Loop refinement did not converge after ${MAX_ITERATIONS} iterations`)
  return false
}
