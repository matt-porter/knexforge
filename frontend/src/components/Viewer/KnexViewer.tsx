import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'
import { SnapVariantHUD } from './SnapVariantHUD'
import { useBuildStore } from '../../stores/buildStore'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { ContextMenu } from './ContextMenu'
import { GroundContactFeedback } from './GroundContactFeedback'

/**
 * Handles camera focus events to center the view on the selected part.
 */
function CameraController() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  
  useEffect(() => {
    const handleFocus = () => {
      const { selectedPartId, parts } = useBuildStore.getState()
      if (!selectedPartId || !parts[selectedPartId] || !controlsRef.current) return
      
      const part = parts[selectedPartId]
      const targetPos = new Vector3(part.position[0], part.position[1], part.position[2])
      
      // Update orbit controls target
      controlsRef.current.target.copy(targetPos)
      controlsRef.current.update()
    }
    
    window.addEventListener('knexforge:focus-camera', handleFocus)
    return () => window.removeEventListener('knexforge:focus-camera', handleFocus)
  }, [])
  
  return <OrbitControls ref={controlsRef} makeDefault />
}

/**
 * Enhanced ground plane with better visibility.
 * Task 10.5: Larger size, lighter color, checkerboard pattern for visual reference.
 */
function EnhancedGroundPlane() {
  return (
    <>
      {/* Main ground plane - larger and more visible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial 
          color="#e8eaf6" 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Checkerboard pattern for scale reference */}
      <gridHelper 
        args={[2000, 200, 0x9fa5c3, 0xc5cae9]} 
        position={[0, 0.02, 0]}
      />

      {/* Edge highlight for depth separation */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[2000, 20]} />
        <meshStandardMaterial color="#9fa5c3" side={2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -1000]}>
        <planeGeometry args={[20, 2000]} />
        <meshStandardMaterial color="#9fa5c3" side={2} />
      </mesh>
    </>
  )
}

/**
 * Touching ground feedback indicator.
 * Task 10.7: Visual pulse when parts are in contact with ground.
 */
function TouchingGroundFeedback() {
  return <GroundContactFeedback />
}

/**
 * Main 3D viewer component.
 * Provides the Canvas, lighting, grid, orbit controls, and environment.
 * The BuildScene renders actual K'Nex parts from GLB meshes.
 */
export function KnexViewer({ loadDemoWhenEmpty = true }: { loadDemoWhenEmpty?: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [150, 120, 150], fov: 50, near: 0.1, far: 10000 }}
        shadows
        style={{ background: '#16213e' }}
      >
        {/* Ambient fill light - brighter for better shadow visibility */}
        <ambientLight intensity={0.5} />

        {/* Main directional light with shadows - primary sunlight */}
        <directionalLight
          position={[100, 200, 100]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-300}
          shadow-camera-right={300}
          shadow-camera-top={300}
          shadow-camera-bottom={-300}
          shadow-bias={-0.0001}
        />

        {/* Secondary fill light from opposite side - softer */}
        <directionalLight 
          position={[-80, 100, -60]} 
          intensity={0.4} 
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* Ternary rim light for edge definition */}
        <directionalLight 
          position={[0, 50, -150]} 
          intensity={0.3} 
        />

        {/* The build scene renders all K'Nex parts */}
        <BuildScene loadDemoWhenEmpty={loadDemoWhenEmpty} />

        {/* Enhanced ground plane with better visibility */}
        <EnhancedGroundPlane />

        {/* Touching ground feedback (future integration) */}
        <TouchingGroundFeedback />

        {/* Orbit controls for camera navigation */}
        <CameraController />

        {/* HDR environment for reflections */}
        <Environment preset="city" />
      </Canvas>
      <SnapVariantHUD />
      <ContextMenu />
    </div>
  )
}
