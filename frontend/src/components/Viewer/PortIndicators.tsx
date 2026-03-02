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
// Helpers (similar to computeGhostTransform but localized)
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
    // Rod inserts opposite to hole direction
    const desiredDir = targetWorldDir.clone().negate()
    const placingLocalDir = new Vector3(
        placingPort.direction[0],
        placingPort.direction[1],
        placingPort.direction[2],
    )
    const baseQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)

    // Apply twist rotation around the insertion axis to handle allowed_angles_deg
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

let instanceCounter = Date.now()
function generateInstanceId(partId: string): string {
    instanceCounter++
    return `${partId}-${instanceCounter.toString(36)}`
}

/**
 * Renders clickable spheres at every available, compatible port on the `matchTargetId` instance.
 * Updates the ghost position on hover and commits the placement on click.
 */
export function PortIndicators({ defs }: PortIndicatorsProps) {
    const { mode, placingPartId, matchTargetId } = useInteractionStore()
    const parts = useBuildStore((s) => s.parts)
    const connections = useBuildStore((s) => s.connections)
    const { camera } = useThree()

    // Track the hovered port indicator to highlight it
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

        const availableIndicators: {
            positionKey: string
            worldPos: Vector3
            variants: { targetPortId: string; placingPortId: string; ghostPos: Vector3; ghostQuat: Quaternion; joint_type: 'fixed' | 'revolute' | 'prismatic'; angle: number }[]
        }[] = []

        // Calculate all compatible combinations
        for (const targetPort of targetDef.ports) {
            if (occupiedPorts.has(targetPort.id)) continue

            const { position: targetWorldPos, direction: targetWorldDir } = getPortWorldPose(
                targetInstance,
                targetPort,
            )

            // Find or create the position-based indicator group
            const posKey = `pos_${targetWorldPos.x.toFixed(2)}_${targetWorldPos.y.toFixed(2)}_${targetWorldPos.z.toFixed(2)}`
            let existingInd = availableIndicators.find(ind => ind.positionKey === posKey)
            if (!existingInd) {
                existingInd = {
                    positionKey: posKey,
                    worldPos: targetWorldPos,
                    variants: []
                }
                availableIndicators.push(existingInd)
            }

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

                        // Extract dynamically based on which piece is the rod vs connector
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

                        // 1. Sideways Clipping (rod_side)
                        if (rodMateType === 'rod_side') {
                            if (isFlatConnectorEdge) {
                                // Must be vertical (orthogonal to connector plane)
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            } else if (is3DConnectorEdge) {
                                // Must be horizontal (in connector plane)
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
                            }
                        }

                        // 2. Axial sliding (center_axial) - halfway through
                        if (rodPortId.startsWith('center_axial')) {
                            // CANNOT slide halfway through edge clips. Only center holes.
                            if (connectorPortId !== 'center') {
                                isValid = false
                            }
                            // When through center holes, must be perfectly orthogonal (along Z)
                            if (connectorPortId === 'center') {
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            }
                        }

                        // 3. End-on snapping (end1, end2)
                        if (rodMateType === 'rod_end' && !rodPortId.startsWith('center_axial')) {
                            if (connectorPortId !== 'center') {
                                // Snapping end into edge clip. 
                                // Rod must lie completely flat in the target plane.
                                // For flat connectors, rod should be horizontal (orthogonal to Z axis)
                                if (isFlatConnectorEdge) {
                                    if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
                                }
                            } else {
                                // Snapping end into center hole. Must be orthogonal (straight up parallel to Z)
                                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
                            }
                        }
                    }

                    if (!isValid) continue

                    // --- Visual Deduplication ---
                    const isDuplicate = existingInd.variants.some((v) => {
                        if (v.ghostPos.distanceToSquared(ghostPos) > 0.01) return false

                        if (placingDef.category === 'rod') {
                            // Because rods are symmetrical cylinders, spinning them around their main axis or flipping 180 changes the math but they look identical.
                            // Two orientations are identical if their main body axis is parallel, and position is identical.
                            const vWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(v.ghostQuat)
                            const currentWorldMainAxis = new Vector3(1, 0, 0).applyQuaternion(ghostQuat)
                            return Math.abs(vWorldMainAxis.dot(currentWorldMainAxis)) > 0.99
                        } else {
                            // Connectors are generally NOT symmetrical axially (e.g. 5-way connector).
                            // Only deduplicate if their exact quaternion orientation is extremely close.
                            return Math.abs(v.ghostQuat.angleTo(ghostQuat)) < 0.05
                        }
                    })

                    if (!isDuplicate) {
                        existingInd.variants.push({
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

        // Only return indicators that actually have valid variants
        for (const ind of availableIndicators) {
            // Sort variants so we cycle through different angles FIRST (which looks like switching ports if angle is the outer loop)
            // Wait, if the loop was: Port -> Angle.
            // Pushing order: A0, A90, A180, A270, B0, B90, B180, B270...
            // If we sort by Angle first: 0(A,B,C), 90(A,B,C), 180(A,B,C)...
            // This means we cycle through ports before rotating!
            ind.variants.sort((a, b) => {
                if (a.angle !== b.angle) {
                    return a.angle - b.angle
                }
                // Then sort by port ID so they always appear in a consistent sequence
                return a.placingPortId.localeCompare(b.placingPortId)
            })
        }

        return availableIndicators.filter(ind => ind.variants.length > 0)
    }, [mode, placingPartId, matchTargetId, parts, connections, defs, camera.position])

    const activeSnapVariantIndex = useInteractionStore((s) => s.activeSnapVariantIndex)

    // Reactively update the ghost preview if the user presses Tab while hovering
    useEffect(() => {
        if (!hoveredPortId || !matchTargetId) return

        const ind = indicators.find((i) => i.positionKey === hoveredPortId)
        if (!ind || ind.variants.length === 0) return

        const idx = activeSnapVariantIndex % ind.variants.length
        const variant = ind.variants[idx]

        useInteractionStore.getState().setGhostPosition([variant.ghostPos.x, variant.ghostPos.y, variant.ghostPos.z])
        useInteractionStore.getState().setGhostRotation([variant.ghostQuat.x, variant.ghostQuat.y, variant.ghostQuat.z, variant.ghostQuat.w])
        useInteractionStore.getState().setSnapTarget(matchTargetId, variant.targetPortId, variant.placingPortId)
    }, [activeSnapVariantIndex, hoveredPortId, matchTargetId, indicators])

    const handlePointerOver = useCallback(
        (e: ThreeEvent<PointerEvent>, ind: typeof indicators[0]) => {
            e.stopPropagation()

            // Read current value to decide whether to reset variant index,
            // but do NOT call external setState inside the updater function
            // (that triggers "Cannot update a component while rendering").
            const prevHovered = hoveredPortIdRef.current
            if (prevHovered !== ind.positionKey) {
                useInteractionStore.setState({ activeSnapVariantIndex: 0 })
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
    }, [])

    const handleClick = useCallback(
        (e: ThreeEvent<MouseEvent>, ind: typeof indicators[0]) => {
            e.stopPropagation()

            if (!placingPartId || !matchTargetId) return

            const idx = activeSnapVariantIndex % ind.variants.length
            const variant = ind.variants[idx]
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

            // Auto-select the newly added part for fast chain building
            useBuildStore.getState().selectPart(instanceId)

            // Update the targeted mode to target the piece we just placed
            useInteractionStore.getState().startPlacing(placingPartId, instanceId)
        },
        [placingPartId, matchTargetId, activeSnapVariantIndex]
    )

    if (indicators.length === 0) return null

    return (
        <group>
            {indicators.map((ind) => {
                const isHovered = hoveredPortId === ind.positionKey
                
                // Check if any variant has an active port (motorized/drive port)
                const targetInstance = matchTargetId ? parts[matchTargetId] : undefined
                const hasActivePort = targetInstance && ind.variants.some(v => 
                    v.targetPortId && defs.get(targetInstance.part_id)?.ports.find(p => p.id === v.targetPortId)?.is_active
                )
                
                // Active motorized ports are red, regular ports are yellow
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
