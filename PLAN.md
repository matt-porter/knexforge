# K'NexForge — Implementation Plan

**Status as of 2026-02-22**: The project has strong documentation, a JSON schema, 12 part definitions with OpenSCAD sources, and partial Python core scaffolding. However, critical pieces are missing or non-functional. This plan identifies every gap and orders tasks by dependency.

---

## Current State Summary

### ✅ What Exists & Works
- **AGENTS.md** — comprehensive contributor guide
- **schema/knex-part.json** — JSON Schema for part definitions
- **parts/*.json** (×12) — all 12 core parts with real-world measurements
- **parts/meshes/scad/*.scad** (×12) — OpenSCAD source files for all parts
- **tools/generate_meshes.py** — SCAD → STL → GLB pipeline (functional, needs OpenSCAD installed)
- **docs/** — 4 design docs (file-formats, physics-model, rendering-architecture, ai-training-plan)
- **src/core/parts/models.py** — Pydantic models (Port, KnexPart, PartLibrary, PartInstance, Connection)
- **src/core/build.py** — Build class with add/remove/snap/serialize
- **src/core/snapping.py** — port-based snapping engine (snap_ports, align_rod_to_hole)
- **src/core/physics/graph.py** — Tier 1 graph-based stability scoring
- **src/core/tests/** — 5 test files with comprehensive TDD-style tests

### ❌ What's Broken or Missing

| Gap | Severity | Detail |
|-----|----------|--------|
| ~~`src/core/parts/loader.py` is **empty**~~ | ✅ Fixed | Implemented in Phase 1 |
| ~~No `pyproject.toml` / `requirements.txt`~~ | ✅ Fixed | Created in Phase 1 |
| No **GLB meshes** generated | 🟡 Medium | `.scad` files exist but no `.glb` output yet |
| ~~Circular import: `physics/graph.py` → `core.build`~~ | ✅ Fixed | Fixed in Phase 1 |
| Folder structure mismatch | 🟡 Medium | AGENTS.md says `core/` at root; actual code is at `src/core/` |
| ~~No **README.md** at project root~~ | ✅ Fixed | Moved in Phase 2 |
| ~~`core/__init__.py` exports but `loader.py` empty~~ | ✅ Fixed | Implemented in Phase 1 |
| ~~`build.py` absolute imports~~ | ✅ Fixed | Fixed in Phase 1 |
| No `core/instructions/` module | 🟠 High | Documented in architecture but not started |
| No `core/api.py` (FastAPI router) | 🟠 High | Required for Tauri communication |
| No `frontend/` directory | 🟠 High | No React/Tauri app exists |
| No `ai/` directory | 🟠 High | No AI layer exists |
| No `.knx` file I/O | 🟠 High | File format documented but no serialization code |
| No `core/physics/pybullet.py` (Tier 2) | 🟡 Medium | Only Tier 1 graph physics exists |
| No `examples/` directory | 🟢 Low | Referenced in README roadmap |
| `schema/knex-part.json` missing `format_version` | 🟢 Low | AGENTS.md warns about schema changes needing version bumps |

---

## Phase 1 — Make Core Runnable & Testable (Priority: 🔴) ✅ COMPLETE

All 31 tests passing. Core is fully runnable.

- ✅ **Task 1.1**: Created `pyproject.toml` (hatchling, all deps, ruff/pyright/pytest config)
- ✅ **Task 1.2**: Implemented `src/core/parts/loader.py` (PartLoader with load/cache/mesh path/validation)
- ✅ **Task 1.3**: Fixed circular import (`TYPE_CHECKING` guard in physics/graph.py, lazy import in build.py)
- ✅ **Task 1.4**: Fixed all import paths to relative imports; converted Build from BaseModel to plain class
- ✅ **Task 1.5**: All 31 tests green; fixed geometrically incorrect test positions using `align_rod_to_hole`

---

## Phase 2 — Project Scaffolding & Hygiene

### ✅ Task 2.1: Move `schema/README.md` → root `README.md`
- Moved to project root

### Task 2.2: Add `format_version` to schema
- Add `"format_version": {"type": "string", "const": "1.0"}` to `knex-part.json`
- Update all 12 part JSON files to include `"format_version": "1.0"`
- Per AGENTS.md: schema changes must bump version

### Task 2.3: Generate GLB meshes
- Run `python tools/generate_meshes.py --force` (requires OpenSCAD installed)
- Verify all 12 `.glb` files are created in `parts/meshes/`
- Add a note in README about OpenSCAD prerequisite

### ✅ Task 2.4: Add `.gitignore`
- Added Python, Node, Tauri, IDE, OS, and generated mesh ignores

---

## Phase 3 — Core Feature Gaps

### Task 3.1: `.knx` File I/O (`src/core/file_io.py`)
- `save_knx(build: Build, path: Path, metadata: dict)` — ZIP creation per `docs/file-formats.md`
  - `manifest.json`, `model.json`, `action_history.jsonl`, `thumbnails/`, `meshes/`
- `load_knx(path: Path, library: PartLibrary) -> tuple[Build, dict]`
- Round-trip tests

### Task 3.2: Action History System
- Pydantic model for actions: `AddPart`, `AddRod`, `RemovePart`, `Snap`
- `ActionHistory` class: append, undo, redo, serialize to JSONL
- Integration with `Build` — every mutation records an action
- Required for AI training format and `.knx` replay

### Task 3.3: Instructions Generator (`src/core/instructions/`)
- `__init__.py`, `generator.py`, `pdf_renderer.py`
- Topological sort of build steps
- Exploded view step computation
- BOM (Bill of Materials) generation
- PDF output via ReportLab (add to dependencies)

### Task 3.4: PyBullet Physics — Tier 2 (`src/core/physics/pybullet.py`)
- Wrapper around PyBullet for full rigid-body simulation
- Auto-generate convex hulls from GLB meshes
- Joint creation at validated ports
- `simulate_collapse(build) -> CollapseResult`
- Add `pybullet` to optional dependencies

### Task 3.5: FastAPI Sidecar (`src/core/api.py`)
- FastAPI router exposing core operations as HTTP endpoints
- Endpoints: `/build`, `/snap`, `/stability`, `/export`, `/load`
- Pydantic request/response models
- WebSocket for real-time stability updates
- Add `fastapi`, `uvicorn` to dependencies

---

## Phase 4 — Frontend (React + Tauri)

### Task 4.1: Initialize `frontend/` project
- `npm create vite@latest` with React + TypeScript template
- Install: `@react-three/fiber`, `@react-three/drei`, `@rapier-rs/rapier3d-compat`, `zustand`, `immer`
- Tauri 2 init: `npm create tauri-app@latest`
- ESLint + Prettier config

### Task 4.2: Core 3D Viewer (`KnexViewer.tsx`)
- `<Canvas>` with orbit controls, grid, lighting
- Load and display GLB meshes from part library
- InstancedMesh for performance (per rendering-architecture.md)

### Task 4.3: Build State Store (Zustand)
- Mirror `Build` state from Python core
- Undo/redo stack using Immer patches
- Tauri command bridge to Python sidecar

### Task 4.4: Part Palette & Drag-and-Drop
- Sidebar with parts grouped by category
- Drag from palette → ghost preview → snap to nearest port
- Keyboard shortcuts (WASD + numpad per docs)

### Task 4.5: Visual Modes
- Realistic, Instruction, Exploded, X-Ray, Stress (per rendering-architecture.md)
- Toggle UI controls

---

## Phase 5 — AI Layer

### Task 5.1: Initialize `ai/` directory
- Fork/adapt LegoGPT architecture (per ai-training-plan.md)
- Dataset generator script (JSONL output)
- `--dry-run` flag for testing

### Task 5.2: Training Data Pipeline
- Procedural K'Nex model generation using core
- Stability filtering via physics sim
- Multi-view rendering → captioning
- Output: 60k+ (prompt, action-sequence) pairs

### Task 5.3: Inference Loop
- JSON action stream prediction
- Core validation at each step
- Rollback on invalid/unstable actions
- Ollama integration for local inference

---

## Phase 6 — Polish & Release (v0.1 Target: March 2026)

### Task 6.1: Export formats
- `.ldr` (LDraw) export
- GLTF/GLB folder export
- PNG screenshot (up to 8K)

### Task 6.2: Example `.knx` files
- Create `examples/` directory
- 3–5 sample builds demonstrating different complexities

### Task 6.3: CI/CD
- GitHub Actions: lint (ruff + pyright) → test (pytest) → build (Tauri)
- Coverage gate ≥90%

### Task 6.4: Documentation
- `CONTRIBUTING.md`
- User-facing docs / tutorial
- API reference (auto-generated from docstrings)

---

## Dependency Graph

```
Phase 1 (Core Runnable)
  ├── 1.1 pyproject.toml
  ├── 1.2 loader.py ──────────┐
  ├── 1.3 fix circular import │
  ├── 1.4 fix import paths    │
  └── 1.5 tests green ◄───────┘
        │
Phase 2 (Scaffolding)
  ├── 2.1 README
  ├── 2.2 schema version
  ├── 2.3 generate GLBs
  └── 2.4 .gitignore
        │
Phase 3 (Core Features) ◄── requires Phase 1
  ├── 3.1 .knx file I/O
  ├── 3.2 action history ──┐
  ├── 3.3 instructions     │
  ├── 3.4 PyBullet Tier 2  │
  └── 3.5 FastAPI sidecar  │
        │                  │
Phase 4 (Frontend) ◄── requires 3.5
        │                  │
Phase 5 (AI) ◄──── requires 3.2
        │
Phase 6 (Polish)
```

---

## Immediate Next Steps (recommended order)

1. **Task 1.1** — Create `pyproject.toml`
2. **Task 1.2** — Implement `loader.py`
3. **Task 1.3** — Fix circular import
4. **Task 1.4** — Fix relative imports
5. **Task 1.5** — Run tests, get to green
6. **Task 2.1** — Move README to root
7. **Task 2.4** — Add `.gitignore`
