"""Scan-to-Build Computer Vision Pipeline for K'NexForge.

This package provides tools to convert photographs of real K'Nex builds
into editable .knx files using computer vision and 3D reconstruction.

Quick Start:
    from ai.scan_to_build import ScanPipeline
    
    pipeline = ScanPipeline(model_path="runs/detect/knex_parts_v1/weights/best.pt")
    result = pipeline.process_photos(["photo1.jpg", "photo2.jpg", "photo3.jpg"])
    
    if result.success:
        pipeline.export("my_build.knx")

Components:
    - data_generator: Synthetic training data generation from GLB meshes
    - detector: YOLOv8-based part detection in photographs
    - pose_estimator: Multi-view 3D pose estimation using PnP + RANSAC
    - graph_reconstructor: Connection inference from 3D poses
    - validator: Validation against K'Nex part database and rules

For detailed documentation, see README.md in this directory.
"""

from __future__ import annotations

from pathlib import Path

# Package version
__version__ = "0.1.0"
__author__ = "K'NexForge Team"

# Main pipeline class (imported below)
from .detector import KNexDetector, Detection, DetectionResult
from .pose_estimator import PoseEstimator, PartPose3D, ReconstructionResult
from .graph_reconstructor import (
    GraphReconstructor,
    PartInstance3D,
    PortConnection,
    ReconstructedGraph,
)
from .validator import ScanValidator, ValidationResult, ValidationIssue, IssueSeverity


class ScanPipeline:
    """High-level pipeline for scan-to-build conversion.

    Orchestrates detection, pose estimation, graph reconstruction, and validation
    in a single workflow.

    Example:
        pipeline = ScanPipeline(
            model_path="runs/detect/knex_parts_v1/weights/best.pt",
            parts_db_path="parts/",
        )
        
        result = pipeline.process_photos(["photo1.jpg", "photo2.jpg"])
        
        if result.success:
            pipeline.export("reconstructed.knx")
    """

    def __init__(
        self,
        model_path: str | Path,
        parts_db_path: str | Path = "parts/",
        focal_length: float = 800.0,
    ):
        """Initialize the scan-to-build pipeline.

        Args:
            model_path: Path to trained YOLOv8 weights file.
            parts_db_path: Path to K'Nex parts database directory.
            focal_length: Camera focal length in pixels (typical: 600-1200).
        """
        self.detector = KNexDetector(model_path=model_path)
        self.estimator = PoseEstimator(focal_length=focal_length)
        self.reconstructor = GraphReconstructor(parts_db_path=parts_db_path)
        self.validator = ScanValidator(parts_db_path=parts_db_path)

        self._reconstruction_result: ReconstructionResult | None = None
        self._graph_result: ReconstructedGraph | None = None
        self._validation_result: ValidationResult | None = None

    def process_photos(
        self,
        photo_paths: list[str | Path],
        camera_radius: float = 500.0,
    ) -> bool:
        """Process multiple photos and reconstruct the build.

        Args:
            photo_paths: List of paths to input photographs.
            camera_radius: Assumed distance from build center (mm).

        Returns:
            True if processing succeeded, False otherwise.
        """
        import math

        # Step 1: Detect parts in all photos
        print(f"Detecting parts in {len(photo_paths)} photos...")
        detections = [self.detector.detect(str(p)) for p in photo_paths]

        total_detections = sum(len(d.detections) for d in detections)
        print(f"Found {total_detections} total detections across all photos")

        # Step 2: Estimate camera poses and add views
        print("Estimating 3D poses...")
        
        num_photos = len(photo_paths)
        for i, det in enumerate(detections):
            # Assume photos taken in a circle around the build
            angle = i * 2 * math.pi / num_photos if num_photos > 1 else 0
            position = (camera_radius * math.cos(angle), 0, camera_radius * math.sin(angle))
            rotation = (0, 0, -angle)

            self.estimator.add_view(
                view_id=f"photo_{i}",
                camera_position=position,
                camera_rotation=rotation,
                detections=[{"part_id": d.part_id, "bbox": d.bbox} for d in det.detections],
            )

        # Step 3: Reconstruct 3D positions
        self._reconstruction_result = self.estimator.reconstruct()

        if not self._reconstruction_result.success:
            print(f"Pose estimation failed: {self._reconstruction_result.message}")
            return False

        print(f"Reconstructed {len(self._reconstruction_result.parts)} parts in 3D")

        # Step 4: Reconstruct connection graph
        print("Inferring connections...")

        parts_3d = [
            PartInstance3D(
                instance_id=f"part_{i}",
                part_type_id=p.part_id,
                position=p.position,
                orientation=p.orientation,
                ports=[],
            )
            for i, p in enumerate(self._reconstruction_result.parts)
        ]

        self._graph_result = self.reconstructor.reconstruct_graph(parts_3d)

        if not self._graph_result.success:
            print(f"Graph reconstruction failed: {self._graph_result.message}")
            return False

        print(f"Inferred {len(self._graph_result.connections)} connections")

        # Step 5: Validate
        print("Validating reconstruction...")
        self._validation_result = self.validator.validate_graph(self._graph_result)

        if not self._validation_result.is_valid:
            print(f"Validation found {len(self._validation_result.issues)} issues")
            # Don't fail on warnings, only errors
            errors = [i for i in self._validation_result.issues if i.severity == IssueSeverity.ERROR]
            if errors:
                print(f"Found {len(errors)} critical errors")
                return False

        return True

    def export(self, output_path: str | Path) -> Path:
        """Export the reconstructed build to .knx format.

        Args:
            output_path: Output file path (will add .knx extension if missing).

        Returns:
            Path to the exported file.
        """
        if self._graph_result is None:
            raise RuntimeError("No reconstruction to export. Run process_photos() first.")

        return self.reconstructor.export_to_knx(self._graph_result, output_path)

    def get_validation_report(self) -> str:
        """Get a human-readable validation report.

        Returns:
            Formatted report string.
        """
        if self._validation_result is None:
            return "No validation results available."

        return self.validator.generate_report(self._validation_result)


# Package-level convenience functions
def create_pipeline(
    model_path: str | Path,
    parts_db_path: str | Path = "parts/",
) -> ScanPipeline:
    """Factory function to create a configured pipeline.

    Args:
        model_path: Path to trained YOLOv8 weights.
        parts_db_path: Path to K'Nex parts database.

    Returns:
        Configured ScanPipeline instance.
    """
    return ScanPipeline(
        model_path=model_path,
        parts_db_path=parts_db_path,
    )


__all__ = [
    # Main pipeline
    "ScanPipeline",
    "create_pipeline",
    # Detector
    "KNexDetector",
    "Detection",
    "DetectionResult",
    # Pose estimation
    "PoseEstimator",
    "PartPose3D",
    "ReconstructionResult",
    # Graph reconstruction
    "GraphReconstructor",
    "PartInstance3D",
    "PortConnection",
    "ReconstructedGraph",
    # Validation
    "ScanValidator",
    "ValidationResult",
    "ValidationIssue",
    "IssueSeverity",
]
