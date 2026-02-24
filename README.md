# K'NexForge

**AI-Powered Open-Source K'Nex CAD Builder**

Build, simulate, share, and **AI-generate** professional K'Nex models with step-by-step printable instructions — all in one modern, free, cross-platform app.

![K'NexForge Screenshot](https://via.placeholder.com/800x400/FFCC00/000000?text=K%27NexForge+Screenshot+Coming+Soon)


Credit to https://www.printables.com/model/143840-knex-parts-customizable/files for SCAD models
---

## ✨ Features

- **Realistic 3D snapping** with exact port-based physics (no floating pieces)
- **Live stability simulation** (gravity, tension, collapse detection)
- **AI Generation** — type “tall Ferris wheel with red accents” and get a full build in seconds
- **Professional instructions** — auto-generated PDF/HTML booklets with exploded views, part callouts, and BOM (exactly like official K’Nex sets)
- **File format** — tiny, Git-friendly `.knx` (JSON + GLB meshes)
- **Works offline** — full desktop app (≈15 MB installer)
- **Extensible** — add new parts via simple JSON + GLB, plugin system for custom tools
- **Modern UI** — drag-and-drop + keyboard-first like kneditor, but beautiful and fast

---

## 🏗️ Architecture Overview
┌─────────────────────┐    ┌─────────────────────┐
│   Frontend (Tauri)  │◄──►│   Python Core       │
│ React + TS +        │    │ (FastAPI sidecar)   │
│ React-Three-Fiber   │    │ - Part DB           │
│ Three.js + Rapier   │    │ - Snapping Engine   │
│                     │    │ - Physics (PyBullet)│
└─────────────────────┘    │ - File I/O          │
│ - Instruction Gen   │
└──────────┬──────────┘
│
┌──────────▼──────────┐
│   AI Layer (Llama)   │
│ - Fork of LegoGPT    │
│ - JSON action stream │
│ - Rollback validator │
└──────────────────────┘

**Strict separation of concerns** (Model-View-Controller + Clean Architecture):
- **Domain / Core** (Python) — pure logic, headless, 100% testable
- **Renderer** (Three.js) — only draws, knows nothing about snapping
- **AI** — calls the core as an oracle for validation/stability during generation

This design lets the AI run on a server or locally while the UI stays buttery smooth.

---

## 🧩 Key Components

### 1. Part Database (`parts/` + `schema/knex-part.schema.json`)
Every piece is defined by **one JSON file + one GLB mesh**.

**Example: 3-Way Yellow Connector**
```json
{
  "id": "connector-3way-yellow-v1",
  "name": "3-Way Connector (Yellow)",
  "category": "connector",
  "mesh_file": "meshes/connector-3way-yellow.glb",
  "default_color": "#FFCC00",
  "mass_grams": 2.1,
  "ports": [
    { "id": "A", "position": [12.5, 0, 0], "direction": [1, 0, 0], "mate_type": "rod_hole", "accepts": ["rod_end"], "allowed_angles_deg": [0,90,180,270] },
    { "id": "B", "position": [-6.25, 10.825, 0], "direction": [-0.5, 0.866, 0], "mate_type": "rod_hole", "accepts": ["rod_end"], "allowed_angles_deg": [0,90,180,270] },
    { "id": "C", "position": [-6.25, -10.825, 0], "direction": [-0.5, -0.866, 0], "mate_type": "rod_hole", "accepts": ["rod_end"], "allowed_angles_deg": [0,90,180,270] }
  ]
}

2. Python Core (core/)

knexforge/core/build.py — Build, PartInstance, ConnectionGraph (NetworkX)
knexforge/core/snapping.py — port-to-port alignment + tolerance
knexforge/core/physics.py — PyBullet + lightweight graph-tension fallback
knexforge/core/instructions.py — topological sort → exploded steps → ReportLab PDF
FastAPI sidecar for Tauri communication (or direct subprocess)

3. Frontend (frontend/)

React 19 + TypeScript + Vite
@react-three/fiber + @react-three/drei + Rapier.js (WASM)
Zustand + Immer for undo/redo
Tauri 2 desktop wrapper (Windows/macOS/Linux)

4. AI Generation (ai/)

Fork of LegoGPT (CMU 2025)
Llama-3.2-1B-Instruct (or Qwen2.5-3B) fine-tuned on K’Nex action sequences
Training format (JSON Lines — one action per line):

```
{"step":1,"action":"add_part","part_id":"connector-3way-yellow-v1","instance_id":"c1","position":[0,0,0],"quaternion":[0,0,0,1]}
{"step":2,"action":"add_rod","part_id":"rod-150-red-v1","instance_id":"r1","from_port":"c1.A","to_port":"new"}
...
```

During generation the Python core validates every step → automatic rollback on collision or instability
Works locally via Ollama or on a cheap GPU server

5. File Format (.knx)
ZIP containing:

model.json — action history + final graph
meshes/ — embedded GLB files
metadata.json — author, prompt (if AI-generated), version

Fully version-controllable with Git.

🚀 Quick Start (Development)
Bash# 1. Clone
git clone https://github.com/yourname/knexforge.git
cd knexforge

# 2. Python core
cd core
pip install -e .
python -m knexforge.cli --help

# 3. Frontend + Tauri
cd ../frontend
npm install
npm run tauri dev
Production build (one command):
Bashnpm run tauri build

📁 Project Structure
textknexforge/
├── core/                  # Python domain + AI oracle
├── frontend/              # React + Tauri
├── ai/                    # Fine-tuning scripts + dataset generator
├── parts/                 # All official part JSON + meshes/
├── schema/                # JSON Schema
├── docs/                  # Architecture decision records
├── examples/              # Sample .knx files
└── README.md

🤝 Contributing
We want this to be a community project!

Add a new part → PR one JSON + GLB
Improve snapping/physics
Help generate the 50k+ training dataset
Test on real K’Nex builds
Write tutorials

See CONTRIBUTING.md (coming soon).
Not affiliated with K’Nex / Basic Fun — fan project only.

📜 License
MIT — free for personal, educational, and commercial use.

🛣️ Roadmap

v0.1 (March 2026) — manual editor + basic snapping + export
v0.2 — AI generation + stability sim
v0.3 — printable instructions + parts editor GUI
v1.0 — 100+ parts, cloud sharing, VR mode


Let’s build the ultimate K’Nex creative tool together.
⭐ Star the repo if you’re excited!
Questions? Open an issue or join the Discord (link coming).
Made with ❤️ for the K’Nex community.