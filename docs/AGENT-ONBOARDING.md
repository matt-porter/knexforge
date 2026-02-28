# K'NexForge Agent Onboarding Guide

**Purpose**: This document helps AI agents quickly find their way around the repository and become effective without discovering everything from scratch. It complements `AGENTS.md` with practical, discovery-oriented information.

---

## 🗂️ Actual Project Structure (vs. Documented)

### ⚠️ CRITICAL: Code Location Discrepancy

**AGENTS.md states**: All Python logic is in `knexforge/core/`  
**Reality**: The actual implementation lives in **`src/core/`**, while `knexforge/core/` contains only a minimal stub.

```
Repository Root/
├── src/                          ← ACTUAL PYTHON CODE LOCATION
│   ├── core/                     ← All Python domain logic
│   │   ├── build.py              ← Build, PartInstance, ConnectionGraph
│   │   ├── snapping.py           ← Port-to-port alignment + tolerance
│   │   ├── file_io.py            ← .knx load/save
│   │   ├── api.py                ← FastAPI sidecar endpoints
│   │   ├── action_history.py     ← JSONL action tracking
│   │   ├── parts/                ← Part loader + models
│   │   ├── physics/              ← Graph stability + PyBullet
│   │   ├── instructions/         ← PDF generation
│   │   └── tests/                ← pytest suite
│   └── ai/                       ← Dataset generator + inference
├── knexforge/core/               ← STUB (minimal, mostly empty)
├── frontend/src/                 ← React + TypeScript app
│   ├── components/Viewer/        ← 3D rendering components
│   ├── stores/                   ← Zustand state management
│   ├── services/sidecarBridge.ts ← Python API client
│   └── hooks/                    ← Custom React hooks
├── ai/scan-to-build/             ← Computer vision pipeline
├── parts/                        ← Part JSON definitions + meshes/
├── schema/                       ← JSON Schema for parts
├── tools/                        ← Mesh generation scripts
└── docs/                         ← This documentation
```

**Agent Action**: Always check `src/core/` first for Python implementation details. Ignore references to `knexforge/core/` in old documentation.

---

## 📚 Documentation Map

| Document | Purpose | Location | Status |
|----------|---------|----------|--------|
| AGENTS.md | Core principles, coding standards | Root | ✅ Complete |
| README.md | Project overview, quick start | Root | ⚠️ Outdated (wrong paths) |
| PLAN.md | Active development tasks | Root | ✅ Current |
| **AGENT-ONBOARDING.md** | **Agent discovery guide** | **docs/** | **🆕 New** |
| file-formats.md | .knx and part JSON schemas | docs/ | ✅ Complete |
| physics-model.md | Tiered stability system | docs/ | ✅ Complete |
| rendering-architecture.md | Three.js + Tauri setup | docs/ | ⚠️ Incomplete (missing component tree) |
| ai-training-plan.md | LegoGPT fork details | docs/ | ✅ Complete |
| generative-kinematics-plan.md | Mechanism synthesis roadmap | docs/ | ✅ Complete |

---

## 🔍 Quick Reference: Where to Find Things

### Python Core (`src/core/`)

| Need To Find | File | Key Classes/Functions |
|--------------|------|----------------------|
| Build state management | `build.py` | `Build`, `PartInstance`, `ConnectionGraph` |
| Port snapping logic | `snapping.py` | `snap_ports()`, `Port`, `Connection` |
| Stability calculation | `physics/graph.py` | `compute_stability()` |
| PyBullet simulation | `physics/pybullet.py` | `PyBulletSimulator`, joint creation |
| File I/O (.knx) | `file_io.py` | `save_knx()`, `load_knx()` |
| FastAPI endpoints | `api.py` | `/build`, `/snap`, `/stability`, `/export`, `/load` |
| Part definitions | `parts/models.py` | `PartDefinition`, `Port`, `MateType` enum |
| Part loader/cache | `parts/loader.py` | `load_part()`, `get_all_parts()` |
| Instruction generation | `instructions/generator.py` | `generate_instructions()` |
| PDF renderer | `instructions/pdf_renderer.py` | `render_pdf()` |

### Frontend (`frontend/src/`)

| Need To Find | File | Purpose |
|--------------|------|---------|
| Main app component | `App.tsx` | Root React component |
| 3D viewer | `components/Viewer/KnexViewer.tsx` | Three.js canvas + controls |
| Instanced rendering | `components/Viewer/InstancedParts.tsx` | High-performance mesh rendering |
| Ghost preview | `components/Viewer/GhostPreview.tsx` | Drag-and-drop placement hint |
| Port indicators | `components/Viewer/PortIndicators.tsx` | Visual port guides |
| Build state store | `stores/buildStore.ts` | Zustand store for build data |
| Interaction store | `stores/interactionStore.ts` | Mouse/keyboard input handling |
| Part library hook | `hooks/usePartLibrary.ts` | Load parts from JSON/GLB |
| Sidecar bridge | `services/sidecarBridge.ts` | HTTP/WebSocket client to Python API |
| Snap helper | `helpers/snapHelper.ts` | Frontend snapping calculations |

### AI Layer (`src/ai/`)

| Need To Find | File | Purpose |
|--------------|------|---------|
| Dataset generator | `dataset_generator.py` | Creates training data from procedural builds |
| Inference engine | `inference.py` | LLM prediction + rollback validation |
| Test utilities | `test_ai_dataset.py` | Validation scripts |

### Scan-to-Build (`ai/scan-to-build/`)

| Need To Find | File | Purpose |
|--------------|------|---------|
| Data generator | `data_generator.py` | Synthetic COCO/YOLO training images |
| Detector wrapper | `detector.py` | YOLOv8 part detection |
| Pose estimator | `pose_estimator.py` | PnP + RANSAC 3D reconstruction |
| Graph reconstructor | `graph_reconstructor.py` | Connection inference from poses |
| Validator | `validator.py` | Validate reconstructed builds against rules |

---

## 🛠️ Common Agent Tasks: Quick Commands

### Setup & Dependencies

```bash
# Python environment (requires 3.12+)
python -m venv .venv
source .venv/bin/activate     # Linux/macOS
# or on Windows:
.venv\Scripts\activate

pip install -e ".[dev,physics,meshgen,ai]"

# Frontend dependencies
cd frontend
npm install
```

### Running Services (Development)

**Python Sidecar API**:
```bash
# From repo root (after activating venv):
.venv\Scripts\python.exe -m uvicorn "src.core.api:app" --host 127.0.0.1 --port 8000 --reload
# or on Linux/macOS:
.venv/bin/python -m uvicorn src.core.api:app --reload
```

**Frontend (Web Dev Mode)**:
```bash
cd frontend
npm run dev
```

**Frontend (Tauri Desktop)**:
```bash
cd frontend
npm run tauri dev
# Note: Tauri sidecar integration is currently a stub - see "Known Limitations" below
```

**Run Tests**:
```bash
# From repo root with venv activated:
.venv\Scripts\python.exe -m pytest src/core/tests/ --cov  # Windows
.venv/bin/python -m pytest src/core/tests/ --cov          # Linux/macOS

# Frontend tests
cd frontend && npm test
```

### Running Tests

```bash
# Python core tests (from repo root)
pytest src/core/tests/ -v --cov=src/core

# Frontend tests
cd frontend && npm test

# Specific test file
pytest src/core/tests/test_build.py::test_create_part_instance -v
```

### Mesh Generation

```bash
# Generate GLBs from OpenSCAD definitions
python tools/generate_meshes.py --force

# Generate specific part (example)
python tools/generate_meshes.py --part connector-3way-yellow-v1
```

### Running the Sidecar API

```bash
# From repo root
python -m uvicorn src.core.api:app --host 127.0.0.1 --port 8000

# With auto-reload (development)
python -m uvicorn src.core.api:app --reload --host 127.0.0.1 --port 8000
```

### Running the Desktop App

```bash
cd frontend
npm run tauri dev
```

---

## 📋 Data Flow Diagrams

### Build Creation Flow

```
User Action (Frontend)
    ↓
sidecarBridge.ts → HTTP POST /build
    ↓
src/core/api.py: create_build()
    ↓
src/core/build.py: Build.__init__()
    ↓
Build stores PartInstance[] + ConnectionGraph
    ↓
Response sent back to frontend
```

### Snapping Flow (Real-time)

```
User drags part → GhostPreview.tsx shows placement
    ↓
snapHelper.ts calculates port alignment
    ↓
sidecarBridge.ts → HTTP POST /snap
    ↓
src/core/api.py: snap()
    ↓
src/core/snapping.py: snap_ports(port_a, port_b)
    ↓
Returns Connection if valid (tolerance check + mate compatibility)
    ↓
Frontend updates buildStore with new connection
```

### AI Generation Flow

```
User enters prompt → Frontend sends to AI service
    ↓
src/ai/inference.py: llm.predict(context)
    ↓
Generates next JSON action (add_part, add_rod, etc.)
    ↓
Validation: src/core/build.py: Build.apply(action)
    ↓
If invalid → rollback + resample with higher temperature
If stable → continue generation loop
```

---

## 🔑 Key Design Patterns

### 1. Port-Based Connection System

All parts define **ports** with:
- `position`: XYZ location in part-local space
- `direction`: Unit vector pointing outward (insertion axis)
- `mate_type`: What this port accepts/provides
- `allowed_angles_deg`: Valid rotation steps around direction

**Example**: A rod has two `rod_end` ports; a connector has multiple `rod_hole` ports. Snapping matches compatible mate_types and aligns positions within tolerance (default 0.2mm).

### 2. Tiered Physics System

| Tier | Speed | Use Case | Implementation |
|------|-------|----------|----------------|
| Graph-based | <15ms | Real-time feedback | `physics/graph.py` + NetworkX |
| PyBullet | 150-400ms | AI validation, export | `physics/pybullet.py` |
| Future: MuJoCo | ~1s | Advanced simulation | Not implemented |

### 3. Action History (JSONL)

Every build step is recorded as a JSON line for:
- Perfect undo/redo
- AI "continue this build" feature
- Reproducible generation

```json
{"step":1,"action":"add_part","part_id":"connector-3way-yellow-v1","instance_id":"c1","position":[0,0,0],"quaternion":[0,0,0,1]}
{"step":2,"action":"add_rod","part_id":"rod-86-red-v1","instance_id":"r1","from_port":"c1.A","to_port":"new"}
```

### 4. Frontend State Management

**Zustand stores**:
- `buildStore`: Current build state (parts, connections)
- `interactionStore`: Mouse/keyboard input, selection
- `visualStore`: Rendering mode, camera state
- `datasetStore`: AI training dataset cache

---

## 🚨 Common Pitfalls for Agents

### 1. Wrong Code Path
❌ Looking in `knexforge/core/build.py`  
✅ Look in `src/core/build.py`

### 2. Missing Dependencies
The project uses optional dependency groups:
- `physics`: PyBullet (required for simulation)
- `meshgen`: trimesh (required for mesh generation)
- `ai`: ollama, tqdm (required for AI features)

Always install with extras: `pip install -e ".[dev,physics]"`

### 3. Port Coordinate Confusion
Ports use **part-local coordinates** in the JSON definition but **world-space positions** when placed in a build. The transformation is:
```
world_pos = part_instance.position + quaternion.rotate(port_local_position)
```

### 4. Frontend-Backend Sync
The frontend caches parts locally via `usePartLibrary.ts`. Changes to `parts/*.json` require:
1. Restarting the dev server, OR
2. Calling `refreshParts()` from the store

### 5. PyBullet Joint Types
When creating joints in `physics/pybullet.py`:
- Use `JOINT_FIXED` for rigid connections (rod ends to connector holes)
- Use `JOINT_HINGE` for rotational connections (axles through center holes)
- Always specify correct hinge axis aligned with rod direction

---

## 🧪 Testing Guidelines

### Python Tests (`pytest`)

```bash
# Run all tests
pytest src/core/tests/ -v

# Run specific test class
pytest src/core/tests/test_build.py -v

# With coverage report
pytest src/core/tests/ --cov=src/core --cov-report=html

# Focus on new code only (git diff)
pytest $(git diff --name-only HEAD~1 | grep "\.py$" | xargs)
```

### Frontend Tests (`Vitest`)

```bash
cd frontend && npm test

# Run specific file
npm test src/stores/buildStore.test.ts

# With coverage
npm run test:coverage
```

### Test Coverage Requirements
- Core Python: ≥90% on new code
- AI generation: ≥95% valid builds on 50-example smoke set
- Frontend: Focus on critical paths (snapping, state updates)

---

## 📦 Adding New Parts

1. **Create JSON definition** in `parts/`:
   ```json
   {
     "format_version": "1.1",
     "id": "my-new-part-v1",
     "name": "My Custom Part",
     "category": "special",
     "mesh_file": "meshes/my-new-part.glb",
     "default_color": "#FF0000",
     "mass_grams": 5.2,
     "ports": [...]
   }
   ```

2. **Generate GLB mesh** (if using OpenSCAD):
   ```bash
   python tools/generate_meshes.py --part my-new-part-v1
   ```

3. **Add tests** in `src/core/tests/test_parts.py`:
   - Verify schema validation passes
   - Test port loading
   - Check mass/geometry consistency

4. **Update part library** (if needed):
   - Add to frontend's part palette grouping logic
   - Update AI vocabulary if it's a new category

---

## ⚠️ Known Limitations & Incomplete Features

### Tauri Desktop App Integration (Incomplete)
**Status**: The Tauri wrapper exists but **does not yet integrate with the Python sidecar API**.

- `frontend/src-tauri/` contains a minimal Rust stub (no commands implemented)
- Frontend code in `sidecarBridge.ts` has fallback logic:
  - In Tauri mode: attempts to invoke Tauri commands (currently no-ops)
  - In web dev mode (`npm run dev`): connects directly to HTTP API on port 8000
- **Workaround**: Use `npm run dev` for development; Tauri desktop build is functional but sidecar features won't work until integration is implemented

**If you need Tauri + Python integration**, the implementation plan would be:
1. Add Tauri commands in `frontend/src-tauri/src/lib.rs` that spawn/communicate with Python sidecar
2. Use `tauri-plugin-shell` to launch uvicorn as a child process
3. Forward HTTP/WebSocket requests from Tauri to the sidecar

### API Endpoint Coverage
The FastAPI sidecar (`src/core/api.py`) has **placeholder endpoints** that need implementation:
- `/build` - Returns placeholder response, needs full Build creation logic
- `/snap` - Always fails, needs actual snapping integration
- `/stability` - Partially implemented via `compute_stability()`
- `/export` and `/load` - Need to wire up file_io.py functions

**For development**, the frontend often bypasses the API and calls core Python functions directly via subprocess or imports. Check how tests use the core before relying on API endpoints.

### Scan-to-Build Pipeline (Phase 4)
The `ai/scan-to-build/` directory contains **prototype code only**:
- YOLO detector trained on synthetic data? ❌ Not yet
- Multi-view pose estimation? Prototype exists but untested
- Graph reconstruction from photos? Algorithm designed, not validated

This is a future feature track, not production-ready.

---

## 🔧 Debugging Tips

### Python Sidecar Issues
```bash
# Enable verbose logging
export PYTHONPATH=src
python -c "import logging; logging.basicConfig(level=logging.DEBUG)"
python -m uvicorn src.core.api:app --reload

# Check API health
curl http://127.0.0.1:8000/docs
```

### Frontend 3D Rendering Issues
- Open React DevTools → check Zustand store state
- Verify GLB files exist in `parts/meshes/`
- Check Three.js renderer logs for mesh loading errors
- Use `VisualModeToggle` to switch between rendering modes

### Physics Simulation Crashes
- Check joint creation in `physics/pybullet.py`
- Verify all part masses are > 0
- Ensure hinge axes are normalized unit vectors
- Look for over-constrained loops (too many fixed joints)

---

## 📞 When You're Stuck

1. **Check existing tests** - They often show how to use APIs correctly
2. **Read docstrings** - All public functions have Google-style docs
3. **Look at similar implementations** - e.g., study `test_build.py` for Build API usage
4. **Ask in PR comments** using: `"AGENT QUESTION: [your question] — reference AGENTS.md section X"`

---

## 🔄 Documentation Maintenance

When you make changes, update these docs in order:
1. Code implementation (add type hints + docstrings)
2. `docs/` files for architectural changes
3. `AGENTS.md` if coding standards change
4. This file (`AGENT-ONBOARDING.md`) if new patterns emerge

**Last updated**: 2026-02-28  
**Maintainer**: AI Agent Team
