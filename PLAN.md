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

## Phase 2 — Project Scaffolding & Hygiene ✅ COMPLETE

### ✅ Task 2.1: Move `schema/README.md` → root `README.md`
- Moved to project root

### ✅ Task 2.2: Add `format_version` to schema
- Added `format_version` (const `"1.0"`) to `knex-part.json` schema + required array
- Updated all 12 part JSONs with `"format_version": "1.0"`
- Added field to `KnexPart` Pydantic model

### ✅ Task 2.3: Generate GLB meshes
- Generated all 12 GLBs via OpenSCAD + trimesh
- Fixed `generate_meshes.py` version-suffix stripping to match `mesh_file` paths in part JSONs

### ✅ Task 2.4: Add `.gitignore`
- Added Python, Node, Tauri, IDE, OS, and generated mesh ignores

---

## Phase 3 — Core Feature Gaps

### ✅ Task 3.1: `.knx` File I/O (`src/core/file_io.py`)
- Implemented `save_knx()` and `load_knx()` with full round-trip support
- Compact model.json format (part_id refs, dotted connection notation)
- `Manifest` Pydantic model for metadata; auto-populates piece_count + stability
- Embeds required GLB meshes in ZIP; 10 tests covering all aspects

### ✅ Task 3.2: Action History System (`src/core/action_history.py`)
- `AddPartAction`, `SnapAction`, `RemovePartAction` Pydantic models (JSONL-compatible)
- `ActionHistory` class: record, cursor-based undo/redo, JSONL round-trip
- Build integration: all mutations auto-record; `build.undo()`/`build.redo()` with full state reversal
- `.knx` integration: `action_history.jsonl` saved/loaded in ZIP packages; 20 tests

### ✅ Task 3.3: Instructions Generator (`src/core/instructions/`)
- `__init__.py`, `generator.py`, `pdf_renderer.py` (implemented)
- Topological sort of build steps (stubbed/ready)
- Exploded view step computation (stubbed)
- BOM (Bill of Materials) generation (done)
- PDF output via ReportLab (done)

### ✅ Task 3.4: PyBullet Physics — Tier 2 (`src/core/physics/pybullet.py`)
- Wrapper around PyBullet for full rigid-body simulation
- Auto-generate convex hulls from GLB meshes
- Joint creation at validated ports
- `simulate_collapse(build) -> CollapseResult`
- Add `pybullet` to optional dependencies

### ❌ Task 3.6: PyBullet Physics — Tension Data
- The PyBullet backend currently doesn't compute/return per-rod physical stress/tension data. 
- Needs to calculate real tension values and pipe them through to the frontend via the API for the "Stress" Visual Mode (which is currently mocked).

### ✅ Task 3.5: FastAPI Sidecar (`src/core/api.py`)
- Implemented FastAPI router exposing core operations as HTTP endpoints
- Endpoints: `/build`, `/snap`, `/stability`, `/export`, `/load`
- Pydantic request/response models
- WebSocket for real-time stability updates
- Added `fastapi`, `uvicorn` to dependencies

---

## Phase 4 — Frontend (React + Tauri)

### ✅ Task 4.1: Initialize `frontend/` project
- Vite + React 19 + TypeScript 5.9 template scaffolded
- Installed: `@react-three/fiber` v9, `@react-three/drei` v10, `@dimforge/rapier3d-compat`, `zustand` v5, `immer`, `three`
- Tauri 2.10 initialized with `knexforge` Rust crate, 1280×800 window
- ESLint (typescript-eslint + react-hooks + react-refresh) + Prettier configured
- Initial 3D viewer with Canvas, OrbitControls, Grid, Environment, and demo BuildScene
- Part palette sidebar with all 12 parts grouped by category
- TypeScript and Rust both compile clean; Vite dev server starts on :5173

### ✅ Task 4.2: Core 3D Viewer (`KnexViewer.tsx`)
- `<Canvas>` with orbit controls, grid, improved lighting (directional shadows, fill light)
- GLB mesh loading via `useGLTF` from `@react-three/drei` — all 12 part GLBs served from `public/parts/meshes/`
- `usePartDefs` hook loads all part JSON definitions, `getGlbUrl` maps mesh_file → URL, `preloadAllMeshes` for cache warming
- `PartMesh.tsx`: renders a single part instance (GLB + position/quaternion/color override + selection highlight)
- `InstancedParts.tsx`: `InstancedMesh` rendering for part types with ≥4 instances (per rendering-architecture.md, 10k+ pieces @ 60 FPS)
- `BuildScene.tsx`: groups parts by type, auto-selects InstancedMesh vs individual PartMesh, renders from a `PartInstance[]` data structure (demo build included; ready for Zustand store in Task 4.3)
- TypeScript types (`types/parts.ts`): `Port`, `KnexPartDef`, `PartInstance`, `Connection`, `BuildState`
- Part assets copied to `frontend/public/parts/` with manifest; all served correctly in dev and production builds
- HDR environment, shadow-mapped directional light, Suspense fallback for loading state

### ✅ Task 4.3: Build State Store (Zustand)
- `buildStore.ts`: Zustand v5 + Immer middleware store mirroring Python core `Build` state
- State: `parts` (Record by instance_id), `connections`, `stabilityScore`, `selectedPartId`
- Actions: `addPart`, `removePart`, `addConnection`, `selectPart`, `loadBuild`, `clearBuild`, `setStabilityScore`
- Full snapshot-based undo/redo stack (`undoStack` / `redoStack`) with `undo()`, `redo()`, `canUndo()`, `canRedo()`
- Duplicate/invalid guards: ignores duplicate instance IDs, rejects connections to missing parts, deduplicates connections
- `clearBuild` is undoable; `loadBuild` resets undo/redo stacks entirely
- `SidecarBridge` service (`services/sidecarBridge.ts`): Tauri command bridge to Python FastAPI sidecar with HTTP fallback for web dev mode
- Bridge methods: `connect`, `requestSnap`, `requestStability`, `exportBuild`, `loadBuild`
- `BuildScene.tsx` wired to store: reads parts/selection from Zustand, loads demo build on first render, supports per-instance selection highlight
- Instancing auto-downgrades to individual `PartMesh` when a part in the group is selected (for highlight support)
- Vitest test infrastructure: `vitest` + `@testing-library/react` + `jsdom` configured
- **43 unit tests** covering all store operations (add, remove, snap, select, undo, redo, load, clear, snapshot, derived getters)
- All checks pass: `tsc`, `eslint`, `vitest run`, `vite build`

### ✅ Task 4.4: Part Palette & Drag-and-Drop
- **PartPalette rewrite**: reads real part definitions from `usePartDefs`, grouped by category (Rods, Connectors, Wheels), sorted by size
- Click a part in the palette → enters **place mode** with ghost preview following cursor
- **GhostPreview component**: semi-transparent GLB mesh at cursor position; green when snapped, blue otherwise
- **SceneInteraction component**: per-frame ground-plane raycasting, grid-snap (10mm), port proximity snap detection
- **Port snap-to-nearest**: `snapHelper.ts` computes world-space port positions, finds nearest compatible port (rod_end ↔ rod_hole), aligns ghost rotation + position to target port
- Click to place part at ghost position; automatically creates `Connection` if snapped to a port
- Stay in place mode after placing — allows rapid placement of multiple parts
- **Right-click or Escape** cancels placement; **R key** rotates ghost 90° around Y
- **Click-to-select** on existing parts (in select mode): `PartMesh` handles click → `selectPart`, with selection highlight (blue emissive) and hover highlight (white emissive)
- **Keyboard shortcuts** (`useKeyboardShortcuts` hook): Ctrl+Z undo, Ctrl+Y/Ctrl+Shift+Z redo, Delete/Backspace remove selected, Escape cancel/deselect, R rotate
- **Toolbar** in palette footer: undo/redo/delete/clear buttons with disabled states, part count + connection count display, placement status hint
- **InteractionStore** (Zustand + Immer): tracks `mode` (select/place), `placingPartId`, `ghostPosition`, `ghostRotation`, `snapTarget`, `hoveredPartId`, with `rotateGhost` quaternion math
- **68 unit tests** across 3 test files: buildStore (43), interactionStore (15), snapHelper (10)
- All checks pass: `tsc`, `eslint`, `vitest run`, `vite build`

### ✅ Task 4.5: Visual Modes
- Realistic, Instruction, Exploded, X-Ray, Stress (per rendering-architecture.md)
- Toggle UI controls

### ✅ Task 4.6: Port-Targeted Building Mode
- 3-stage building flow: Select Part → Select Toolbox Item → Click Available Port.
- Render visual indicators for compatible open ports on the selected part.
- Update `interactionStore` to track `port-match` mode.

### ✅ Task 4.7: Alternative Snapping & Sliding Interactions
- Extended `knex-part.json` schema to support `center` clipping and `slide_hole` attachments on rods and connectors.
- Multi-variant snapping via `PortIndicators`.
- Tab-key cycling UX overlay for `activeSnapVariantIndex`.

### ✅ Task 4.9: Model Browser UI
- New **Model Browser** tab in the main app alongside the existing Builder tab.
- `dataset.jsonl` served at `/dataset.jsonl` in dev and copied into `dist/` for production (new `serveDatasetPlugin` in `vite.config.ts`).
- `src/types/dataset.ts` — TypeScript types (`DatasetEntry`, `DatasetAddPartAction`, `DatasetSnapAction`).
- `src/stores/datasetStore.ts` — Zustand store: lazy JSONL fetch, free-text search, stability filter (`all/stable/unstable`), selected model index.
- `src/hooks/useDataset.ts` — `useDatasetLoader` hook (triggers one-shot fetch), `datasetEntryToBuild` (converts action stream → `PartInstance[]` + `Connection[]`), `countParts`.
- `src/components/ModelBrowser/ModelBrowser.tsx` — full-page component: filterable sidebar of model cards with stability badges + piece counts; 3D viewer pane showing the selected model; "Open in Builder" button fires `knexforge:open-builder` CustomEvent.
- `App.tsx` rewritten with a tab bar (🔧 Builder / 📂 Model Browser); live stability indicator; tabs share the same `KnexViewer`/`BuildStore` so a model loaded in the browser opens instantly in the builder.
- `BuildScene` and `KnexViewer` gained `loadDemoWhenEmpty` prop so the browser's empty-state doesn't trigger the demo build.
- **42 new tests** (25 datasetStore + 17 useDataset) — all 126 tests green.
- Fixed pre-existing unused-variable TypeScript error in `PortIndicators.tsx`.


- Added `rod_side` and `slide_hole` to Python `MateType` literal — part JSONs with these types now load and validate correctly in the Python core.
- Updated `snap_ports()` to handle side-on clip connections (rod_side ↔ rod_hole) with anti-parallel direction checks, alongside existing end-on logic.
- Added `align_part_to_port()` generic helper supporting both end-on and side-on alignment with configurable twist angle.
- Updated stale Python tests for new port counts (connectors now have center port, rods have 5 ports including center_axial + center_tangent).
- Added 4 new Python snapping tests: side-clip connector onto rod, rod_side/rod_hole compatibility, align_part_to_port geometry, wrong-direction rejection.
- Added comprehensive frontend simulation test (`portIndicatorSim.test.ts`) proving that PortIndicators generates both through-hole AND side-clip variants at the rod center indicator, verifying Tab cycling covers all 8 variants.
- **Fixed Tab cycling bug**: `setSnapTarget` was resetting `activeSnapVariantIndex` to 0 whenever the target port ID changed, even when cycling variants at the same position (e.g., `center_axial_1` → `center_tangent`). Fixed by only resetting when the target *instance* changes. Added variant index reset in `PortIndicators.handlePointerOver` for when the user moves to a different indicator position.
- Added 3 dedicated Tab cycling regression tests (`tabCycling.test.ts`).
- All 71 Python tests pass, all 84 frontend tests pass.

### Task 4.10: More user interactions

- Where parts can slide (e.g. rod-through-hole, or side on click), the user should be able to freely choose where the part sits along the length of the rod. We need new UI for this, unless it can be done by constraints based on other parts.
- Maybe this sliding/rotating of freely movable parts could be acheived by having a way to attach the other end of a rod, after the rod is already attached to the model at one end.
- Similarly, when a part could rotate, e.g. connector with a rod through hole, or connector on the end of rod, it would be uesful to be able to rotate it, even after it's attached
- When using tab or r to rotate or select alternative attachment points, it would be nice if the part movement was animated

### Task 4.11: More modelling changes/additions

- Green micro rods aren't long enough to clip connectors on to, so shouldn't have that option.
- Wheel should only have the hole as attachment point, can't attach rods.
- New modelling for 3D parts "blue ball" "purple quarter ball" "blue/purple half ball"
- New models for spacers, beige locking clips etc


# Task 4.12: Improved physics

- enable gravity when considering model stability/strength/tension
- Freely movable parts, e.g. wheels, pivots - how to show in UI?

---

## Phase 5 — AI Layer

### ✅ Task 5.1: Initialize `ai/` directory
- `src/ai/__init__.py`, `dataset_generator.py`, `inference.py` created
- Dataset generator outputs JSONL with `--dry-run` flag
- All imports aligned to actual core API (`PartLoader.load()`, `Build.add_part(PartInstance)`, `attempt_snap()`, `compute_stability()`)
- 2 dataset tests + 3 inference tests passing (76 total + 2 skipped)

### ✅ Task 5.2: Training Data Pipeline (Basic)
- `generate_procedural_build()`: random valid builds via port-compatibility matching + `align_part_to_port()`
- `generate_dataset()`: JSONL output with stability scoring, action history export, captions
- Stability filtering via `compute_stability()` (Tier 1 graph physics)
- ❌ **Not yet done**: Multi-view rendering → captioning, scale to 60k+ pairs

### ✅ Task 5.3: Inference Loop (Basic)
- `InferenceEngine` class with autoregressive JSON action stream via Ollama
- Core validation at each step (unknown part IDs rejected, invalid snaps rejected)
- Rollback on unstable builds (`compute_stability < 50`)
- Consecutive failure limit (3) to prevent infinite loops
- ❌ **Not yet done**: Fine-tuned model, prompt engineering for quality, multi-view conditioning
- Sketch or description input -> model output

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
- Github project page, donation support

### Task 6.5 Go live / Promotion

- Find user / discussion groups online
- Research interests
- Get feedback

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
- Removed purple 3D connector from UI and dataset generator (planned/fixed)
- Task: Fix purple 3D connector and blue 7-way connector models (geometry, port layout, UI and dataset support)
