"""Synthetic Training Data Generator for K'Nex Part Detection.

Generates labeled images of K'Nex parts from existing GLB meshes for YOLOv8 training.
Outputs COCO-format JSON annotations + images suitable for object detection training.

Example:
    python ai/scan-to-build/data_generator.py --parts all --count 10000 --output data/synthetic
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel, Field

# Try to import trimesh for 3D rendering
try:
    import trimesh
    from trimesh.visual import color as trimesh_color
except ImportError:
    trimesh = None  # type: ignore
    print("Warning: trimesh not installed. Install with: pip install trimesh[easy]")

# Try to import pyrender for better rendering
try:
    import pyrender
    import trimesh.visual
except ImportError:
    pyrender = None  # type: ignore


class PartDefinition(BaseModel):
    """K'Nex part definition loaded from JSON."""

    id: str = Field(..., description="Unique part identifier")
    name: str = Field(..., description="Human-readable name")
    category: str = Field(..., description="Part category (rod, connector, etc.)")
    mesh_file: str = Field(..., description="Path to GLB mesh file")
    default_color: str = Field(..., description="Default hex color")
    ports: list[dict[str, Any]] = Field(default_factory=list)


@dataclass
class RenderConfig:
    """Configuration for synthetic data generation."""

    output_dir: Path = Field(default=Path("data/synthetic"))
    image_size: tuple[int, int] = Field(default=(640, 640))
    background_mode: str = Field(default="mixed")  # solid, gradient, mixed
    lighting_variations: int = Field(default=5)
    rotation_samples: int = Field(default=12)
    scale_range: tuple[float, float] = Field(default=(0.3, 0.7))
    occlusion_probability: float = Field(default=0.1)
    blur_probability: float = Field(default=0.2)

    # YOLO-specific settings
    yolo_format: bool = Field(default=True)
    classes_file: Path | None = Field(default=None)


@dataclass
class GeneratedSample:
    """A single generated training sample."""

    image_path: Path
    part_id: str
    category: str
    bbox: tuple[float, float, float, float]  # x_center, y_center, width, height
    rotation: tuple[float, float, float]  # Euler angles
    scale: float


class SyntheticDataGenerator:
    """Generate synthetic training images for K'Nex part detection.

    This class renders K'Nex parts from GLB meshes with varied:
    - Camera angles and distances
    - Lighting conditions
    - Backgrounds (solid colors, gradients)
    - Image quality (blur, noise for realism)

    Output is COCO-format JSON compatible with YOLOv8 training.
    """

    def __init__(self, config: RenderConfig):
        self.config = config
        self.samples: list[GeneratedSample] = []
        self.part_definitions: dict[str, PartDefinition] = {}

        if trimesh is None:
            raise ImportError(
                "trimesh required for 3D rendering. Install with: pip install trimesh[easy]"
            )

    def load_parts(self, parts_dir: Path) -> dict[str, PartDefinition]:
        """Load all part definitions from the parts directory.

        Args:
            parts_dir: Path to the parts/ directory containing JSON definitions.

        Returns:
            Dictionary mapping part IDs to PartDefinition objects.
        """
        parts = {}
        json_files = list(parts_dir.glob("*.json"))

        for json_file in json_files:
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                part_def = PartDefinition(**data)
                parts[part_def.id] = part_def
            except Exception as e:
                print(f"Warning: Failed to load {json_file}: {e}")

        return parts

    def _random_rotation(self) -> tuple[float, float, float]:
        """Generate random Euler angles for part rotation."""
        return (
            random.uniform(0, 2 * math.pi),
            random.uniform(0, 2 * math.pi),
            random.uniform(0, 2 * math.pi),
        )

    def _random_background(self) -> Image.Image:
        """Generate a random background image."""
        width, height = self.config.image_size

        if self.config.background_mode == "solid" or random.random() < 0.5:
            # Solid color background (common indoor colors)
            colors = [
                (240, 240, 240),  # Light gray
                (255, 255, 255),  # White
                (180, 180, 160),  # Beige
                (200, 220, 240),  # Light blue
                (150, 130, 100),  # Wood tone
                (60, 60, 60),     # Dark gray
            ]
            color = random.choice(colors)
            img = Image.new("RGB", (width, height), color)
        else:
            # Gradient background
            angle = random.uniform(0, math.pi * 2)
            color1 = tuple(random.randint(150, 255) for _ in range(3))
            color2 = tuple(random.randint(100, 200) for _ in range(3))

            img = Image.new("RGB", (width, height))
            pixels = img.load()

            for y in range(height):
                for x in range(width):
                    t = (x * math.cos(angle) + y * math.sin(angle)) / (width + height)
                    t = max(0, min(1, t))
                    r = int(color1[0] * (1 - t) + color2[0] * t)
                    g = int(color1[1] * (1 - t) + color2[1] * t)
                    b = int(color1[2] * (1 - t) + color2[2] * t)
                    pixels[x, y] = (r, g, b)

        return img

    def _render_part_simple(
        self, mesh: trimesh.Trimesh, rotation: tuple[float, float, float]
    ) -> Image.Image:
        """Render a mesh using trimesh's built-in renderer.

        Args:
            mesh: The 3D mesh to render.
            rotation: Euler angles for part orientation.

        Returns:
            PIL Image of the rendered mesh.
        """
        # Create a scene
        scene = trimesh.Scene()
        scene.add_geometry(mesh)

        # Apply rotation
        import trimesh.transformations as tf

        rot_matrix = (
            tf.euler_matrix(rotation[0], rotation[1], rotation[2])
        )  # type: ignore
        mesh.apply_transform(rot_matrix)

        # Render to image
        img = scene.render(
            resolution=self.config.image_size,
            lighting=False,  # Simple rendering for speed
        )

        return Image.fromarray(img[:,:,:3])  # type: ignore

    def _compute_bbox_from_mask(
        self, mask: Image.Image
    ) -> tuple[float, float, float, float]:
        """Compute YOLO-format bounding box from a binary mask.

        Args:
            mask: Binary mask image (black background, white object).

        Returns:
            Tuple of (x_center, y_center, width, height) normalized to [0, 1].
        """
        coords = np.column_stack(np.where(mask.getchannel(0) > 128))
        if len(coords) == 0:
            return (0.5, 0.5, 0.1, 0.1)

        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)

        width = x_max - x_min
        height = y_max - y_min

        if width == 0 or height == 0:
            return (0.5, 0.5, 0.1, 0.1)

        # Convert to YOLO format (normalized center, width, height)
        x_center = (x_min + x_max) / 2 / self.config.image_size[0]
        y_center = (y_min + y_max) / 2 / self.config.image_size[1]
        norm_width = width / self.config.image_size[0]
        norm_height = height / self.config.image_size[1]

        return (x_center, y_center, norm_width, norm_height)

    def generate_sample(
        self, part_def: PartDefinition, parts_dir: Path
    ) -> GeneratedSample | None:
        """Generate a single training sample for a part.

        Args:
            part_def: Part definition to render.
            parts_dir: Base directory for loading mesh files.

        Returns:
            GeneratedSample with image path and annotations, or None on failure.
        """
        try:
            # Load mesh
            mesh_path = parts_dir / part_def.mesh_file
            if not mesh_path.exists():
                print(f"Warning: Mesh file not found: {mesh_path}")
                return None

            mesh = trimesh.load(mesh_path)

            # Apply random rotation
            rotation = self._random_rotation()

            # Render the part
            rendered = self._render_part_simple(mesh, rotation)

            # Create background and composite
            background = self._random_background()

            # Simple alpha compositing (rendered has white background)
            rendered_np = np.array(rendered)
            bg_np = np.array(background)

            # Assume white background in rendered image, use as alpha
            alpha = np.all(rendered_np[:, :, :3] > 240, axis=2).astype(float)
            alpha = 1 - alpha  # Invert: object is 1, background is 0

            # Composite
            composite = (rendered_np * alpha[:, :, np.newaxis] + 
                        bg_np * (1 - alpha[:, :, np.newaxis])).astype(np.uint8)
            composite_img = Image.fromarray(composite)

            # Apply random augmentations for realism
            if random.random() < self.config.blur_probability:
                composite_img = composite_img.filter(
                    ImageFilter.GaussianBlur(radius=random.uniform(0.5, 2))
                )

            # Compute bounding box from alpha mask
            bbox = self._compute_bbox_from_mask(Image.fromarray((alpha * 255).astype(np.uint8)))

            # Save image
            sample_id = f"{part_def.id}_{len(self.samples):06d}"
            image_path = self.config.output_dir / "images" / f"{sample_id}.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            composite_img.save(image_path, quality=95)

            return GeneratedSample(
                image_path=image_path,
                part_id=part_def.id,
                category=part_def.category,
                bbox=bbox,
                rotation=rotation,
                scale=random.uniform(*self.config.scale_range),
            )

        except Exception as e:
            print(f"Error generating sample for {part_def.id}: {e}")
            return None

    def generate_dataset(
        self, parts_dir: Path, samples_per_part: int = 100
    ) -> list[GeneratedSample]:
        """Generate a complete training dataset.

        Args:
            parts_dir: Path to parts/ directory with JSON definitions and meshes.
            samples_per_part: Number of images to generate per part type.

        Returns:
            List of all generated samples.
        """
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        (self.config.output_dir / "images").mkdir(exist_ok=True)

        # Load all part definitions
        self.part_definitions = self.load_parts(parts_dir)

        if not self.part_definitions:
            print("Error: No part definitions found!")
            return []

        print(f"Loaded {len(self.part_definitions)} part definitions")

        # Generate samples
        for part_id, part_def in self.part_definitions.items():
            print(f"Generating {samples_per_part} samples for {part_id}...")

            for i in range(samples_per_part):
                sample = self.generate_sample(part_def, parts_dir)
                if sample:
                    self.samples.append(sample)

        # Save COCO-format annotations
        self._save_coco_annotations(parts_dir)

        print(f"\nGenerated {len(self.samples)} total samples")
        print(f"Output directory: {self.config.output_dir}")

        return self.samples

    def _save_coco_annotations(self, parts_dir: Path) -> None:
        """Save annotations in COCO format for YOLOv8 training.

        Args:
            parts_dir: Path to parts directory (for class name mapping).
        """
        # Create class mapping
        categories = {}
        for idx, (part_id, part_def) in enumerate(self.part_definitions.items()):
            categories[idx] = {
                "id": idx,
                "name": part_def.id,
                "supercategory": part_def.category,
            }

        # Create COCO annotations
        coco_data = {
            "info": {
                "description": "Synthetic K'Nex parts dataset",
                "version": "1.0",
                "year": 2026,
            },
            "licenses": [
                {
                    "id": 1,
                    "url": "https://opensource.org/licenses/MIT",
                    "name": "MIT License",
                }
            ],
            "categories": list(categories.values()),
            "images": [],
            "annotations": [],
        }

        # Add images and annotations
        for idx, sample in enumerate(self.samples):
            coco_data["images"].append(
                {
                    "id": idx,
                    "file_name": sample.image_path.name,
                    "width": self.config.image_size[0],
                    "height": self.config.image_size[1],
                }
            )

            coco_data["annotations"].append(
                {
                    "id": idx,
                    "image_id": idx,
                    "category_id": categories[sample.part_id]["id"],
                    "bbox": [
                        sample.bbox[0] * self.config.image_size[0],  # x
                        sample.bbox[1] * self.config.image_size[1],  # y
                        sample.bbox[2] * self.config.image_size[0],  # width
                        sample.bbox[3] * self.config.image_size[1],  # height
                    ],
                    "area": (sample.bbox[2] * sample.bbox[3] * 
                            self.config.image_size[0] * self.config.image_size[1]),
                    "segmentation": [],  # Could add polygon segmentation later
                    "iscrowd": 0,
                }
            )

        # Save COCO JSON
        coco_path = self.config.output_dir / "annotations" / "instances_train.json"
        coco_path.parent.mkdir(parents=True, exist_ok=True)

        with open(coco_path, "w", encoding="utf-8") as f:
            json.dump(coco_data, f, indent=2)

        # Also save YOLO-format text files (one per image)
        yolo_dir = self.config.output_dir / "labels" / "train"
        yolo_dir.mkdir(parents=True, exist_ok=True)

        # Create classes.txt for YOLO
        with open(self.config.output_dir / "classes.txt", "w", encoding="utf-8") as f:
            for part_id in self.part_definitions.keys():
                f.write(f"{part_id}\n")

        # Save individual label files
        for sample in self.samples:
            class_id = categories[sample.part_id]["id"]
            label_path = yolo_dir / f"{sample.image_path.stem}.txt"

            with open(label_path, "w", encoding="utf-8") as f:
                # YOLO format: class_id x_center y_center width height (all normalized)
                f.write(f"{class_id} {sample.bbox[0]:.6f} {sample.bbox[1]:.6f} "
                       f"{sample.bbox[2]:.6f} {sample.bbox[3]:.6f}\n")

        print(f"Saved COCO annotations: {coco_path}")
        print(f"Saved YOLO labels: {yolo_dir}")

    def export_training_config(self) -> None:
        """Export YOLOv8 training configuration file."""
        config_path = Path("ai/scan-to-build/yolo_train_config.yaml")

        config_content = f"""# YOLOv8 Training Configuration for K'Nex Part Detection
# Generated by SyntheticDataGenerator

# Data
data: {self.config.output_dir.as_posix()}/coco_format.yaml

# Model
model: yolov8n.pt  # Start with nano model for speed

# Training
epochs: 100
image_size: {self.config.image_size[0]}
batch: 16

# Augmentation
hsv_hue: 0.015
hsv_sat: 0.7
hsv_val: 0.4
degrees: 30
translate: 0.1
scale: 0.5
perspective: 0.0
flipud: 0.0  # Don't flip vertically (gravity matters)
fliplr: 0.5
mosaic: 1.0
mixup: 0.1

# Optimization
optimizer: 'AdamW'
lr0: 0.01
lrf: 0.01
momentum: 0.937
weight_decay: 0.0005

# Misc
device: 0  # GPU device ID (use '' for CPU)
workers: 8
project: runs/detect
name: knex_parts_v1
exist_ok: True

# Classes (auto-generated)
nc: {len(self.part_definitions)}
"""

        with open(config_path, "w", encoding="utf-8") as f:
            f.write(config_content)

        print(f"Saved YOLO training config: {config_path}")


def main() -> None:
    """Main entry point for synthetic data generation."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic training data for K'Nex part detection"
    )
    parser.add_argument(
        "--parts",
        type=str,
        default="all",
        help="Parts directory path (default: parts/)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=100,
        help="Number of samples per part (default: 100)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/synthetic",
        help="Output directory (default: data/synthetic)",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=640,
        help="Image size in pixels (default: 640)",
    )

    args = parser.parse_args()

    config = RenderConfig(
        output_dir=Path(args.output),
        image_size=(args.size, args.size),
    )

    generator = SyntheticDataGenerator(config)
    generator.generate_dataset(
        parts_dir=Path(args.parts),
        samples_per_part=args.count,
    )

    if generator.samples:
        generator.export_training_config()


if __name__ == "__main__":
    main()
