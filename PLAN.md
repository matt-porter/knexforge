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
