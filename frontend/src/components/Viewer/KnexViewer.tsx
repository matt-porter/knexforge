import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'
import { VisualModeToggle } from './VisualModeToggle'
import { useInteractionStore } from '../../stores/interactionStore'
import { useEffect } from 'react'

/**
 * Main 3D viewer component.
 * Provides the Canvas, lighting, grid, orbit controls, and environment.
 * The BuildScene renders actual K'Nex parts from GLB meshes.
 */
export function KnexViewer() {
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
        <BuildScene />

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
        <OrbitControls makeDefault />

        {/* HDR environment for reflections */}
        <Environment preset="city" />
      </Canvas>
      <VisualModeToggle />
      <PlacementHintOverlay />
    </div>
  )
}

function PlacementHintOverlay() {
  const { mode, placingPartId, matchTargetId, isSnapped } = useInteractionStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // We don't know the exact number of variants here, so we pass a high number 
      // and PortIndicators will modulo it down to length. 
      // (A better way is to store maxVariants in store, but this works given the % length logic inside PortIndicators)
      // Actually, since the React state isn't driving the variants length directly in the store, 
      // let's pass an arbitrarily large MAX number so the integer climbs, and the UI can modulo it.
      if (e.key === 'Tab') {
        e.preventDefault()
        useInteractionStore.getState().cycleSnapVariant(100) // arbitrarily large wrap
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
