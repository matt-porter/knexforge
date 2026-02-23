import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'

export function BuildScene() {
  const rodRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (rodRef.current) {
      rodRef.current.rotation.y += delta * 0.3
    }
  })

  return (
    <group>
      {/* Demo: a simple K'Nex-like structure */}
      {/* Connector hub */}
      <mesh position={[0, 25, 0]}>
        <dodecahedronGeometry args={[8, 0]} />
        <meshStandardMaterial color="#FFCC00" roughness={0.3} />
      </mesh>

      {/* Rods extending from center */}
      <mesh ref={rodRef} position={[0, 25, 0]}>
        <group>
          <mesh position={[27.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[2, 2, 55, 16]} />
            <meshStandardMaterial color="#0066FF" roughness={0.3} />
          </mesh>
          <mesh position={[-27.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[2, 2, 55, 16]} />
            <meshStandardMaterial color="#FF0000" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 27.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[2, 2, 55, 16]} />
            <meshStandardMaterial color="#00CC00" roughness={0.3} />
          </mesh>
        </group>
      </mesh>

      {/* Ground connector */}
      <mesh position={[0, 0, 0]}>
        <dodecahedronGeometry args={[6, 0]} />
        <meshStandardMaterial color="#FF8800" roughness={0.3} />
      </mesh>

      {/* Vertical rod */}
      <mesh position={[0, 12.5, 0]}>
        <cylinderGeometry args={[2, 2, 25, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
      </mesh>
    </group>
  )
}
