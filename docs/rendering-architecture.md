# Rendering Architecture

## Tech Stack
- **Three.js r168+** via `@react-three/fiber` + `@react-three/drei` (React 19)  
- Physics preview: **Rapier.js** (WASM) for drag-and-drop snapping ghosts  
- Desktop: **Tauri 2** (minimal bundle size ~15 MB)

## Performance Optimizations
- **InstancedMesh** for all rods and same-color connectors (10k+ pieces @ 60 FPS)  
- Automatic LOD groups  
- Frustum + occlusion culling  
- Separate render layers:
  - Opaque model
  - Semi-transparent ghost (new piece preview)
  - Connection highlight lines
  - Force/stress heatmap (vertex colors)

## Visual Modes (toggleable)
1. **Realistic** — PBR materials with slight plastic gloss and accurate K'Nex colors  
2. **Instruction** — black outlines, faded previous steps, part callout labels  
3. **Exploded** — animated separation along port directions  
4. **X-Ray** — see internal rods  
5. **Stress** — color by tension (blue=cold → red=high stress)

## Camera & Controls
- Orbit + pan + zoom (mouse, trackpad, touch)  
- Keyboard shortcuts (WASD + numeric keypad like original kneditor)  
- Focus on selection / auto-frame build  
- Orthographic toggle for blueprints

## Export Features
- PNG (up to 8K)  
- MP4 turntable or step-by-step animation  
- Full GLTF/GLB export  
- Image sequence for custom PDF instructions

## Component Structure

`frontend/src/`
├── `components/`
│   ├── `BuildMenu.tsx`                 # Top navigation and export/import actions
│   ├── `PartPalette.tsx`               # Sidebar for selecting parts to add
│   ├── `ModelBrowser/`                 # UI for browsing saved models
│   └── `Viewer/`                       # 3D rendering components
│       ├── `KnexViewer.tsx`            # Main `<Canvas>` entry point
│       ├── `BuildScene.tsx`            # Scene layout, lights, and core rendering logic
│       ├── `InstancedParts.tsx`        # High-performance `InstancedMesh` rendering for parts
│       ├── `PartMesh.tsx`              # Individual part mesh rendering (fallback/special parts)
│       ├── `GhostPreview.tsx`          # Semi-transparent preview for drag-and-drop placement
│       ├── `PortIndicators.tsx`        # Visual guides/markers for valid connection ports
│       ├── `SceneInteraction.tsx`      # Mouse/touch event handling within the 3D scene
│       └── `VisualModeToggle.tsx`      # UI to switch between realistic, x-ray, stress modes
└── `stores/`
    └── `visualStore.ts`                # Zustand store managing visual modes and camera state