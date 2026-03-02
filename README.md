# K'NexForge

**AI-Powered K'Nex CAD Builder**

Build, simulate, share, and **AI-generate** professional K'Nex models with step-by-step printable instructions — all in one modern, cross-platform app.

![K'NexForge Screenshot](https://via.placeholder.com/800x400/FFCC00/000000?text=K%27NexForge+Screenshot+Coming+Soon)

Deployment live at: https://knexforge.mattporter.workers.dev/

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

## Deployment

`npm run build` - to package everything up

`wrangler deploy` - to deploy cloudflare worker

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
```

2. Python Core (`src/core/`)

**Note**: While documentation may reference `core/`, the actual implementation is in `src/core/`.

- `build.py` — Build, PartInstance, ConnectionGraph (NetworkX)
- `snapping.py` — port-to-port alignment + tolerance
- `physics/graph.py` — lightweight graph-based stability
- `physics/pybullet.py` — full rigid-body simulation
- `instructions/generator.py` — topological sort → exploded steps → PDF
- `api.py` — FastAPI sidecar for Tauri communication

See [docs/AGENT-ONBOARDING.md](docs/AGENT-ONBOARDING.md) for detailed file locations.

3. Frontend (frontend/)

React 19 + TypeScript + Vite
@react-three/fiber + @react-three/drei + Rapier.js (WASM)
Zustand + Immer for undo/redo
Tauri 2 desktop wrapper (Windows/macOS/Linux)
**Note**: The Tauri desktop app is currently a UI stub. For full functionality (Python sidecar, simulation), use the web dev mode (`npm run dev`) and run the sidecar API separately.

4. AI Generation (ai/)

Fork of LegoGPT (CMU 2025)
Llama-3.2-1B-Instruct (or Qwen2.5-3B) fine-tuned on K’Nex action sequences
Training format (JSON Lines — one action per line):

```json
{"step":1,"action":"add_part","part_id":"connector-3way-yellow-v1","instance_id":"c1","position":[0,0,0],"quaternion":[0,0,0,1], "color": null}
{"step":2,"action":"add_part","part_id":"rod-150-red-v1","instance_id":"r1","position":[0,150,0],"quaternion":[0,0,0,1], "color": null}
{"step":3,"action":"snap","from_port":"c1.A","to_port":"r1.end1"}
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

```bash
# 1. Clone
git clone https://github.com/yourname/knexforge.git
cd knexforge

# 2. Python core (requires Python 3.12+)
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# or: .venv\Scripts\activate  # Windows
pip install -e ".[dev,physics,meshgen]"

# 3. Frontend + Tauri
cd frontend
npm install
npm run tauri dev

# 4. Start sidecar API (separate terminal)
cd ..
python -m uvicorn src.core.api:app --reload --host 127.0.0.1 --port 8000
```

## 

**Note**: The Python implementation is in `src/core/`, not `knexforge/core/`. See [docs/AGENT-ONBOARDING.md](docs/AGENT-ONBOARDING.md) for more details.

📁 Project Structure

```
Repository Root/
├── src/core/              # Python domain logic (build, snapping, physics)
├── frontend/              # React + Tauri desktop app
├── ai/                    # AI generation + scan-to-build pipeline
├── parts/                 # Part JSON definitions + GLB meshes
├── schema/                # JSON Schema for parts
├── tools/                 # Mesh generation scripts
├── docs/                  # Documentation (see AGENT-ONBOARDING.md)
└── README.md
```

**Note**: While some documentation references `knexforge/core/`, the actual Python implementation is in `src/core/`. See [docs/AGENT-ONBOARDING.md](docs/AGENT-ONBOARDING.md) for complete file locations.

🤝 Contributing
We want this to be a community project!

Add a new part → PR one JSON + GLB
Improve snapping/physics
Help generate the 50k+ training dataset
Test on real K’Nex builds
Write tutorials

See CONTRIBUTING.md.
Not affiliated with K’Nex / Basic Fun — fan project only.

🛣️ Roadmap

v0.1 (March 2026) — manual editor + basic snapping + export
v0.2 — AI generation + stability sim
v0.3 — printable instructions + parts editor GUI
v1.0 — 100+ parts, cloud sharing, VR mode


Let’s build the ultimate K’Nex creative tool together.
⭐ Star the repo if you’re excited!
Questions? Open an issue or join the Discord (link coming).
Made with ❤️ for the K’Nex community.