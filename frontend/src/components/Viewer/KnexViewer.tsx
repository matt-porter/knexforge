import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'
import { VisualModeToggle } from './VisualModeToggle'
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
      <PlacementHintOverlay />
      <ContextMenu />
    </div>
  )
}

function PlacementHintOverlay() {
  const { mode, placingPartId, matchTargetId, isSnapped } = useInteractionStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code === 'Tab' for better cross-layout support and prevent focus shifting
      if (e.code === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        // We unconditionally increment; PortIndicators modulo down works 
        useInteractionStore.getState().cycleSnapVariant()
      }
    }

    // Use capture phase to intercept Tab before the browser tries to shift focus away from the canvas
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])

  if (mode !== 'place' || !placingPartId) return null

  // If we are in targeted mode
  if (matchTargetId) {
    if (isSnapped) {
      return (
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '4px', pointerEvents: 'none', userSelect: 'none', zIndex: 100 }}>
          Press <strong>Tab</strong> to cycle attachment modes (End / Side / Slide)
        </div>
      )
    }
    return (
      <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '4px', pointerEvents: 'none', userSelect: 'none', zIndex: 100 }}>
        Select a yellow port to attach.
      </div>
    )
  }

  // Free-roam mode
  return (
    <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '4px', pointerEvents: 'none', userSelect: 'none', zIndex: 100 }}>
      Press <strong>Esc</strong> to cancel placement.
    </div>
  )
}
