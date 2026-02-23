import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { BuildScene } from './BuildScene'

export function KnexViewer() {
  return (
    <Canvas
      camera={{ position: [150, 120, 150], fov: 50, near: 0.1, far: 10000 }}
      style={{ background: '#16213e' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 200, 100]} intensity={0.8} castShadow />
      <BuildScene />
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
      <OrbitControls makeDefault />
      <Environment preset="city" />
    </Canvas>
  )
}
