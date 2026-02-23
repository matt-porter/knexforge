import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'

/**
 * Main 3D viewer component.
 * Provides the Canvas, lighting, grid, orbit controls, and environment.
 * The BuildScene renders actual K'Nex parts from GLB meshes.
 */
export function KnexViewer() {
  return (
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
  )
}
