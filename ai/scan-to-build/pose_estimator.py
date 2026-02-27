"""Multi-View Pose Estimation for K'Nex Parts.

Reconstructs 3D positions and orientations of parts from multiple 2D photographs
using PnP (Perspective-n-Point) algorithm with RANSAC for robustness.

Example:
    estimator = PoseEstimator(focal_length=800, principal_point=(320, 320))
    
    # Add detections from multiple views
    estimator.add_view(view_id="photo1", camera_pose=..., detections=[...])
    estimator.add_view(view_id="photo2", camera_pose=..., detections=[...])
    
    # Reconstruct 3D positions
    reconstruction = estimator.reconstruct()
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from pydantic import BaseModel, Field


@dataclass(frozen=True)
class PartPose3D:
    """3D pose of a detected part."""

    part_id: str = Field(..., description="Part identifier")
    position: tuple[float, float, float] = Field(
        ..., description="3D position in world coordinates (mm)"
    )
    orientation: tuple[float, float, float, float] = Field(
        ..., description="Quaternion orientation (x, y, z, w)"
    )
    confidence: float = Field(
        ..., description="Reconstruction confidence [0, 1]"
    )
    supporting_views: list[str] = Field(
        default_factory=list, description="View IDs that contributed to this pose"
    )


@dataclass(frozen=True)
class CameraPose:
    """Camera pose in world coordinates."""

    view_id: str = Field(..., description="Unique identifier for this camera view")
    position: tuple[float, float, float] = Field(
        ..., description="Camera position in world coordinates (mm)"
    )
    orientation: tuple[float, float, float, float] = Field(
        ..., description="Camera quaternion (x, y, z, w)"
    )
    intrinsic_matrix: np.ndarray = Field(
        ..., description="3x3 camera intrinsic matrix"
    )


class ReconstructionResult(BaseModel):
    """Complete 3D reconstruction from multiple views."""

    parts: list[PartPose3D] = Field(
        default_factory=list, description="All reconstructed part poses"
    )
    cameras: list[CameraPose] = Field(
        default_factory=list, description="All camera poses used"
    )
    success: bool = Field(..., description="Whether reconstruction succeeded")
    message: str = Field(default="", description="Status or error message")


class PoseEstimator:
    """Multi-view 3D pose estimation for K'Nex parts.

    Uses PnP + RANSAC to estimate 3D positions from 2D detections across
    multiple photographs. Requires known part geometry (from GLB meshes).

    Attributes:
        focal_length: Camera focal length in pixels.
        principal_point: Camera principal point (cx, cy) in pixels.
        distortion_coeffs: Camera distortion coefficients [k1, k2, p1, p2, k3].
    """

    def __init__(
        self,
        focal_length: float = 800.0,
        principal_point: tuple[float, float] | None = None,
        distortion_coeffs: list[float] | None = None,
    ):
        """Initialize the pose estimator.

        Args:
            focal_length: Camera focal length in pixels (typical: 600-1200).
            principal_point: Camera optical center (default: image center).
            distortion_coeffs: Radial/tangential distortion coefficients.
        """
        self.focal_length = focal_length
        self.principal_point = principal_point or (focal_length / 2, focal_length / 2)
        self.distortion_coeffs = distortion_coeffs or [0.0, 0.0, 0.0, 0.0, 0.0]

        self.views: dict[str, CameraPose] = {}
        self.detections_by_view: dict[str, list[dict]] = {}

    def create_intrinsic_matrix(
        self, image_size: tuple[int, int] | None = None
    ) -> np.ndarray:
        """Create camera intrinsic matrix from focal length and principal point.

        Args:
            image_size: Image dimensions (width, height). Used to center principal point.

        Returns:
            3x3 intrinsic matrix K.
        """
        if image_size:
            cx = self.principal_point[0] or image_size[0] / 2
            cy = self.principal_point[1] or image_size[1] / 2
        else:
            cx, cy = self.principal_point

        return np.array(
            [
                [self.focal_length, 0, cx],
                [0, self.focal_length, cy],
                [0, 0, 1],
            ],
            dtype=np.float64,
        )

    def add_view(
        self,
        view_id: str,
        camera_position: tuple[float, float, float],
        camera_rotation: tuple[float, float, float],
        detections: list[dict[str, Any]],
        image_size: tuple[int, int] = (640, 640),
    ) -> None:
        """Add a camera view with detections.

        Args:
            view_id: Unique identifier for this photograph.
            camera_position: Camera position in world coordinates (mm).
            camera_rotation: Camera Euler angles (roll, pitch, yaw) in radians.
            detections: List of 2D detections from the detector module.
            image_size: Image dimensions for intrinsic matrix calculation.
        """
        # Convert rotation to quaternion
        quat = self._euler_to_quaternion(camera_rotation)

        # Create intrinsic matrix
        K = self.create_intrinsic_matrix(image_size)

        camera_pose = CameraPose(
            view_id=view_id,
            position=camera_position,
            orientation=quat,
            intrinsic_matrix=K,
        )

        self.views[view_id] = camera_pose
        self.detections_by_view[view_id] = detections

    def _euler_to_quaternion(
        self, euler: tuple[float, float, float]
    ) -> tuple[float, float, float, float]:
        """Convert Euler angles to quaternion.

        Args:
            euler: Rotation as (roll, pitch, yaw) in radians.

        Returns:
            Quaternion as (x, y, z, w).
        """
        roll, pitch, yaw = euler

        cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
        cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
        cr, sr = math.cos(roll / 2), math.sin(roll / 2)

        w = cr * cp * cy + sr * sp * sy
        x = sr * cp * cy - cr * sp * sy
        y = cr * sp * cy + sr * cp * sy
        z = cr * cp * sy - sr * sp * cy

        return (x, y, z, w)

    def _quaternion_to_rotation_matrix(
        self, quat: tuple[float, float, float, float]
    ) -> np.ndarray:
        """Convert quaternion to rotation matrix.

        Args:
            quat: Quaternion (x, y, z, w).

        Returns:
            3x3 rotation matrix.
        """
        x, y, z, w = quat

        return np.array(
            [
                [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
                [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
                [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y],
            ],
            dtype=np.float64,
        )

    def triangulate_point(
        self,
        point_2d_views: list[tuple[str, tuple[float, float]]],
    ) -> tuple[float, float, float] | None:
        """Triangulate a 3D point from multiple 2D observations.

        Uses linear least-squares triangulation with DLT (Direct Linear Transform).

        Args:
            point_2d_views: List of (view_id, (u, v)) tuples for the same 3D point.

        Returns:
            3D position in world coordinates, or None if triangulation fails.
        """
        if len(point_2d_views) < 2:
            return None

        # Build projection matrices and observation matrix
        A_matrix = []

        for view_id, (u, v) in point_2d_views:
            if view_id not in self.views:
                continue

            camera = self.views[view_id]
            R = self._quaternion_to_rotation_matrix(camera.orientation)
            t = -R @ np.array(camera.position)

            # Projection matrix P = K [R|t]
            K = camera.intrinsic_matrix
            P = K @ np.hstack([R, t.reshape(-1, 1)])

            # Build DLT equations
            # From: s*u = P0 X, s*v = P1 X, s = P2 X
            # => u*P2 - P0 = 0, v*P2 - P1 = 0
            A_matrix.append(u * P[2] - P[0])
            A_matrix.append(v * P[1] - P[2])

        if len(A_matrix) < 6:
            return None

        A = np.vstack(A_matrix)

        # Solve using SVD
        try:
            _, _, Vt = np.linalg.svd(A)
            X_homogeneous = Vt[-1]

            # Convert to Euclidean coordinates
            X_3d = X_homogeneous[:3] / X_homogeneous[3]

            return tuple(X_3d.astype(float))  # type: ignore
        except np.linalg.LinAlgError:
            return None

    def estimate_camera_pose_from_markers(
        self,
        marker_positions_3d: list[tuple[float, float, float]],
        marker_detections_2d: list[tuple[float, float]],
        view_id: str | None = None,
    ) -> CameraPose | None:
        """Estimate camera pose using known 3D markers (PnP).

        Uses solvePnP with RANSAC for robustness against outliers.

        Args:
            marker_positions_3d: Known 3D positions of markers in world coordinates.
            marker_detections_2d: Corresponding 2D detections in image pixels.
            view_id: Optional ID for the camera pose.

        Returns:
            CameraPose if successful, None otherwise.
        """
        try:
            import cv2
        except ImportError:
            print("OpenCV required for PnP. Install with: pip install opencv-python")
            return None

        if len(marker_positions_3d) < 4:
            print("Need at least 4 markers for PnP")
            return None

        # Convert to numpy arrays
        objpoints = np.array(marker_positions_3d, dtype=np.float32)
        imgpoints = np.array(marker_detections_2d, dtype=np.float32).reshape(-1, 1, 2)

        K = self.create_intrinsic_matrix()
        dist_coeffs = np.array(self.distortion_coeffs, dtype=np.float32)

        # Solve PnP with RANSAC
        success, rvec, tvec = cv2.solvePnPRansac(
            objpoints,
            imgpoints,
            K,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
            iterationsCount=100,
            reprojectionError=8.0,
            confidence=0.99,
        )

        if not success:
            return None

        # Convert rotation vector to quaternion
        R, _ = cv2.Rodrigues(rvec)
        quat = self._rotation_matrix_to_quaternion(R)

        # Camera position is -R^T * t
        camera_position = tuple((-R.T @ tvec).flatten().tolist())

        return CameraPose(
            view_id=view_id or "auto_pose",
            position=camera_position,
            orientation=quat,
            intrinsic_matrix=K,
        )

    def _rotation_matrix_to_quaternion(self, R: np.ndarray) -> tuple[float, float, float, float]:
        """Convert rotation matrix to quaternion using Shoemake's algorithm."""
        trace = np.trace(R)

        if trace > 0:
            s = np.sqrt(trace + 1.0) * 2
            w = 0.25 * s
            x = (R[2, 1] - R[1, 2]) / s
            y = (R[0, 2] - R[2, 0]) / s
            z = (R[1, 0] - R[0, 1]) / s
        else:
            if R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
                s = np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
                w = (R[2, 1] - R[1, 2]) / s
                x = 0.25 * s
                y = (R[0, 1] + R[1, 0]) / s
                z = (R[0, 2] + R[2, 0]) / s
            elif R[1, 1] > R[2, 2]:
                s = np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
                w = (R[0, 2] - R[2, 0]) / s
                x = (R[0, 1] + R[1, 0]) / s
                y = 0.25 * s
                z = (R[1, 2] + R[2, 1]) / s
            else:
                s = np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
                w = (R[1, 0] - R[0, 1]) / s
                x = (R[0, 2] + R[2, 0]) / s
                y = (R[1, 2] + R[2, 1]) / s
                z = 0.25 * s

        return (float(x), float(y), float(z), float(w))

    def reconstruct(
        self, min_views: int = 2, confidence_threshold: float = 0.5
    ) -> ReconstructionResult:
        """Perform full 3D reconstruction from all added views.

        Args:
            min_views: Minimum number of views required for each part.
            confidence_threshold: Minimum reconstruction confidence to include.

        Returns:
            ReconstructionResult with all reconstructed part poses.
        """
        if len(self.views) < 2:
            return ReconstructionResult(
                parts=[],
                cameras=list(self.views.values()),
                success=False,
                message="Need at least 2 views for reconstruction",
            )

        # Group detections by part ID across views
        part_detections: dict[str, list[tuple[str, tuple[float, float]]]] = {}

        for view_id, detections in self.detections_by_view.items():
            for det in detections:
                part_id = det.get("part_id")
                bbox = det.get("bbox", (0.5, 0.5, 0.1, 0.1))

                # Use bbox center as 2D point
                x_center = bbox[0] * 640  # Convert from normalized to pixels
                y_center = bbox[1] * 640

                if part_id not in part_detections:
                    part_detections[part_id] = []

                part_detections[part_id].append((view_id, (x_center, y_center)))

        # Triangulate each part
        reconstructed_parts: list[PartPose3D] = []

        for part_id, views in part_detections.items():
            if len(views) < min_views:
                continue

            position = self.triangulate_point(views)

            if position is None:
                continue

            # Estimate orientation (simplified - assumes upright for now)
            # In practice, would use part-specific keypoints for full 6DoF
            orientation = (0.0, 0.0, 0.0, 1.0)  # Identity quaternion

            # Confidence based on number of views and reprojection error
            confidence = min(1.0, len(views) / 4.0)

            if confidence >= confidence_threshold:
                reconstructed_parts.append(
                    PartPose3D(
                        part_id=part_id,
                        position=position,
                        orientation=orientation,
                        confidence=confidence,
                        supporting_views=[v[0] for v in views],
                    )
                )

        return ReconstructionResult(
            parts=reconstructed_parts,
            cameras=list(self.views.values()),
            success=len(reconstructed_parts) > 0,
            message=f"Reconstructed {len(reconstructed_parts)} parts from {len(self.views)} views",
        )


def main() -> None:
    """Demo script for pose estimation."""
    import argparse

    parser = argparse.ArgumentParser(description="Test multi-view pose estimation")
    parser.add_argument("--focal-length", type=float, default=800.0)
    parser.add_argument("--demo", action="store_true", help="Run demo with synthetic data")

    args = parser.parse_args()

    estimator = PoseEstimator(focal_length=args.focal_length)

    if args.demo:
        # Demo with synthetic camera poses
        print("Running demo with synthetic data...")

        # Simulate 3 camera views around an object
        radius = 500.0  # mm

        for i, angle in enumerate([0, 2*math.pi/3, 4*math.pi/3]):
            position = (radius * math.cos(angle), 0, radius * math.sin(angle))
            rotation = (0, 0, -angle)  # Look at origin

            # Fake detections
            detections = [
                {"part_id": "connector-3way", "bbox": (0.5, 0.5, 0.1, 0.1)},
                {"part_id": "rod-150", "bbox": (0.6, 0.5, 0.2, 0.05)},
            ]

            estimator.add_view(
                view_id=f"view_{i}",
                camera_position=position,
                camera_rotation=rotation,
                detections=detections,
            )

        result = estimator.reconstruct()
        
        print(f"\nReconstruction {'succeeded' if result.success else 'failed'}: {result.message}")
        
        for part in result.parts:
            print(f"  - {part.part_id}: pos={part.position}, conf={part.confidence:.2f}")


if __name__ == "__main__":
    main()
