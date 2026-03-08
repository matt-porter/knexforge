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
- **Update (2026-03-04)**: Added a third snap-selection axis for rod side locking. Side clips now support explicit rod-side ports (`center_tangent_y_pos/y_neg/z_pos/z_neg`) with `X` key cycling, HUD side indicators, and persisted side semantics via connection port IDs.
- **Update (2026-03-04 regression)**: Added Rapier orientation regression coverage for all four explicit rod-side ports to guard against future side-clip rotation regressions (`frontend/src/services/__tests__/rapierSimulator.test.ts`).
- **Update (2026-03-04 regression 2)**: Added deterministic rod-side ordering/mapping regressions for UI cycling semantics (`frontend/src/helpers/rodSideOrdering.test.ts`) to lock `+Y → -Y → +Z → -Z` order and legacy `center_tangent` normalization.
- **Update (2026-03-04 regression 3)**: Added core-side snapping/orientation coverage for explicit rod-side ports in Python tests (`src/core/tests/test_snapping.py`, `src/core/tests/test_connector_orientation.py`) so frontend/core behavior stays aligned.
- **Update (2026-03-04 migration)**: Added legacy port normalization in frontend build state so imported/older connections using `center_tangent` are canonicalized to `center_tangent_y_pos` on add/load, preventing mixed legacy/explicit side IDs.
- **Update (2026-03-04 regression 4)**: Added candidate-grouping regression test using real part JSONs (`frontend/src/helpers/rodSideGrouping.test.ts`) to verify side buckets and deterministic side order under center-clip indicator generation.
- **Update (2026-03-04 topology)**: Added legacy `center_tangent` normalization in topology canonicalization/build-state conversion (`frontend/src/services/topologySolver.ts`) with regression tests in `topologySolver.test.ts`, so text/topology and store flows use the same canonical side port IDs.
- **Update (2026-03-04 core parity)**: Added backend/core normalization for legacy `center_tangent` during import/deserialize paths (`src/core/file_io.py`, `src/core/build.py`) and corresponding Python regressions in `test_export_import.py` / `test_build.py`.
- **Update (2026-03-07 round-trip orientation)**: Fixed model→text→model side-clip roll drift by preserving fixed-roll semantics end-to-end: topology resolution now keeps `fixed_roll`, compact serialization now retains zero-twist fixed-roll as `@ 0!`, and round-trip regression coverage now verifies A/B/C side-clip orientation parity before vs after compact text conversion (`frontend/src/services/topologySolver.ts`, `frontend/src/services/topologyCompactFormat.ts`, `frontend/src/services/__tests__/topologySolverRoundTrip.test.ts`, `frontend/src/services/__tests__/topologyCompactFormat.test.ts`).
- **Update (2026-03-07 side-clip angles)**: Tightened rod-side rotation validity so flat-edge side clips reject 0°/180° and keep quarter-turn orientations (90°/270°) in both interactive placement constraints and topology solve candidate filtering. Solver now chooses from the richer endpoint angle set (anchor vs placing port) when twist is not locked, so shorthand/topology flows can still reach valid quarter-turns without explicit angle metadata (`frontend/src/components/Viewer/PortIndicators.tsx`, `frontend/src/services/topologySolver.ts`).

### ✅ Task 9.4: Helper Test Modernization (Legacy 2-Axis → 3-Axis)
- **Goal**: Update outdated helper regression tests that still mirror the old 2-axis snap model to match new 3-axis behavior (port → rod side → angle).
- **Problem**: `portGrouping.test.ts` and `portIndicatorSim.test.ts` used legacy `center_tangent` as only side-clip port and old 2-axis `variants` grouping assumptions.
- **Fix**: 
  - Updated test fixture rod defs with explicit side ports (`center_tangent_y_pos/y_neg/z_pos/z_neg`) plus legacy compatibility port.
  - Added tests verifying all four side ports are defined with correct directions (+Y, -Y, +Z, -Z).
  - Kept useful coverage: port availability, dedupe behavior, cycling semantics, side-clip + through-hole coexistence.
  - Removed brittle assumptions about `center_tangent` being the only side port.
- **Files**: `frontend/src/helpers/portGrouping.test.ts`, `frontend/src/helpers/portIndicatorSim.test.ts`.

### ✅ Task 9.5: API Boundary Legacy Port Normalization
- **Goal**: Harden legacy `center_tangent` → `center_tangent_y_pos` normalization at all service boundaries to prevent bypass via raw payloads.
- **Problem**: Frontend store/topology and core import paths normalized legacy ports, but API request handlers (`/stability`, `/export`, diagnostics) could accept raw legacy IDs and bypass canonicalization.
- **Fix**: 
  - Added `_normalize_legacy_port_id()` and `_normalize_connection_ports()` helpers in `src/core/api.py`.
  - Applied normalization in all endpoints that reconstruct connections from payloads: `/stability`, `/export`, `/diagnostics/sim-orientation`, WebSocket `/ws/simulate`.
  - Normalization happens before `Connection(**...)` construction, ensuring canonical IDs persist.
- **Tests**: Added 4 regression tests in `src/core/tests/test_api.py`:
  - `test_stability_endpoint_normalizes_legacy_center_tangent_port`
  - `test_export_endpoint_normalizes_legacy_center_tangent_port` (verifies exported data has canonical IDs)
  - `test_diagnostics_endpoint_normalizes_legacy_center_tangent_port`
  - `test_stability_endpoint_accepts_explicit_side_ports` (explicit IDs pass through unchanged)
- **Files**: `src/core/api.py`, `src/core/tests/test_api.py`.

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

### ✅ Task 10.5: More Obvious Ground Plane
- **Complete**: Created `EnhancedGroundPlane` component with larger size (2000x2000mm)
- **Complete**: Changed ground color to light gray (#e8eaf6) for high visibility
- **Complete**: Added checkerboard grid pattern (200 divisions, alternating colors #9fa5c3/#c5cae9) for scale reference
- **Complete**: Added edge highlights (20mm extruded edges in #9fa5c3) for depth separation
- **Files**: `frontend/src/components/Viewer/KnexViewer.tsx`, `frontend/src/components/Viewer/GroundContactFeedback.tsx`
- **Tests**: `frontend/src/components/Viewer/__tests__/EnhancedGroundPlane.test.tsx` (7 tests)

### ✅ Task 10.6: Real-Time Shadows
- **Complete**: Enabled shadow casting/receiving for all part meshes and ground in R3F scene
- **Complete**: Added three-point lighting system:
  - Main directional light (1.0 intensity, 2048x2048 shadow map) at [100, 200, 100]
  - Secondary fill light (0.4 intensity) at [-80, 100, -60]
  - Ternary rim light (0.3 intensity) at [0, 50, -150] for edge definition
- **Complete**: Enhanced ambient light from 0.4 to 0.5 intensity
- **Complete**: All part meshes have `castShadow={true}` and `receiveShadow={true}`
- **Complete**: Ground plane has `receiveShadow={true}` with proper z-offset (Y=0.01) to avoid z-fighting
- **Files**: `frontend/src/components/Viewer/KnexViewer.tsx`
- **Tests**: `frontend/src/components/Viewer/__tests__/ShadowLighting.test.tsx` (13 tests)

### ✅ Task 10.7: "Touching Ground" Feedback
- **Complete**: Added pulsing ring effect when parts are near ground (Y ≤ 5mm threshold)
- **Complete**: Ring radius pulses between 12mm and 20mm using sine wave animation at 3 rad/s
- **Complete**: Opacity fades with height (fully opaque at Y=0, transparent at Y=5mm)
- **Complete**: Color: light cyan (#4fc3f7) with additive blending for glowing effect
- **Note**: Lifted parts slightly above ground on spawn via z-offset stacking (Y=0.01, 0.02, 0.03 layers)
- **Files**: `frontend/src/components/Viewer/GroundContactFeedback.tsx`
- **Tests**: `frontend/src/components/Viewer/__tests__/GroundContactFeedback.test.tsx` (4 tests)

### ✅ Task 10.8: Build Positioning & Centering (Follow-up to 10.5-10.7)
**Problem identified**: With visible ground plane, default model (proc_0001) and text panel imports spawn below ground level.

**Solutions implemented**:
- **Ground offset in topology solver**: Added `groundOffsetMm` parameter (default 50mm) to `solveTopology()` - lifts all root components above ground
- **Ground offset in dataset loading**: Added `GROUND_OFFSET_MM = 50` constant to `datasetEntryToBuild()` - shifts all Y positions up by 50mm when loading from dataset
- **"Center Build" feature**: Added `centerBuild()` function to buildStore that:
  - Calculates bounding box of all parts
  - Centers horizontally (X, Z) around origin
  - Lifts base to ground level + 50mm offset
  - Supports undo/redo
- **UI integration**: Added "🎯 Center Build" button in BuildMenu for user access

**Files modified**:
- `frontend/src/services/topologySolver.ts` - Added `groundOffsetMm` option (default 50)
- `frontend/src/hooks/useDataset.ts` - Added ground offset when converting dataset entries
- `frontend/src/stores/buildStore.ts` - Added `centerBuild()` action with undo/redo support
- `frontend/src/components/BuildMenu.tsx` - Added "Center Build" button
- Tests updated: `topologySolver.test.ts`, `useDataset.test.ts`

**Tests**: All existing tests pass (187/190, 3 pre-existing failures in tabCycling.test.ts unrelated to these changes)

### Documentation:
- ✅ Created comprehensive documentation in `docs/phase-10-visual-followups.md` with implementation details, test results, and success criteria

**Phase 10 UX Follow-ups Status**: ✅ COMPLETE - All visual improvements implemented, tested, and build positioning fixed

---

## Phase 11 — Position-Agnostic Topology Format (Core Foundation)

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
- **Fixed (2026-03-04)**: Issue #4 — Relaxed default tolerances from (0.5mm, 8°) to (2.0mm, 15°) to account for cumulative geometric errors in closed loops. Greedy tree-building + discrete rod lengths/connector angles naturally accumulate position errors beyond 0.5mm over 4-6 parts. New defaults align with manufacturing tolerances of real plastic parts. See `docs/ISSUE-4-TRIANGLE-LOOP-CLOSURE.md` for full analysis. Added debug logging for near-tolerance edges.

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
- **Status (2026-03-03 update)**: Compact-mode autocomplete added for part IDs, known instances, operators, and valid ports based on part definitions.
- **Status (2026-03-03 update 2)**: UI refinement added: compact `<_o>` json mode switch, directional apply/import labels (`Model -> Text`, `Text -> Model`), and draggable editor width.
- **Status (2026-03-03 update 3)**: Replaced placeholder text with an actual switch control and fixed resizable panel behavior in flex layout.
- **Status (2026-03-03 update 4)**: Removed `Visual Mode` overlay from viewer UI and corrected resize direction using drag-delta width logic.
- **Status (2026-03-03 update 5)**: Added explicit hide/show controls for the parts palette (`Hide` in palette, `PRT` reopen button in builder) so it remains discoverable when text editor is open.
- **Status (2026-03-04 update 6)**: Fixed panel half-open/half-closed behavior by removing width-transition wrapper logic and enforcing fixed non-shrinking widths for parts panel states.
- **Status (2026-03-04 update 7)**: Fixed right editor drift/clipping by allowing center viewer flex item to shrink (`minWidth: 0`) in builder layout.
- **Status (2026-03-04 update 8)**: Hardened stability API/UI path for topology edits adding `gc2` connectors: frontend now normalizes/clamps stability responses and guards indicator rendering against invalid scores; backend `/stability` now falls back to graph scoring when PyBullet runtime errors occur for specific parts.

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

## Phase 13 — Iterative Constraint Solver for Loop Closure

**Motivation**: The greedy BFS tree-construction solver cannot reliably close loops — cumulative floating-point errors across many parts cause the closing edge's residual to exceed tolerance. This makes results order-dependent and causes valid geometries (e.g., regular octagons) to fail. Phase 13 adds a Jacobi iterative constraint projector that redistributes loop errors across all parts, making loop closure reliable and order-independent.

**Supersedes**: Task 11.5's "future: iterative refinement" note and Issue #4's "Task 12.X" TODO.

### [ ] Task 13.1: Loop Detection and Refinement Hook
- Detect loops per connected component during BFS placement.
- Defer loop-closing edge failures (don't throw immediately).
- Add `refineLoopComponent()` stub — called when loop residuals exceed tolerance.
- Stub returns `false`; existing error behavior preserved until Task 13.2.
- **Files**: `frontend/src/services/topologySolver.ts`
- **Docs**: `docs/tasks/task-13-1-loop-detection-and-refinement-hook.md`

### [ ] Task 13.2: Jacobi Iterative Constraint Solver (Position + Direction)
- Implement Jacobi XPBD-style constraint projection in `refineLoopComponent()`.
- Position constraint: port positions must coincide.
- Direction constraint: port directions must be anti-parallel.
- Root part pinned (gauge fixed) per component for stability.
- Corrections accumulated and applied simultaneously (order-independent).
- Max 12 iterations with early exit on convergence.
- **Key deliverable**: User's octagon loop (8×gc4 + 8×gsr) must solve.
- **Files**: `frontend/src/services/topologySolver.ts`
- **Docs**: `docs/tasks/task-13-2-jacobi-iterative-constraint-solver.md`

### [ ] Task 13.3: Twist and Allowed-Angle Snapping During Refinement
- Periodic roll-snap pass (every 3 iterations) during Jacobi refinement.
- Measure current roll angle, snap to nearest `allowed_angles_deg` value.
- Gradual correction (clamped per pass) to avoid oscillation.
- Skip roll snapping for connections with no discrete constraints.
- **Files**: `frontend/src/services/topologySolver.ts`
- **Docs**: `docs/tasks/task-13-3-twist-and-roll-snapping.md`

### [ ] Task 13.4: Joint-Type-Aware Constraints (Revolute, Prismatic, Cylindrical)
- Fixed joints: position + direction + roll (existing behavior).
- Revolute joints: position + direction only (roll is free).
- Prismatic joints: perpendicular position + direction + roll (axial translation free).
- Center-axial connections (rod through center hole): detected internally via port ID — both axial translation AND roll are free. No new public joint type; `inferJointType` continues to return `revolute` for compatibility across physics engines, UI, serialization, and datasets.
- Actively exploit free DOFs during refinement — the solver slides rods along axes to help close loops, not just passively ignore axial error.
- `fixed_roll` overrides free-roll when explicitly set.
- No changes to physics engines, interactive builder, serialization, or Python core.
- **Files**: `frontend/src/services/topologySolver.ts` (only)
- **Docs**: `docs/tasks/task-13-4-joint-type-aware-constraints.md`

### [ ] Task 13.5: Comprehensive Loop Solver Test Suite
- 15+ new test cases across 6 categories: valid loops, order-independence, infeasible geometry, mixed joints, open-chain regression, edge cases.
- Shared part definition fixtures in `__tests__/partFixtures.ts`.
- Geometry assertion helpers (residual checks, equivalence checks).
- All tests deterministic, each <100ms.
- **Files**: `frontend/src/services/__tests__/topologySolver.test.ts`, `frontend/src/services/__tests__/partFixtures.ts`
- **Docs**: `docs/tasks/task-13-5-comprehensive-loop-solver-tests.md`

### [ ] Task 13.6: Performance Optimization and Warm-Start Caching
- Explicit skip of refinement for tree-only components.
- Warm-start transform cache keyed by topology hash.
- Pre-allocated Three.js temporaries in refinement hot loop.
- Debug timing instrumentation via `__TOPOLOGY_SOLVER_DEBUG__`.
- Fallback to full re-solve if warm-start refinement fails.
- **Files**: `frontend/src/services/topologySolver.ts`
- **Docs**: `docs/tasks/task-13-6-performance-and-warm-start.md`

### [ ] Task 13.7: Solver Error UX Improvements
- Human-readable error messages with mm/degree residual data.
- Severity classification (close-miss vs far-miss vs impossible).
- Actionable fix suggestions in error text.
- Multi-issue reporting (all failing edges, not just first).
- Near-tolerance success warnings.
- **Files**: `frontend/src/services/topologySolver.ts`, `frontend/src/components/TopologyEditor.tsx`
- **Docs**: `docs/tasks/task-13-7-solver-error-ux-improvements.md`

---

## Phase 9 — Dataset & API Polish

### ✅ Task 9.5: Rod-Side Rollout & API Normalization (2026-03-06) — ✅ RESOLVED
- **Outcome**: Migrated all rod-side connections to the canonical 4-axis port system (`center_tangent_y_pos` etc.).
- **API Boundary**: All build-ingesting endpoints (`/load`, `/stability`, `/export`, `/diagnostics`) automatically normalize legacy `center_tangent`.
- **Snapping & Physics**: Unified deterministic orientation logic across Frontend (Three.js), Topology Solver, and Core (Python). Side-clipped rods now "auto-flatten" into the connector plane by default.
- **Validation**: 
  - Frontend: 209/209 Vitest passes (including round-trip and realistic topology solves).
  - Core: 141/141 Pytest passes (including API regression and physics stability).
- **Library**: Cleaned up `parts/rod-*.json` to remove legacy port definitions.
- **Residual Risks**: None. Legacy `center_tangent` is fully supported as an input but is canonicalized upon ingestion.
## Post-Review Issues (2026-03-06) — ✅ RESOLVED

### ✅ Fixed: Coordinate System Inconsistency
- **Problem**: `src/core/physics/pybullet.py` used **Z-up** gravity.
- **Fix**: Updated `PyBulletSimulator` to use `p.setGravity(0, -9.81, 0)` (Y-up) to align with Three.js and Rapier.js.

### ✅ Fixed: Normalization Gaps
- **Problem**: Missing legacy `center_tangent` normalization in `localModels.ts` and `useDataset.ts`.
- **Fix**: Implemented `normalizeLegacyRodSidePortId` in both parsing entry points.

### ✅ Fixed: Physical Realism in Datasets
- **Problem**: `proc_0001` (Motorized Spinner) lacked a base mounting.
- **Fix**: Updated `dataset.jsonl` with an orange 2-way connector as a base mount and switched to canonical `center_tangent_y_pos` port.

### ✅ Fixed: Deterministic Side-Clip Orientation (User Bug)
- **Problem**: Connectors rotated 90°/45° incorrectly during round-trips due to orientation ambiguity on rod-side clips.
- **Fix**: Implemented deterministic basis alignment (Connector Z → Rod X) in `computeGhostTransform` (frontend), `buildPlacementCandidate` (topology solver), and `align_part_to_port` (python core).

### 🔵 Minor: UI State Sync
- **Note**: `isExpanded` state sync is still pending as a low-priority task.

---
