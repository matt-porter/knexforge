## Phase 3 — Core Feature Gaps (continued)

### ✅ Task 3.8: Procedural Build Assistant (`src/core/build_assistant.py`)
- Added BuildAssistant class with type-safe pydantic API
- MVP bridge logic: auto-generates rod bridge structure between anchors
- Unit tests in `core/tests/test_build_assistant.py`: check step count, part IDs, positions

### ✅ Task 3.9: Motor Spin Regression Fixes (`proc_0001`)
- Fixed physics joint creation crashes that prevented simulation transforms from streaming.
- Added backward-compatible joint inference for legacy snapshots/datasets that omit `joint_type`.
- Updated dataset conversion and simulation state handling so motorized models animate reliably in the viewer.
- Hardened revolute joint construction to use shared world-space pivots and rotational-hole axis selection, fixing over-constrained hinges that suppressed visible rod spin.
- Restricted motor torque driving to axle/revolute connections only, preventing non-axle mount snaps from absorbing motor force.
- Added sidecar-connect bootstrap in simulation startup so PLAY reliably launches backend simulation in Tauri/web modes.

### ✅ Task 3.10: Connector Flip / Rod Oscillation Fix
- **Root cause**: Torque multiplier (10,000) was ~500× larger than constraint forces could resist at 10mm anchor arms. Rods oscillated wildly off-axis; connectors flipped 90° on first frame.
- **Fix**: Reduced torque multiplier 10,000→50; increased constraint maxForce 20k→100k; widened anchor arms 10→30mm; added body damping (0.3 linear/angular); increased solver iterations 50→200.
- **Diagnostics added**: `POST /diagnostics/sim-orientation` endpoint; frontend `SimOrientationDiagnostics` class (inspect via `simDiagnostics` in browser console).
- **Tests**: `src/core/tests/test_connector_orientation.py` — 5 tests covering side-on clip, end-on clip, motor-driven chain, orientation delta, and constraint anchor validation.
- **Key lesson**: PyBullet P2P constraints resist torque proportional to `maxForce × arm_distance`. Always ensure applied torques stay well below this product, especially with sub-gram parts.

---

## Phase 4 — Scan-to-Build Computer Vision Pipeline

### ✅ Task 4.1: Synthetic Training Data Generator
- **Complete**: `ai/scan-to-build/data_generator.py` with full COCO/YOLO output
- **Complete**: `ai/scan-to-build/detector.py` - YOLOv8 wrapper for part detection
- **Complete**: `ai/scan-to-build/pose_estimator.py` - PnP + RANSAC 3D reconstruction
- **Complete**: `ai/scan-to-build/graph_reconstructor.py` - Connection inference from 3D poses
- **Complete**: `ai/scan-to-build/validator.py` - Validation against K'Nex rules
- **Complete**: `ai/scan-to-build/__init__.py` - High-level ScanPipeline orchestration
- **Complete**: `ai/scan-to-build/README.md` - Full documentation with examples
- **Complete**: `ai/scan-to-build/requirements.txt` - Dependencies list

### [ ] Task 4.2: Train YOLOv8 Model on Synthetic Data
- **Goal**: Generate labeled images of K'Nex parts for YOLO training
- **Files**: `ai/scan-to-build/data_generator.py`
- Render random part combinations from existing GLBs with varied lighting/angles
- Output COCO-format JSON + images for YOLOv8 training
- Target: 10k synthetic images per part type

### [ ] Task 4.2: YOLOv8 Part Detector Training Pipeline
- **Goal**: Train detector to recognize K'Nex parts in photos
- **Files**: `ai/scan-to-build/detector.py`, `ai/scan-to-build/train_config.yaml`
- Fine-tune YOLOv8n on synthetic + real photos
- Export ONNX model for Tauri integration

### [ ] Task 4.3: Multi-View Pose Estimation
- **Goal**: Reconstruct 3D positions from 2+ photos
- **Files**: `ai/scan-to-build/pose_estimator.py`
- PnP + RANSAC for camera pose estimation
- Triangulate part positions across views

### [ ] Task 4.4: Connection Graph Reconstruction
- **Goal**: Infer how parts connect from spatial proximity
- **Files**: `ai/scan-to-build/graph_reconstructor.py`
- Match detected ports to valid connection angles
- Validate against core snapping rules

### [ ] Task 4.5: Tauri Camera Integration + UI
- **Goal**: Photo capture workflow in desktop app
- **Files**: `frontend/src/components/ScanWizard.tsx`
- Multi-photo capture UI with preview
- Progress feedback during reconstruction

### [ ] Task 4.6: End-to-End Validation Pipeline
- **Goal**: Ensure reconstructed builds are valid `.knx` files
- **Files**: `ai/scan-to-build/validator.py`, tests in `core/tests/test_scan_to_build.py`
- Cross-check against part database schema
- Flag ambiguous connections for manual review

---

**Phase 4 Success Criteria**: User can photograph a real K'Nex build (5-10 photos) and import it as an editable `.knx` file with ≥80% accuracy on simple structures.

---

## Phase 5 — Model Export/Import System

### ✅ Task 5.1: Design Export Data Schema
- **Complete**: Created `docs/export-format.md` with full schema documentation
- Defined portable JSON format with manifest + model structure
- Captures all part instances (part_id, position, quaternion, color)
- Captures all connections (from/to ports, joint_type)
- Includes metadata: title, description, author, timestamp, piece_count, stability_score
- Version 1.0 schema ready for implementation

### ✅ Task 5.2: Core Export Functionality (`src/core/file_io.py`)
- **Complete**: Added `export_build()` function to serialize Build state
- Converts Build object → JSON-serializable dict per schema
- Validates all part_ids exist in library before export (raises ExportValidationError)
- Handles edge cases: empty builds, large builds
- Returns dict with 'manifest' and 'model' keys

### ✅ Task 5.3: Core Import Functionality (`src/core/file_io.py`)
- **Complete**: Added `import_build()` function to deserialize and reconstruct builds
- Parses JSON → validates against schema (pydantic models)
- Reconstructs Build object with all PartInstances
- Recreates ConnectionGraph from connection data
- Returns validation errors for malformed files
- Enhanced existing `save_knx()` and `load_knx()` with validation

### ✅ Task 5.4: Frontend Export UI Component (`frontend/src/`)
- **Complete**: Created `frontend/src/components/BuildMenu.tsx`
- Export button showing part count
- Loading state during serialization
- Error handling for invalid parts or API failures
- Auto-saves .knx file to user's downloads folder

### ✅ Task 5.5: Frontend Import UI Component (`frontend/src/`)
- **Complete**: Created import functionality in BuildMenu.tsx
- File input dialog for .knx files
- Preview/validation before committing (shows parts list, connections)
- Confirm dialog: "Replace Current Build" vs Cancel
- Displays validation errors if file is malformed

### ✅ Task 5.6: Round-Trip Integration Tests
- **Complete**: Created `src/core/tests/test_export_import.py` with comprehensive tests
- Test simple builds (2 parts, 1 connection)
- Test complex builds (4 parts, 3 connections)
- Test round-trip: Build → Export → Import → Compare PartInstances
- Test connection graph integrity after import
- Test metadata preservation in manifest
- Test large build performance (50 parts)
- Test export validation for missing parts
- Test import error handling for invalid formats

### ✅ Task 5.7: Large Build Performance Optimization
- **Complete**: Added comprehensive performance tests in `test_export_import.py`
- Tests for 50-part builds (baseline) - passes in <2s
- Tests for 100-part builds - passes in <3s
- Tests for 200-part builds - passes in <5s (meets success criteria)
- Performance verified: JSON serialization is efficient without streaming
- Memory usage acceptable for typical use cases (<200 parts)
- Color overrides and metadata preserved through round-trip

### ✅ Task 5.8: Version Migration Strategy
- **Complete**: Implemented full version migration system in `src/core/file_io.py`
- Added `detect_format_version()` - detects v1.0, v0.9 (legacy), or unknown
- Added `migrate_data_v0_9_to_1_0()` - migrates pre-manifest format to current
- Added `migrate_data()` - orchestrates migration with version detection
- Enhanced `import_build()` - automatically migrates legacy formats
- Comprehensive validation system:
  - `validate_manifest()` - checks required fields and types
  - `validate_model()` - validates parts/connections arrays
  - `validate_part_entry()` - validates individual part structure
  - `validate_connection_entry()` - validates port format (instance.port)
  - `validate_exported_data()` - complete data validation
- Deprecation warnings for unknown versions (UserWarning)
- Clear error messages for invalid formats

---

**Phase 5 Success Criteria (All Completed)**: 
✅ Users can export any build to .knx file and re-import it with exact same state
✅ Round-trip test passes: PartInstances and connections match after import
✅ Export/import works reliably for builds up to 200 parts in <5 seconds
✅ Malformed files show clear error messages without crashing the app
✅ Legacy v0.9 formats automatically migrated to v1.0
✅ Comprehensive validation catches invalid data before processing

**Phase 5 Status**: ✅ COMPLETE - All tasks finished and tested

---

## Phase 6 — Public Web Deployment (In-Browser First, Free Tier)

**Architecture decision**: Move physics simulation from the Python/PyBullet backend
into the browser using Rapier.js (WASM). This eliminates the need for a persistent
backend server, removes WebSocket latency, and lets the entire app run on free-tier
static hosting. The same TypeScript physics module can later be reused server-side
(via Node/Bun) for the AI training pipeline.

### ✅ Task 6.1: Client-Side Physics with Rapier.js
- **Complete**: Created `frontend/src/services/rapierSimulator.ts` — full Rapier.js (WASM) simulator
- **Joint system**: Uses Rapier's native `FixedImpulseJoint` and `RevoluteImpulseJoint` instead of
  PyBullet's multi-P2P-constraint workaround. This eliminates the torque-vs-constraint-force
  imbalance from Task 3.10 entirely — Rapier's unified solver handles motors and constraints together.
- **Motor support**: Uses `RevoluteImpulseJoint.configureMotorVelocity()` for motor-driven joints,
  replacing manual `applyExternalTorque()` calls. Cleaner, more stable, and easier to tune.
- **Tuning carried over**: Linear/angular damping=0.3, zero gravity, 4 sub-steps at 1/240s (60fps).
  Sensor colliders for mass/inertia computation, no inter-body collisions.
- **Simulation loop**: Runs via `requestAnimationFrame` on the main thread. Writes transforms to
  the same `simulationTransforms` Map that `PartMesh.tsx` reads in `useFrame`. No WebSocket needed.
- **Updated `simulationManager.ts`**: Replaced WebSocket/sidecar-based simulation with direct Rapier
  calls. Same public API (`startSimulation`, `stopSimulation`, `updateMotorSpeed`).
  Diagnostics (`SimOrientationDiagnostics`) continue to work unchanged.
- **Python physics preserved**: `src/core/physics/pybullet.py` kept for headless AI pipeline use.
- **Tests**: Ported `test_connector_orientation.py` → `frontend/src/services/__tests__/rapierSimulator.test.ts`
  (4 tests: end-on clip, side-on clip, motor-driven chain, orientation diagnostics).
  All pass with 0.00° orientation delta — Rapier's native joints produce zero phantom drift.

### ✅ Task 6.2: Static Hosting & CDN
- **Complete**: Configured deployment setup for Vite/React app as a fully static site.
- **Complete**: Added `wrangler.toml` to automate Cloudflare Pages (Git integration) build configuration (`npm run build`, `dist/`).
- **Complete**: Fixed TypeScript build errors to ensure CI passes successfully.
- **Complete**: Configured SPA routing via `_redirects` for Cloudflare Pages.
- **Complete**: Ensured GLB assets and `dataset.jsonl` are seamlessly copied to `dist/` by Vite plugin during build to serve from CDN.

### ✅ Task 6.3: User Authentication & Profiles
- **Complete**: Integrated Supabase Auth with custom `AuthModal` and `userStore`.
- Supports email/password login and session persistence.
- Auto-initializes session on app mount.

### ✅ Task 6.4: Cloud Persistence (Supabase DB + Storage)
- **Complete**: Implemented cloud model CRUD in `cloudModels.ts`.
- **Database**: Models stored in Supabase PostgreSQL with metadata.
- **Security**: Row Level Security (RLS) enforced via `auth.uid() = user_id`.
- **UI**: Added 'Cloud Save' button in BuildMenu and 'Cloud Sync' section in MyModels.

### [ ] Task 6.5: Community Gallery & User Dashboard
- **Goal**: Allow users to share and discover builds.
- **My Models page**: List user's saved/WIP projects with thumbnail grid.
- **Explore page**: Public gallery with search, category filters, sort by likes/recent.
- **3D preview**: Inline `<KnexViewer>` component for hovering over gallery cards.
- **API**: Paginated queries via Supabase client SDK with RLS (no custom backend needed).

### [ ] Task 6.6: Admin & Moderation
- **Goal**: Basic content moderation tools.
- **Role system**: `is_admin` flag on users table, enforced via RLS policies.
- **Admin UI**: Feature/unfeature models, delete inappropriate content, view reports.
- **Lightweight**: No separate admin backend — just guarded UI routes + RLS.

---

**Phase 6 Free-Tier Stack Summary**:
| Component | Service | Free Tier Limit |
|---|---|---|
| Frontend + physics (WASM) | Cloudflare Pages | Unlimited bandwidth, 500 builds/mo |
| API (CRUD, presigned URLs) | Cloudflare Workers | 100k requests/day |
| Auth | Supabase Auth | 50k MAU |
| Database | Neon PostgreSQL | 512MB, autoscale-to-zero |
| File storage (.knx, thumbs) | Cloudflare R2 | 10GB, zero egress |
| Domain | `*.pages.dev` free | Custom: ~$10/yr |

**Phase 6 Success Criteria**: App is globally accessible as a static site with
client-side physics. Users can create accounts, save builds to the cloud, and
share on a public gallery — all hosted at $0/month on free tiers.

## Phase 7 — UI / UX Improvements

### ✅ Task 7.1: Advanced Canvas Interaction
- **Goal**: Implement canvas right-click context menu
- **Features**: Delete, duplicate, focus camera, change color
- **Files**: `frontend/src/components/Viewer/SceneInteraction.tsx`

### ✅ Task 7.2: Quick Duplication
- **Goal**: Add `Ctrl+D` and `Alt+Click` to quickly duplicate the selected part
- **Files**: `frontend/src/components/Viewer/SceneInteraction.tsx` and keyboard hooks.

### ✅ Task 7.3: Selection Highlighting
- **Goal**: Use 3D outlines/glow to make the selected part pop clearly
- **Files**: `frontend/src/components/Viewer/PartMesh.tsx`, `InstancedParts.tsx`

### ✅ Task 7.4: Camera Focusing
- **Goal**: Press `F` to focus camera on the currently selected part
- **Files**: `frontend/src/components/Viewer/KnexViewer.tsx` or new `CameraRig.tsx`

### ✅ Task 7.5: Keyboard Shortcuts for Parts
- **Goal**: 1-9 for rods, q-p for connectors
- **Files**: Keyboard shortcuts hook


## Phase 8 — Local-First Storage (Browser)

### ✅ Task 8.1: Local Storage Service
- **Goal**: Persist models to `localStorage` for offline play
- **Features**: Save, load, list, and delete models
- **Files**: `frontend/src/services/localModels.ts`

### ✅ Task 8.2: App State Updates
- **Goal**: Track current model ID and Title in BuildStore
- **Files**: `frontend/src/stores/buildStore.ts`

### ✅ Task 8.3: My Models Tab
- **Goal**: UI to browse and manage local models
- **Files**: `frontend/src/components/MyModels.tsx`, `App.tsx`

### ✅ Task 8.4: Auto-Save & Top Bar UI
- **Goal**: Name the current model and save automatically or on-click
- **Files**: `frontend/src/App.tsx`

## Phase 9 — Port Indicator & Snap Fixes

### ✅ Task 9.1: Tab Cycling Uses Both Placing and Target Angles
- **Root cause**: Only `targetPort.allowed_angles_deg` was used in the angle loop.
  Rod end ports have `[0]`, so placing a connector on a rod end only tried 1 angle per port,
  missing most connector orientations.
- **Fix**: Pick the longer of `placingAngles` vs `targetAngles` so all rotations are available.
- **Files**: `PortIndicators.tsx`, `portIndicatorSim.test.ts`

### ✅ Task 9.3: Port & Rotation Picker HUD
- **Goal**: Better UX for selecting which connector port and rotation to use when attaching to a rod
- **Problem**: Old Tab cycling went through ALL port×angle combos in a flat list — confusing for multi-port connectors
- **Fix**: Two-axis control separating port selection from rotation:
  - **Tab** cycles which connector port connects (A → B → C → center)
  - **R** cycles rotation angle within the current port (0° → 90° → 180° → 270°)
- **HUD**: `SnapVariantHUD.tsx` — floating overlay at viewport bottom showing current port name, rotation angle, counts, and keyboard hints
- **Store**: Replaced `activeSnapVariantIndex` with `activePortIndex` + `activeAngleIndex` in `interactionStore.ts`
- **PortIndicators**: Restructured variants into port groups (grouped by `placingPortId`) with per-group angle sorting
- **Tests**: Updated `tabCycling.test.ts` with 6 tests covering port cycling, angle cycling, index resets

### ✅ Task 9.2: PortIndicator Spheres Inside Connector Meshes
- **Root cause**: Part mesh `handlePointerOver` called `e.stopPropagation()`, blocking
  PortIndicator spheres at connector centers (slot ports, center ports at `[0,0,0]`) from
  receiving pointer events. The R3F raycast hits the connector surface first.
- **Fix**: In place mode, skip `stopPropagation` on part meshes. A nearest-hit guard
  prevents farther parts from overriding `matchTargetId`. Indicator spheres behind the
  mesh now receive events. Select mode behavior unchanged.
## Phase 10 — Gravity & Realistic Stability

### ✅ Task 10.1: Gravity in Rapier.js
- **Complete**: Enabled Earth gravity (-9810 mm/s²) in `rapierSimulator.ts`.
- Tuned damping (0.5) for structural stability under load.

### ✅ Task 10.2: Ground Plane & Contact Forces
- **Complete**: Added static ground collider at Y=0.
- Switched parts to real colliders with collision groups to enable ground contact while ignoring inter-part collisions.

### ✅ Task 10.3: Static Anchoring / "Pinned" Parts
- **Complete**: Added `is_pinned` property to `PartInstance`.
- Implemented `togglePinPart` in `BuildStore` with undo/redo support.
- Added **ContextMenu** (right-click) with "Pin to World" functionality.
- Physics: Pinned parts are treated as `fixed` rigid bodies.

### ✅ Task 10.4: Gravity-Aware Stability Score
- **Complete**: Implemented `checkStability` in `RapierSimulator` (120-step displacement check).
- **UI**: Added "Test Physics" button in the Top Bar (Stability Indicator).
- Integrates with `stressData` to highlight parts that collapsed.

---

## Phase 10 UX Follow-ups: Ground Visuals & Shadows

### Task 10.5: More Obvious Ground Plane
- Enlarge ground plane to always be visible in viewport
- Change ground color to light gray (or configurable in settings)
- Add grid lines or checkerboard texture for visual reference/scale
- Optionally add "thickness" (extruded slab or edge highlight) for depth separation

### Task 10.6: Real-Time Shadows
- Enable shadow casting/receiving for all part meshes and ground in R3F scene
- Add `<ambientLight>` for basic fill, `<directionalLight castShadow={true}>` for primary sunlight effect
- Make sure all part meshes have `castShadow={true}` and ground has `receiveShadow={true}`
- Tune shadow map size/resolution for performance
- Verify Three.js mesh transforms sync with Rapier physics so shadows remain accurate

### Task 10.7: "Touching Ground" Feedback
- Add highlight or "pulse" effect when parts land on the ground (optional, improves affordance)
- Lift parts slightly above ground on spawn to avoid z-fighting/clipping
- Consider context HUD/note for ground contact during stability check or "Test Physics"

### Documentation:
- List all new visual/UX tasks under a single "Phase 10 Visual Grounding/Feedback" section for the next PR

---

## Phase 11 — Position-Agnostic Topology Format (Core Foundation)

**Why**: VLMs are weak at precise 3D math (absolute positions + quaternions), but strong at symbolic structure. This phase defines a topology-only representation and deterministic solver path so AI output can still become a valid 3D build.

### [~] Task 11.1: Define `topology-v1` Schema (No Positions/Rotations)
- New schema doc: `docs/topology-format.md` and JSON schema in `schema/`.
- Required fields: `parts[]`, `connections[]`, `format_version`, optional `metadata`.
- Explicitly forbidden in this format: absolute `position`, `quaternion`, free-form transforms.
- Define ID/port conventions, joint types (`fixed`, `revolute`), and validation constraints.
- Add migration notes from/to existing `.knx` export format.
- **Status (2026-03-03)**: Browser-first TypeScript contract implemented in `frontend/src/services/topologySolver.ts`; formal schema docs/JSON Schema still pending.

### [x] Task 11.2: Canonicalization Rules
- Deterministic ordering for parts/connections so equivalent graphs serialize identically.
- Deterministic instance ID strategy for generated builds (no random IDs in saved artifacts).
- Add normalization helpers for stable diffs, dataset quality, and reproducible training targets.
- **Implemented**: `canonicalizeTopology()` + deterministic component/root traversal in browser runtime.

### [x] Task 11.3: Topology Validator
- Implement validator in `src/core/` for:
  - Unknown part IDs/ports
  - Duplicate instance IDs
  - Invalid or duplicate connections
  - Self-connections and impossible joint declarations
- Return structured, user-facing diagnostics (line/item references where possible).
- Unit tests in `src/core/tests/` for valid + invalid graph cases.
- **Implemented (browser-first)**: Structured validation in `frontend/src/services/topologySolver.ts` with `TopologyValidationError` issues and Vitest coverage.

### [x] Task 11.4: Topology-to-Geometry Solver (Importer)
- Implement deterministic placement traversal from a root part/component.
- Place new parts by snapping ports using existing core snapping logic.
- Support disconnected components with explicit anchoring strategy.
- Add failure modes when graph cannot be embedded without violating constraints.
- **Implemented (browser-first)**: Deterministic topology solve in `solveTopology()` with root anchoring and disconnected-component spacing.

### [x] Task 11.5: Closed-Loop Constraint Handling
- Track already-placed parts during traversal.
- For loop-closing edges, verify residual port error is within tolerance (instead of re-placing).
- Define tolerance thresholds and conflict policy (accept, warn, reject).
- Add square/triangle/multi-loop regression tests.
- **Implemented (browser-first)**: Loop residual checks + `TopologySolveError` on constraint violations; covered in `frontend/src/services/__tests__/topologySolver.test.ts`.

### [ ] Task 11.6: Round-Trip and Compatibility Tests
- Round-trip: `.knx` → `topology-v1` → solved build → `.knx`.
- Assert piece counts, connection graph equivalence, and acceptable transform drift.
- Add fixtures for simple, branched, and loop-heavy builds.
- **Status (2026-03-03)**: Initial conversion helper `buildStateToTopology()` implemented; full `.knx` compatibility and migration tests still pending.

---

## Phase 12 — Shorthand Authoring, UX, and AI Integration

**Note on scope**: Keep this separate from Phase 11. Phase 11 is core format/solver correctness; Phase 12 is text UX + parser ergonomics + ML-facing workflow built on top of that foundation.

### [~] Task 12.1: Implement Shorthand Grammar + Parser (Core)
- Create parser in `src/core/shorthand_parser.py` (core-first, no frontend-only parser).
- Grammar supports Graphviz-style edges (e.g., `rc3_1.A -- gr_1.end1`, `~~` for revolute).
- Parser outputs `topology-v1` structure only (no transforms).
- Include strict error reporting: invalid syntax, unknown symbols, ambiguous tokens, duplicate declarations.
- **Status (2026-03-03)**: Frontend compact parser/formatter implemented in `frontend/src/services/topologyCompactFormat.ts` and wired into live editor. Core Python parser remains pending.

### [ ] Task 12.2: Shorthand Lint + Auto-Fix Utilities
- Add optional canonical formatter for shorthand (stable whitespace/order).
- Add lints for common mistakes (missing ports, unsupported part aliases, disconnected fragments).
- CLI utility for offline validation and CI (`python -m ...` style).

### [~] Task 12.3: Live Shorthand Editor + 3D Preview (Frontend)
- Add editor panel with parse-on-change preview.
- Show parser/validator errors inline with actionable hints.
- Debounced solving for performance; preserve last valid state on parse failure.
- Keep hybrid workflow: text edit + visual tweak in viewer.
- **Status (2026-03-03)**: Browser-side live `topology-v1` JSON editor panel implemented (`frontend/src/components/TopologyEditor.tsx`) with debounced solve, inline validation, and live scene updates. Shorthand grammar/syntax-highlighting remains pending.

### [ ] Task 12.4: Import/Export and Cross-Format Sync
- Add shorthand + `topology-v1` import/export in `BuildMenu` flows.
- Ensure stable mapping for part aliases, instance IDs, and ports.
- Add explicit conversion paths:
  - `.knx` → `topology-v1`
  - shorthand ↔ `topology-v1`
  - shorthand/topology → solved scene

### [ ] Task 12.5: AI Endpoint Contract
- Define single inference contract: prompt + image(s) → shorthand text.
- Add post-processing chain: shorthand parse → topology validate → solve/render.
- Add fallback behavior for invalid model output (show diagnostics, keep editor editable).

### [ ] Task 12.6: User Docs and Examples
- Add docs for shorthand syntax, joint operators, naming conventions, and troubleshooting.
- Provide example library: rectangle, triangle, motor chain, and closed-loop examples.

---

## Phase 4 — Scan-to-Build Computer Vision Pipeline (ML Update)

### Amendments (Apple Silicon/MLX + Topology/Shorthand Target)

### [ ] Task 4.7: Dataset Builder for MLX LoRA
- Implement `tools/shorthand_dataset_builder.py` to bundle image + shorthand pairs into `train.jsonl`/`val.jsonl`.
- Validate file existence, parseability, and canonical formatting before writing dataset rows.
- Emit dataset QA report (invalid rows, class coverage, loop/non-loop ratios).

### [ ] Task 4.8: Training Recipe and Reproducibility
- Document MLX LoRA baseline config in `ai/scan-to-build/README.md` (model, batch size, iters, prompt template).
- Save run configs + metrics for reproducibility (seed, adapter path, eval snapshot).
- Establish minimum dataset split policy (train/val/test) and leakage checks.

### [ ] Task 4.9: Evaluation Harness
- Add automated eval script for held-out sketches:
  - Parse success rate
  - Topology validity rate
  - Connection precision/recall (or graph edit distance)
  - End-to-end solve success rate
- Track baseline vs fine-tuned checkpoints.

### [ ] Task 4.10: Inference Post-Processing and Safety Rails
- Always run parser + validator + solver checks before rendering AI output.
- If output is invalid, return actionable errors and partial recovery suggestions.
- Add regression tests for malformed/near-valid shorthand generations.

### Updated Success Criteria
- Given sketch images, VLM outputs parseable shorthand/topology in ≥80% of held-out cases.
- End-to-end pipeline (sketch → VLM → shorthand → topology → solved 3D model) succeeds in ≥70% of held-out cases.
- All accepted predictions pass parser + topology validator with zero hard errors.

---
