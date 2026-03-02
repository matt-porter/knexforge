import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Quaternion, Vector3, MathUtils } from 'three'
import { useBuildStore } from '../../stores/buildStore'
import { useInteractionStore } from '../../stores/interactionStore'
import { getPortWorldPose, inferJointType } from '../../helpers/snapHelper'
import type { KnexPartDef, Port } from '../../types/parts'

interface PortIndicatorsProps {
    defs: Map<string, KnexPartDef>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arePortsCompatible(placingPort: Port, targetPort: Port): boolean {
    return (
        targetPort.accepts.includes(placingPort.mate_type) &&
        placingPort.accepts.includes(targetPort.mate_type)
    )
}

function computeGhostTransform(
    placingPort: Port,
    targetWorldPos: Vector3,
    targetWorldDir: Vector3,
    angleDeg: number = 0
): { position: Vector3; rotation: Quaternion } {
    const desiredDir = targetWorldDir.clone().negate()
    const placingLocalDir = new Vector3(
        placingPort.direction[0],
        placingPort.direction[1],
        placingPort.direction[2],
    )
    const baseQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)
    const twistQuat = new Quaternion().setFromAxisAngle(targetWorldDir, MathUtils.degToRad(angleDeg))
    const ghostQuat = twistQuat.clone().multiply(baseQuat)

    const placingLocalPos = new Vector3(
        placingPort.position[0],
        placingPort.position[1],
        placingPort.position[2],
    )
    const rotatedLocalPos = placingLocalPos.clone().applyQuaternion(ghostQuat)
    const ghostPos = targetWorldPos.clone().sub(rotatedLocalPos)

    return { position: ghostPos, rotation: ghostQuat }
}

/** Format a port ID into a human-readable label. */
function portLabel(portId: string): string {
    if (portId === 'center') return 'Center'
    if (portId.startsWith('center_')) return 'Center (' + portId.replace('center_', '') + ')'
    if (portId.length === 1) return 'Port ' + portId.toUpperCase()
    return portId.charAt(0).toUpperCase() + portId.slice(1)
}

let instanceCounter = Date.now()
function generateInstanceId(partId: string): string {
    instanceCounter++
    return `${partId}-${instanceCounter.toString(36)}`
}

// ---------------------------------------------------------------------------
// Types for port-grouped variants
// ---------------------------------------------------------------------------

interface SnapVariant {
    targetPortId: string
    placingPortId: string
    ghostPos: Vector3
    ghostQuat: Quaternion
    joint_type: 'fixed' | 'revolute' | 'prismatic'
    angle: number
}

interface PortGroup {
    placingPortId: string
    label: string
    variants: SnapVariant[]
}

interface PortIndicator {
    positionKey: string
    worldPos: Vector3
    portGroups: PortGroup[]
}

/**
 * Renders clickable spheres at every available, compatible port on the `matchTargetId` instance.
 * Updates the ghost position on hover and commits the placement on click.
 *
 * Variants are organized into port groups (by placing port ID) so the user can
 * cycle ports with Tab and rotations with R independently.
 */
export function PortIndicators({ defs }: PortIndicatorsProps) {
    const { mode, placingPartId, matchTargetId } = useInteractionStore()
    const parts = useBuildStore((s) => s.parts)
    const connections = useBuildStore((s) => s.connections)
    const { camera } = useThree()

    const [hoveredPortId, setHoveredPortId] = useState<string | null>(null)
    const hoveredPortIdRef = useRef<string | null>(null)

    const indicators = useMemo(() => {
        if (mode !== 'place' || !placingPartId || !matchTargetId) return []

        const targetInstance = parts[matchTargetId]
        const placingDef = defs.get(placingPartId)
        const targetDef = targetInstance ? defs.get(targetInstance.part_id) : undefined

        if (!targetInstance || !placingDef || !targetDef) return []

        // Find which ports on the target instance are already occupied
        const occupiedPorts = new Set<string>()
        for (const conn of connections) {
            if (conn.from_instance === matchTargetId) occupiedPorts.add(conn.from_port)
            if (conn.to_instance === matchTargetId) occupiedPorts.add(conn.to_port)
        }

        const rawIndicators: Map<string, { worldPos: Vector3; variants: SnapVariant[] }> = new Map()

        for (const targetPort of targetDef.ports) {
            if (occupiedPorts.has(targetPort.id)) continue

            const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
                targetInstance,
                targetPort,
            )

            const posKey = `pos_${targetWorldPos.x.toFixed(2)}_${targetWorldPos.y.toFixed(2)}_${targetWorldPos.z.toFixed(2)}`
            if (!rawIndicators.has(posKey)) {
                rawIndicators.set(posKey, { worldPos: targetWorldPos, variants: [] })
            }
            const indData = rawIndicators.get(posKey)!

            for (const placingPort of placingDef.ports) {
                if (!arePortsCompatible(placingPort, targetPort)) continue

                const targetAngles = targetPort.allowed_angles_deg?.length > 0 ? targetPort.allowed_angles_deg : [0]
                const placingAngles = placingPort.allowed_angles_deg?.length > 0 ? placingPort.allowed_angles_deg : [0]
                const angles = placingAngles.length > targetAngles.length ? placingAngles : targetAngles

                for (const angle of angles) {
                    const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
                        placingPort,
                        targetWorldPos,
                        targetWorldDir,
                        angle
                    )

                    // --- Physical Constraints ---
                    let isValid = true

                    if ((placingDef.category === 'rod' && targetDef.category === 'connector') ||
                        (placingDef.category === 'connector' && targetDef.category === 'rod')) {

                        const isPlacingRod = placingDef.category === 'rod'

                        const rodWorldMainAxis = isPlacingRod
                            ? new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
                            : new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...targetInstance.rotation))

                        const connectorWorldZ = isPlacingRod
                            ? new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...targetInstance.rotation))
                            : new Vector3(0, 0, 1).applyQuaternion(ghostQuat)

                        const connectorDir = isPlacingRod ? targetPort.direction : placingPort.direction
                        const rodMateType = isPlacingRod ? placingPort.mate_type : targetPort.mate_type
                        const rodPortId = isPlacingRod ? placingPort.id : targetPort.id
                        const connectorPortId = isPlacingRod ? targetPort.id : placingPort.id

                        const isFlatConnectorEdge = Math.abs(connectorDir[2]) < 0.1
                        const is3DConnectorEdge = Math.abs(connectorDir[2]) > 0.9

                        if (rodMateType === 'rod_side') {
                            if (isFlatConnectorEdge) {
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            } else if (is3DConnectorEdge) {
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
                            }
                        }

                        if (rodPortId.startsWith('center_axial')) {
                            if (connectorPortId !== 'center') {
                                isValid = false
                            }
                            if (connectorPortId === 'center') {
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            }
                        }

                        if (rodMateType === 'rod_end' && !rodPortId.startsWith('center_axial')) {
                            if (connectorPortId !== 'center') {
                                if (isFlatConnectorEdge) {
                                    if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
                                }
                            } else {
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            }
                        }
                    }

                    if (!isValid) continue

                    // --- Visual Deduplication (within this indicator position) ---
                    const isDuplicate = indData.variants.some((v) => {
                        if (v.ghostPos.distanceToSquared(ghostPos) > 0.01) return false
                        if (v.placingPortId !== placingPort.id) return false

                        if (placingDef.category === 'rod') {
                            const vWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(v.ghostQuat)
                            const currentWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
                            return Math.abs(vWorldMainAxis.dot(currentWorldMainAxis)) > 0.99
                        } else {
                            return Math.abs(v.ghostQuat.angleTo(ghostQuat)) < 0.05
                        }
                    })

                    if (!isDuplicate) {
                        indData.variants.push({
                            targetPortId: targetPort.id,
                            placingPortId: placingPort.id,
                            ghostPos,
                            ghostQuat,
                            joint_type: inferJointType(placingPort, targetPort),
                            angle
                        })
                    }
                }
            }
        }

        // Convert to port-grouped indicators
        const result: PortIndicator[] = []
        for (const [posKey, data] of rawIndicators) {
            if (data.variants.length === 0) continue

            // Group variants by placingPortId
            const groupMap = new Map<string, SnapVariant[]>()
            for (const v of data.variants) {
                if (!groupMap.has(v.placingPortId)) {
                    groupMap.set(v.placingPortId, [])
                }
                groupMap.get(v.placingPortId)!.push(v)
            }

            const portGroups: PortGroup[] = []
            for (const [pid, variants] of groupMap) {
                // Sort variants within each port group by angle
                variants.sort((a, b) => a.angle - b.angle)
                portGroups.push({
                    placingPortId: pid,
                    label: portLabel(pid),
                    variants,
                })
            }

            // Sort port groups alphabetically for consistent order
            portGroups.sort((a, b) => a.placingPortId.localeCompare(b.placingPortId))

            result.push({
                positionKey: posKey,
                worldPos: data.worldPos,
                portGroups,
            })
        }

        return result
    }, [mode, placingPartId, matchTargetId, parts, connections, defs, camera.position])

    const activePortIndex = useInteractionStore((s) => s.activePortIndex)
    const activeAngleIndex = useInteractionStore((s) => s.activeAngleIndex)

    // Reactively update the ghost preview when port/angle index changes
    useEffect(() => {
        if (!hoveredPortId || !matchTargetId) return

        const ind = indicators.find((i) => i.positionKey === hoveredPortId)
        if (!ind || ind.portGroups.length === 0) return

        const pIdx = activePortIndex % ind.portGroups.length
        const group = ind.portGroups[pIdx]
        if (group.variants.length === 0) return

        const aIdx = activeAngleIndex % group.variants.length
        const variant = group.variants[aIdx]

        useInteractionStore.getState().setGhostPosition([variant.ghostPos.x, variant.ghostPos.y, variant.ghostPos.z])
        useInteractionStore.getState().setGhostRotation([variant.ghostQuat.x, variant.ghostQuat.y, variant.ghostQuat.z, variant.ghostQuat.w])
        useInteractionStore.getState().setSnapTarget(matchTargetId, variant.targetPortId, variant.placingPortId)

        // Write HUD metadata
        useInteractionStore.getState().setSnapVariantInfo({
            portLabel: group.label,
            portIndex: pIdx,
            totalPorts: ind.portGroups.length,
            allPortLabels: ind.portGroups.map((g) => g.label),
            angleDeg: variant.angle,
            angleIndex: aIdx,
            totalAngles: group.variants.length,
        })
    }, [activePortIndex, activeAngleIndex, hoveredPortId, matchTargetId, indicators])

    const handlePointerOver = useCallback(
        (e: ThreeEvent<PointerEvent>, ind: PortIndicator) => {
            e.stopPropagation()

            const prevHovered = hoveredPortIdRef.current
            if (prevHovered !== ind.positionKey) {
                useInteractionStore.setState({ activePortIndex: 0, activeAngleIndex: 0 })
            }
            hoveredPortIdRef.current = ind.positionKey
            setHoveredPortId(ind.positionKey)
        },
        []
    )

    const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        hoveredPortIdRef.current = null
        setHoveredPortId(null)
        useInteractionStore.getState().setSnapTarget(null, null, null)
        useInteractionStore.getState().setSnapVariantInfo(null)
    }, [])

    const handleClick = useCallback(
        (e: ThreeEvent<MouseEvent>, ind: PortIndicator) => {
            e.stopPropagation()

            if (!placingPartId || !matchTargetId) return

            const pIdx = activePortIndex % ind.portGroups.length
            const group = ind.portGroups[pIdx]
            if (group.variants.length === 0) return

            const aIdx = activeAngleIndex % group.variants.length
            const variant = group.variants[aIdx]
            const instanceId = generateInstanceId(placingPartId)

            useBuildStore.getState().addPart({
                instance_id: instanceId,
                part_id: placingPartId,
                position: [variant.ghostPos.x, variant.ghostPos.y, variant.ghostPos.z],
                rotation: [variant.ghostQuat.x, variant.ghostQuat.y, variant.ghostQuat.z, variant.ghostQuat.w],
            })

            useBuildStore.getState().addConnection({
                from_instance: instanceId,
                from_port: variant.placingPortId,
                to_instance: matchTargetId,
                to_port: variant.targetPortId,
                joint_type: variant.joint_type,
            })

            useBuildStore.getState().selectPart(instanceId)
            useInteractionStore.getState().startPlacing(placingPartId, instanceId)
        },
        [placingPartId, matchTargetId, activePortIndex, activeAngleIndex]
    )

    if (indicators.length === 0) return null

    return (
        <group>
            {indicators.map((ind) => {
                const isHovered = hoveredPortId === ind.positionKey
                
                const targetInstance = matchTargetId ? parts[matchTargetId] : undefined
                const hasActivePort = targetInstance && ind.portGroups.some(g =>
                    g.variants.some(v => 
                        v.targetPortId && defs.get(targetInstance.part_id)?.ports.find(p => p.id === v.targetPortId)?.is_active
                    )
                )
                
                const indicatorColor = isHovered ? '#00ff00' : (hasActivePort ? '#ff3333' : '#ffff00')
                
                return (
                    <mesh
                        key={ind.positionKey}
                        position={ind.worldPos}
                        onPointerOver={(e) => handlePointerOver(e, ind)}
                        onPointerOut={handlePointerOut}
                        onClick={(e) => handleClick(e, ind)}
                    >
                        <sphereGeometry args={[isHovered ? 6 : 4, 16, 16]} />
                        <meshBasicMaterial
                            color={indicatorColor}
                            transparent
                            opacity={isHovered ? 0.9 : 0.6}
                            depthTest={false}
                        />
                    </mesh>
                )
            })}
        </group>
    )
}
