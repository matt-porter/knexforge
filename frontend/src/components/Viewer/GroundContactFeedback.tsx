import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useBuildStore } from '../../stores/buildStore'
import { simulationTransforms } from '../../services/simulationManager'

/**
 * Visual feedback for parts touching the ground.
 * Task 10.7: Adds a subtle pulse/glow effect when parts are in contact with ground.
 * 
 * Implementation notes:
 * - In full implementation, this would integrate with Rapier physics raycasting
 *   to detect actual ground contacts
 * - For now, it highlights parts near the ground plane (Y < threshold)
 * - Uses a glowing ring effect that pulses when "touching"
 */

const GROUND_THRESHOLD_MM = 5.0 // Parts within this height are considered touching
const PULSE_SPEED = 3.0 // Radians per second
const PULSE_RADIUS_BASE = 12.0
const PULSE_RADIUS_MAX = 20.0

export function GroundContactFeedback() {
  const { parts } = useBuildStore.getState()
  const pulseRef = useRef<number>(0)

  // Get part positions that are near ground
  const touchingParts = useMemo(() => {
    const result: Array<{
      instanceId: string
      position: Vector3
      isSimulating: boolean
    }> = []

    for (const [instanceId, part] of Object.entries(parts)) {
      let worldY = part.position[1]
      
      // If simulating, use physics-transformed position
      if (simulationTransforms.has(instanceId)) {
        const simPos = simulationTransforms.get(instanceId)!.position
        worldY = simPos[1]
      }

      if (worldY <= GROUND_THRESHOLD_MM) {
        result.push({
          instanceId,
          position: new Vector3(
            part.position[0],
            worldY,
            part.position[2]
          ),
          isSimulating: simulationTransforms.has(instanceId),
        })
      }
    }

    return result
  }, [parts])

  // Animate pulse effect
  useFrame((state) => {
    pulseRef.current += PULSE_SPEED * state.clock.getDelta()
  })

  if (touchingParts.length === 0) return null

  const pulsePhase = Math.sin(pulseRef.current)

  return (
    <group>
      {touchingParts.map((part) => {
        // Pulsing radius based on sine wave
        const pulseRadius = PULSE_RADIUS_BASE + 
          (PULSE_RADIUS_MAX - PULSE_RADIUS_BASE) * 
          ((pulsePhase + 1) / 2)

        // Opacity fades out with height above ground
        const heightFactor = Math.max(0, 1 - part.position.y / GROUND_THRESHOLD_MM)
        const opacity = 0.6 * heightFactor

        return (
          <mesh
            key={`contact-${part.instanceId}`}
            position={[part.position.x, 0.05, part.position.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[pulseRadius - 0.5, pulseRadius, 32]} />
            <meshBasicMaterial
              color="#4fc3f7"
              transparent
              opacity={opacity}
              side={2} // Double-sided
              blending={2} // Additive blending
              depthWrite={false} // Don't write to depth buffer
            />
          </mesh>
        )
      })}
    </group>
  )
}
