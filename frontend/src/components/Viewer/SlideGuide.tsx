import { useMemo } from 'react'
import { Vector3, Euler, Quaternion } from 'three'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'
import { getPortWorldPose } from '../../helpers/snapHelper'
import type { KnexPartDef } from '../../types/parts'

interface SlideGuideProps {
    defs: Map<string, KnexPartDef>
}

/**
 * Visual indicator drawn along a rod to show the valid sliding range
 * and the current slide offset position.
 */
export function SlideGuide({ defs }: SlideGuideProps) {
    const { mode, isSnapped, snapTargetInstanceId, snapTargetPortId, slideOffset, slideRange } = useInteractionStore()
    const parts = useBuildStore((s) => s.parts)

    const guideData = useMemo(() => {
        if (mode !== 'place' || !isSnapped || !slideRange || !snapTargetInstanceId || !snapTargetPortId) {
            return null
        }

        const instance = parts[snapTargetInstanceId]
        const def = instance ? defs.get(instance.part_id) : undefined
        if (!instance || !def || def.category !== 'rod') return null

        // Need the base pose of the port without offset applied to draw the line relative to it
        const port = def.ports.find((p) => p.id === snapTargetPortId)
        if (!port) return null

        const { position, direction } = getPortWorldPose(instance, port, 0)

        return { position, direction, range: slideRange, offset: slideOffset }
    }, [mode, isSnapped, slideRange, slideOffset, snapTargetInstanceId, snapTargetPortId, parts, defs])

    if (!guideData) return null

    const { position, direction, range, offset } = guideData
    const [min, max] = range
    const length = max - min

    // Calculate rotation to align cylinder with direction vector
    const dirVector = direction.clone().normalize()
    const up = new Vector3(0, 1, 0)
    const axis = new Vector3().crossVectors(up, dirVector).normalize()
    const radians = Math.acos(up.dot(dirVector))
    const q = new Quaternion().setFromAxisAngle(axis, radians)
    const euler = new Euler().setFromQuaternion(q)

    // Center of the range line relative to the base port position
    const centerOffset = min + (length / 2)
    const lineCenter = position.clone().add(direction.clone().multiplyScalar(centerOffset))

    // Position of the current offset marker
    const markerPos = position.clone().add(direction.clone().multiplyScalar(offset))

    return (
        <group>
            {/* The line representing the valid range */}
            <mesh position={lineCenter} rotation={euler}>
                <cylinderGeometry args={[1, 1, length, 8]} />
                <meshBasicMaterial color="#ffff00" transparent opacity={0.3} depthTest={false} />
            </mesh>

            {/* A small sphere at the exact current slideOffset position */}
            <mesh position={markerPos}>
                <sphereGeometry args={[2.5, 16, 16]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
            </mesh>
        </group>
    )
}
