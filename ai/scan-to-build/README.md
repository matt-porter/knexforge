# Scan-to-Build Computer Vision Pipeline

Turn photographs of real K'Nex builds into editable `.knx` files using computer vision and 3D reconstruction.

## Overview

```
Photographs → Part Detection (YOLOv8) → 3D Pose Estimation → Connection Graph → .knx File
```

## Components

| Module | Purpose | Key Class |
|--------|---------|-----------|
| `data_generator.py` | Generate synthetic training data from GLB meshes | `SyntheticDataGenerator` |
| `detector.py` | Detect K'Nex parts in photos using YOLOv8 | `KNexDetector` |
| `pose_estimator.py` | Reconstruct 3D positions from multiple views | `PoseEstimator` |
| `graph_reconstructor.py` | Infer connections from 3D poses | `GraphReconstructor` |
| `validator.py` | Validate reconstructed builds against K'Nex rules | `ScanValidator` |

## Quick Start

### 1. Install Dependencies

```bash
pip install -r ai/scan-to-build/requirements.txt
```

### 2. Generate Synthetic Training Data

```bash
python ai/scan-to-build/data_generator.py \
    --parts parts/ \
    --count 1000 \
    --output data/synthetic
```

This generates:
- `data/synthetic/images/` - 1000 images per part type
- `data/synthetic/labels/train/` - YOLO-format bounding boxes
- `data/synthetic/annotations/instances_train.json` - COCO format
- `ai/scan-to-build/yolo_train_config.yaml` - Training configuration

### 3. Train YOLOv8 Detector

```bash
# Using ultralytics CLI
yolo detect train data=ai/scan-to-build/yolo_train_config.yaml

# Or programmatically
from ultralytics import YOLO

model = YOLO('yolov8n.pt')  # Start with nano model
results = model.train(
    data='ai/scan-to-build/coco_format.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
)
```

### 4. Test the Detector

```bash
python ai/scan-to-build/detector.py \
    --model runs/detect/knex_parts_v1/weights/best.pt \
    --image photos/test_build.jpg
```

### 5. Full Pipeline (Programmatic)

```python
from ai.scan_to_build.detector import KNexDetector
from ai.scan_to_build.pose_estimator import PoseEstimator
from ai.scan_to_build.graph_reconstructor import GraphReconstructor
from ai.scan_to_build.validator import ScanValidator

# Step 1: Detect parts in multiple photos
detector = KNexDetector(model_path="runs/detect/knex_parts_v1/weights/best.pt")

photos = ["photo1.jpg", "photo2.jpg", "photo3.jpg"]
detections = [detector.detect(photo) for photo in photos]

# Step 2: Estimate 3D poses from multiple views
estimator = PoseEstimator(focal_length=800)

for i, det in enumerate(detections):
    # Estimate camera pose (simplified - would use markers or SfM in production)
    angle = i * 2 * math.pi / len(detections)
    position = (500 * math.cos(angle), 0, 500 * math.sin(angle))
    
    estimator.add_view(
        view_id=f"photo_{i}",
        camera_position=position,
        camera_rotation=(0, 0, -angle),
        detections=[{"part_id": d.part_id, "bbox": d.bbox} for d in det.detections],
    )

reconstruction = estimator.reconstruct()

# Step 3: Reconstruct connection graph
reconstructor = GraphReconstructor(parts_db_path="parts/")

# Convert reconstruction to PartInstance3D objects
parts_3d = [
    PartInstance3D(
        instance_id=f"part_{i}",
        part_type_id=p.part_id,
        position=p.position,
        orientation=p.orientation,
        ports=[],  # Will be filled from part database
    )
    for i, p in enumerate(reconstruction.parts)
]

graph = reconstructor.reconstruct_graph(parts_3d)

# Step 4: Validate the reconstruction
validator = ScanValidator(parts_db_path="parts/")
result = validator.validate_graph(graph)

if result.is_valid:
    # Step 5: Export to .knx format
    output_path = reconstructor.export_to_knx(graph, "reconstructed_build.knx")
    print(f"Successfully exported {output_path}")
else:
    report = validator.generate_report(result)
    print("Validation failed:")
    print(report)
```

## Architecture

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Photos     │ ──► │ YOLOv8       │ ──► │ 2D BBoxes   │
│ (3-10 imgs) │     │ Detector     │     │ per view    │
└─────────────┘     └──────────────┘     └─────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Pose Estimator   │
                                    │ (PnP + RANSAC)   │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ 3D Part Poses    │
                                    │ (x, y, z, quat)  │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Graph            │
                                    │ Reconstructor    │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Connection Graph │
                                    │ + Build Steps    │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  .knx File       │
                                    └──────────────────┘
```

### Key Algorithms

1. **Part Detection**: YOLOv8 trained on synthetic + real photos
2. **Pose Estimation**: PnP (Perspective-n-Point) with RANSAC for robustness
3. **Triangulation**: Linear least-squares DLT (Direct Linear Transform)
4. **Connection Inference**: Port proximity + type compatibility checking
5. **Build Ordering**: Topological sort prioritizing highly-connected anchors

## Training Data Strategy

### Synthetic Data (Phase 1)
- Render parts from existing GLB meshes with varied:
  - Camera angles (360° coverage)
  - Lighting conditions
  - Backgrounds (solid colors, gradients)
  - Image quality (blur, noise for realism)

### Real Data Collection (Phase 2)
- User-contributed photos with manual annotations
- Active learning: model requests photos for uncertain detections
- Domain adaptation: fine-tune on real photos after synthetic pre-training

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Detection mAP@0.5 | ≥95% | On synthetic data |
| Detection mAP@0.5 | ≥85% | On real photos (after domain adaptation) |
| 3D Position Error | ≤5mm | For parts within 500mm of camera |
| Connection Accuracy | ≥90% | For simple structures (<20 parts) |
| Processing Time | <30s | End-to-end for 5 photos on GPU |

## Limitations & Future Work

### Current Limitations
- Requires 3+ photos from different angles
- Struggles with occluded parts
- Assumes known camera intrinsic parameters
- Limited to parts in the database

### Future Enhancements
- [ ] Structure-from-Motion (SfM) for unknown camera poses
- [ ] Neural radiance fields (NeRF) for better occlusion handling
- [ ] Mobile app with real-time AR preview
- [ ] Semi-automatic correction UI for ambiguous connections
- [ ] Few-shot learning for new/unseen parts

## Testing

```bash
# Run individual module tests
python ai/scan-to-build/detector.py --demo
python ai/scan-to-build/pose_estimator.py --demo
python ai/scan-to-build/graph_reconstructor.py --demo
python ai/scan-to-build/validator.py --demo

# Full integration test (requires trained model)
pytest tests/test_scan_to_build.py -v
```

## Contributing

1. Add new part types to `parts/` directory
2. Generate more synthetic data with varied conditions
3. Contribute real photos for domain adaptation
4. Improve connection inference heuristics

## License

MIT - See main project LICENSE file.
