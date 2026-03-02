import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'
import { VisualModeToggle } from './VisualModeToggle'
import { SnapVariantHUD } from './SnapVariantHUD'
import { useInteractionStore } from '../../stores/interactionStore'
import { useBuildStore } from '../../stores/buildStore'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { ContextMenu } from './ContextMenu'

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
 * Main 3D viewer component.
 * Provides the Canvas, lighting, grid, orbit controls, and environment.
 * The BuildScene renders actual K'Nex parts from GLB meshes.
 */
export function KnexViewer({ loadDemoWhenEmpty = true }: { loadDemoWhenEmpty?: boolean }) {
  usePlacementKeyCapture()
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [150, 120, 150], fov: 50, near: 0.1, far: 10000 }}
        shadows
        style={{ background: '#16213e' }}
      >
        {/* Ambient fill light */}
        <ambientLight intensity={0.4} />

        {/* Main directional light with shadows */}
        <directionalLight
          position={[100, 200, 100]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
        />

        {/* Secondary fill light from opposite side */}
        <directionalLight position={[-80, 100, -60]} intensity={0.3} />

        {/* The build scene renders all K'Nex parts */}
        <BuildScene loadDemoWhenEmpty={loadDemoWhenEmpty} />

        {/* Reference grid on the ground plane */}
        <Grid
          args={[1000, 1000]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#2a2a4a"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#3a3a6a"
          fadeDistance={500}
          infiniteGrid
        />

        {/* Orbit controls for camera navigation */}
        <CameraController />

        {/* HDR environment for reflections */}
        <Environment preset="city" />
      </Canvas>
      <VisualModeToggle />
      <SnapVariantHUD />
      <ContextMenu />
    </div>
  )
}

/**
 * Captures Tab key in place mode to cycle ports (prevent browser focus shift).
 * Mounted once inside KnexViewer so it's always active when the canvas is visible.
 */
function usePlacementKeyCapture() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        useInteractionStore.getState().cyclePort()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])
}

