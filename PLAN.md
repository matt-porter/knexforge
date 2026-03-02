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

### [ ] Task 6.3: User Authentication & Profiles
- **Goal**: Secure user sign-up, login, and profile management.
- **Provider**: Supabase (Auth + PostgreSQL).
- **Features**: Social logins, session persistence, and a `users` table for basic profile data (username, avatar).

### [ ] Task 6.4: Cloud Persistence (Supabase DB + Storage)
- **Goal**: Move from local-only storage to cloud-synced models.
- **Database**: Supabase PostgreSQL for model metadata (title, piece count, stability).
- **Storage**: Supabase Storage (S3) for `.knx` file payloads and thumbnails.
- **Security**: Implement Row Level Security (RLS) policies to ensure users can only edit their own builds while allowing public read access for the gallery.

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

### [ ] Task 10.1: Gravity in Rapier.js
- **Goal**: Enable realistic downward force in the client-side simulation.
- **Files**: `frontend/src/services/rapierSimulator.ts`
- Replace `zero gravity` with standard earth gravity (-9.81 m/s² on Z or Y axis depending on scene up-vector).
- Tune damping and friction to prevent parts from sliding endlessly or jittering.

### [ ] Task 10.2: Ground Plane & Contact Forces
- **Goal**: Prevent parts from falling into the void.
- **Files**: `frontend/src/services/rapierSimulator.ts`, `frontend/src/components/Viewer/KnexViewer.tsx`
- Add an infinite static ground collider at Z=0 (or Y=0).
- Enable contact forces between parts and the ground (requires switching from sensors to real colliders for non-jointed parts).

### [ ] Task 10.3: Static Anchoring / "Pinned" Parts
- **Goal**: Allow builds to be supported by something other than the ground.
- **UI**: Add a "Pin to World" toggle in the part context menu.
- **Simulation**: Set pinned parts to `fixed` rigid body type so they act as anchors for the rest of the structure.

### [ ] Task 10.4: Gravity-Aware Stability Score
- **Goal**: Use gravity to detect structural weaknesses.
- **Algorithm**: If a structure collapses under its own weight during simulation, reduce the stability score.
- **Visualization**: Highlight parts that experience the most stress from gravitational load.

---
