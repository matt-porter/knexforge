"""K'Nex Part Detector using YOLOv8.

Detects and classifies K'Nex parts in photographs for scan-to-build pipeline.
Wraps YOLOv8 with K'Nex-specific post-processing and confidence filtering.

Example:
    detector = KNexDetector(model_path="runs/detect/knex_parts_v1/weights/best.pt")
    results = detector.detect(image_path)
    
    for detection in results:
        print(f"Part {detection.part_id} at {detection.bbox} with confidence {detection.confidence}")
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class Detection:
    """A single part detection from the YOLO model."""

    part_id: str = Field(..., description="Detected part ID")
    bbox: tuple[float, float, float, float] = Field(
        ..., description="Bounding box (x_center, y_center, width, height) normalized"
    )
    confidence: float = Field(..., description="Detection confidence [0, 1]")
    category: str = Field(..., description="Part category (rod, connector, etc.)")


class DetectionResult(BaseModel):
    """Complete detection result for an image."""

    image_path: str = Field(..., description="Path to input image")
    detections: list[Detection] = Field(
        default_factory=list, description="All detected parts"
    )
    image_size: tuple[int, int] = Field(
        ..., description="Original image dimensions (width, height)"
    )


class KNexDetector:
    """YOLOv8-based detector for K'Nex parts.

    This class wraps YOLOv8 with K'Nex-specific configuration and post-processing:
    - Confidence thresholding to reduce false positives
    - Non-maximum suppression (NMS) for overlapping detections
    - Category filtering based on part database

    Attributes:
        model_path: Path to trained YOLOv8 weights file.
        confidence_threshold: Minimum confidence for valid detections.
        iou_threshold: IoU threshold for NMS.
    """

    def __init__(
        self,
        model_path: str | Path,
        confidence_threshold: float = 0.5,
        iou_threshold: float = 0.45,
    ):
        """Initialize the K'Nex detector.

        Args:
            model_path: Path to trained YOLOv8 weights (.pt file).
            confidence_threshold: Minimum detection confidence [0, 1].
            iou_threshold: IoU threshold for non-maximum suppression.

        Raises:
            ImportError: If ultralytics (YOLOv8) is not installed.
            FileNotFoundError: If model weights file doesn't exist.
        """
        try:
            from ultralytics import YOLO
        except ImportError as e:
            raise ImportError(
                "ultralytics required for YOLOv8. Install with: pip install ultralytics"
            ) from e

        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model weights not found: {model_path}")

        self.model = YOLO(str(model_path))
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.model_path = model_path

        # Load class names from model
        self.class_names: list[str] = list(self.model.names.values())

    def detect(
        self, image: str | Path | Any, min_confidence: float | None = None
    ) -> DetectionResult:
        """Detect K'Nex parts in an image.

        Args:
            image: Path to image file or numpy array (BGR format from OpenCV).
            min_confidence: Override default confidence threshold.

        Returns:
            DetectionResult with all detected parts and metadata.
        """
        from ultralytics import YOLO

        img_path = Path(image) if isinstance(image, str | Path) else None
        image_size = (640, 640)  # Default, will update from actual image

        if img_path and img_path.exists():
            # Get actual image size
            from PIL import Image

            with Image.open(img_path) as img:
                image_size = img.size

        # Run YOLO inference
        conf = min_confidence if min_confidence else self.confidence_threshold

        results = self.model(
            source=image,
            conf=conf,
            iou=self.iou_threshold,
            verbose=False,
        )

        # Parse results
        detections: list[Detection] = []
        result = results[0]

        for box in result.boxes:
            # Box format: x1, y1, x2, y2 (pixel coordinates)
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            cls_id = int(box.cls[0].cpu().numpy())
            conf_score = float(box.conf[0].cpu().numpy())

            # Convert to normalized center format
            x_center = (x1 + x2) / 2 / image_size[0]
            y_center = (y1 + y2) / 2 / image_size[1]
            width = (x2 - x1) / image_size[0]
            height = (y2 - y1) / image_size[1]

            # Get part ID from class name
            part_id = self.class_names[cls_id] if cls_id < len(self.class_names) else f"unknown_{cls_id}"

            detections.append(
                Detection(
                    part_id=part_id,
                    bbox=(x_center, y_center, width, height),
                    confidence=conf_score,
                    category=self._get_category_from_part_id(part_id),
                )
            )

        return DetectionResult(
            image_path=str(img_path) if img_path else "unknown",
            detections=detections,
            image_size=image_size,
        )

    def _get_category_from_part_id(self, part_id: str) -> str:
        """Extract category from part ID (e.g., 'rod-150-red' -> 'rod').

        Args:
            part_id: The detected part identifier.

        Returns:
            Category string (rod, connector, axle, etc.).
        """
        # Part IDs follow pattern: category-size-color-version
        parts = part_id.split("-")
        return parts[0] if parts else "unknown"

    def detect_batch(
        self, images: list[str | Path], batch_size: int = 8
    ) -> list[DetectionResult]:
        """Detect parts in multiple images efficiently.

        Args:
            images: List of image paths to process.
            batch_size: Number of images per inference batch.

        Returns:
            List of DetectionResult objects, one per input image.
        """
        results: list[DetectionResult] = []

        for i in range(0, len(images), batch_size):
            batch = images[i : i + batch_size]
            batch_results = self.model(
                source=batch,
                conf=self.confidence_threshold,
                iou=self.iou_threshold,
                batch=batch_size,
                verbose=False,
            )

            for img_path, result in zip(batch, batch_results):
                detections: list[Detection] = []

                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    cls_id = int(box.cls[0].cpu().numpy())
                    conf_score = float(box.conf[0].cpu().numpy())

                    # Assume 640x640 for batch processing
                    x_center = (x1 + x2) / 2 / 640
                    y_center = (y1 + y2) / 2 / 640
                    width = (x2 - x1) / 640
                    height = (y2 - y1) / 640

                    part_id = self.class_names[cls_id] if cls_id < len(self.class_names) else f"unknown_{cls_id}"

                    detections.append(
                        Detection(
                            part_id=part_id,
                            bbox=(x_center, y_center, width, height),
                            confidence=conf_score,
                            category=self._get_category_from_part_id(part_id),
                        )
                    )

                results.append(
                    DetectionResult(
                        image_path=str(img_path),
                        detections=detections,
                        image_size=(640, 640),
                    )
                )

        return results

    def export_onnx(self, output_path: str | Path) -> Path:
        """Export the trained model to ONNX format for deployment.

        Args:
            output_path: Path where ONNX model will be saved.

        Returns:
            Path to the exported ONNX file.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        self.model.export(format="onnx", imgsz=640, device="cpu")
        
        # YOLO exports to runs/detect/export/model.onnx by default
        onnx_path = Path("runs/detect/export/model.onnx")
        
        if onnx_path.exists():
            onnx_path.rename(output_path)

        return output_path


def main() -> None:
    """Demo script for testing the detector."""
    import argparse

    parser = argparse.ArgumentParser(description="Test K'Nex part detector")
    parser.add_argument("--model", type=str, required=True, help="Path to trained model weights")
    parser.add_argument("--image", type=str, required=True, help="Path to test image")
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")

    args = parser.parse_args()

    detector = KNexDetector(model_path=args.model, confidence_threshold=args.conf)
    result = detector.detect(args.image)

    print(f"\nDetected {len(result.detections)} parts in {args.image}")
    
    for detection in result.detections:
        print(f"  - {detection.part_id} ({detection.category}): "
              f"confidence={detection.confidence:.3f}, bbox={detection.bbox}")


if __name__ == "__main__":
    main()
