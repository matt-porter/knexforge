"""Connection Graph Reconstruction from 3D Part Poses.

Infers how K'Nex parts connect based on their reconstructed 3D positions
and the part database schema (port locations and valid angles).

Example:
    reconstructor = GraphReconstructor(parts_db_path="parts/")
    
    # Load reconstructed poses from pose_estimator
    graph = reconstructor.reconstruct_graph(reconstruction_result)
    
    # Get valid build sequence
    build_steps = reconstructor.topological_sort(graph)
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from pydantic import BaseModel, Field


@dataclass(frozen=True)
class PortConnection:
    """A connection between two part ports."""

    part_a_id: str = Field(..., description="First part instance ID")
    port_a_id: str = Field(..., description="Port ID on first part")
    part_b_id: str = Field(..., description="Second part instance ID")
    port_b_id: str = Field(..., description="Port ID on second part")
    confidence: float = Field(
        ..., description="Connection confidence [0, 1]"
    )


@dataclass(frozen=True)
class PartInstance3D:
    """A part with 3D pose and schema information."""

    instance_id: str = Field(..., description="Unique instance identifier")
    part_type_id: str = Field(..., description="Part type from database")
    position: tuple[float, float, float] = Field(
        ..., description="3D position in world coordinates (mm)"
    )
    orientation: tuple[float, float, float, float] = Field(
        ..., description="Quaternion (x, y, z, w)"
    )
    ports: list[dict[str, Any]] = Field(
        default_factory=list, description="Port definitions from schema"
    )


class ReconstructedGraph(BaseModel):
    """Complete reconstructed build graph."""

    parts: list[PartInstance3D] = Field(
        default_factory=list, description="All parts with 3D poses"
    )
    connections: list[PortConnection] = Field(
        default_factory=list, description="All inferred connections"
    )
    ambiguous_connections: list[dict[str, Any]] = Field(
        default_factory=list, description="Connections requiring manual review"
    )
    success: bool = Field(..., description="Whether reconstruction succeeded")
    message: str = Field(default="", description="Status message")


class GraphReconstructor:
    """Reconstruct connection graph from 3D part poses.

    Uses the K'Nex part schema to infer valid connections based on:
    - Port proximity (within tolerance)
    - Valid connection angles from schema
    - Port type compatibility

    Attributes:
        parts_db_path: Path to parts/ directory with JSON definitions.
        connection_tolerance: Maximum distance for port matching (mm).
        angle_tolerance: Maximum angular deviation for valid connections (degrees).
    """

    def __init__(
        self,
        parts_db_path: str | Path = "parts/",
        connection_tolerance: float = 2.0,
        angle_tolerance: float = 15.0,
    ):
        """Initialize the graph reconstructor.

        Args:
            parts_db_path: Path to parts directory with JSON definitions.
            connection_tolerance: Max distance for port matching (default: 2mm).
            angle_tolerance: Max angular deviation in degrees (default: 15°).
        """
        self.parts_db_path = Path(parts_db_path)
        self.connection_tolerance = connection_tolerance
        self.angle_tolerance = math.radians(angle_tolerance)

        # Load part definitions
        self.part_definitions: dict[str, dict] = {}
        self._load_part_database()

    def _load_part_database(self) -> None:
        """Load all part definitions from the parts directory."""
        json_files = list(self.parts_db_path.glob("*.json"))

        for json_file in json_files:
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.part_definitions[data["id"]] = data
            except Exception as e:
                print(f"Warning: Failed to load {json_file}: {e}")

        print(f"Loaded {len(self.part_definitions)} part definitions")

    def _quaternion_to_rotation_matrix(
        self, quat: tuple[float, float, float, float]
    ) -> np.ndarray:
        """Convert quaternion to rotation matrix."""
        x, y, z, w = quat

        return np.array(
            [
                [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
                [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
                [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y],
            ],
            dtype=np.float64,
        )

    def _transform_port_to_world(
        self,
        part: PartInstance3D,
        port_def: dict[str, Any],
    ) -> tuple[np.ndarray, np.ndarray]:
        """Transform a port from local to world coordinates.

        Args:
            part: The part instance with 3D pose.
            port_def: Port definition from schema (position, direction).

        Returns:
            Tuple of (world_position, world_direction) as numpy arrays.
        """
        R = self._quaternion_to_rotation_matrix(part.orientation)

        # Local port position and direction
        local_pos = np.array(port_def["position"], dtype=np.float64)
        local_dir = np.array(port_def["direction"], dtype=np.float64)

        # Transform to world coordinates
        world_pos = np.array(part.position) + R @ local_pos
        world_dir = R @ local_dir

        return world_pos, world_dir / np.linalg.norm(world_dir)

    def _ports_compatible(
        self, port_a: dict[str, Any], port_b: dict[str, Any]
    ) -> bool:
        """Check if two ports can connect based on type compatibility.

        Args:
            port_a: First port definition.
            port_b: Second port definition.

        Returns:
            True if ports can connect, False otherwise.
        """
        # Check mate_type compatibility
        mate_a = port_a.get("mate_type", "")
        accepts_b = port_b.get("accepts", [])

        mate_b = port_b.get("mate_type", "")
        accepts_a = port_a.get("accepts", [])

        return mate_a in accepts_b or mate_b in accepts_a

    def _angle_compatible(
        self, dir_a: np.ndarray, dir_b: np.ndarray, allowed_angles: list[float]
    ) -> bool:
        """Check if port directions are compatible with allowed angles.

        Args:
            dir_a: Direction vector of first port (normalized).
            dir_b: Direction vector of second port (normalized).
            allowed_angles: List of allowed connection angles in degrees.

        Returns:
            True if angle is within tolerance of an allowed angle.
        """
        # Compute angle between ports (they should be opposite for connection)
        dot_product = np.dot(dir_a, -dir_b)  # Negative because ports face each other
        angle_rad = np.arccos(np.clip(dot_product, -1.0, 1.0))
        angle_deg = np.degrees(angle_rad)

        # Check if close to any allowed angle
        for allowed in allowed_angles:
            diff = abs(angle_deg - allowed)
            # Account for wraparound (e.g., 350° ≈ 10°)
            diff = min(diff, 360 - diff)

            if diff < self.angle_tolerance:
                return True

        return False

    def infer_connections(
        self, parts: list[PartInstance3D]
    ) -> tuple[list[PortConnection], list[dict]]:
        """Infer all valid connections between parts.

        Args:
            parts: List of part instances with 3D poses.

        Returns:
            Tuple of (valid_connections, ambiguous_connections).
        """
        connections: list[PortConnection] = []
        ambiguous: list[dict] = []

        # Build port lookup for each part
        part_ports: dict[str, list[tuple[str, np.ndarray, np.ndarray, dict]]] = {}

        for part in parts:
            if part.part_type_id not in self.part_definitions:
                print(f"Warning: Unknown part type {part.part_type_id}")
                continue

            definition = self.part_definitions[part.part_type_id]
            ports_data = definition.get("ports", [])

            part_ports[part.instance_id] = []

            for port_def in ports_data:
                world_pos, world_dir = self._transform_port_to_world(part, port_def)
                part_ports[part.instance_id].append(
                    (port_def["id"], world_pos, world_dir, port_def)
                )

        # Find connections by matching nearby ports
        part_ids = list(part_ports.keys())

        for i, part_a_id in enumerate(part_ids):
            for part_b_id in part_ids[i + 1 :]:
                ports_a = part_ports[part_a_id]
                ports_b = part_ports[part_b_id]

                for port_a_id, pos_a, dir_a, def_a in ports_a:
                    for port_b_id, pos_b, dir_b, def_b in ports_b:
                        # Check distance
                        distance = np.linalg.norm(pos_a - pos_b)

                        if distance > self.connection_tolerance:
                            continue

                        # Check type compatibility
                        if not self._ports_compatible(def_a, def_b):
                            continue

                        # Check angle compatibility
                        allowed_angles = def_a.get("allowed_angles_deg", [0, 90, 180, 270])
                        
                        if not self._angle_compatible(dir_a, dir_b, allowed_angles):
                            continue

                        # Valid connection!
                        confidence = max(0.0, 1.0 - distance / self.connection_tolerance)

                        connections.append(
                            PortConnection(
                                part_a_id=part_a_id,
                                port_a_id=port_a_id,
                                part_b_id=part_b_id,
                                port_b_id=port_b_id,
                                confidence=confidence,
                            )
                        )

        return connections, ambiguous

    def reconstruct_graph(
        self, parts_3d: list[PartInstance3D] | None = None, part_definitions: dict | None = None
    ) -> ReconstructedGraph:
        """Reconstruct the complete connection graph from 3D poses.

        Args:
            parts_3d: List of part instances with 3D poses.
            part_definitions: Optional override for part definitions.

        Returns:
            ReconstructedGraph with all parts and inferred connections.
        """
        if not parts_3d:
            return ReconstructedGraph(
                parts=[],
                connections=[],
                ambiguous_connections=[],
                success=False,
                message="No parts provided",
            )

        # Infer connections
        connections, ambiguous = self.infer_connections(parts_3d)

        return ReconstructedGraph(
            parts=parts_3d,
            connections=connections,
            ambiguous_connections=ambiguous,
            success=len(connections) > 0 or len(parts_3d) <= 1,
            message=f"Reconstructed {len(connections)} connections for {len(parts_3d)} parts",
        )

    def topological_sort(
        self, graph: ReconstructedGraph
    ) -> list[dict[str, Any]]:
        """Generate a valid build sequence using topological sort.

        Parts with more connections are built first (anchors), then parts
        that connect to already-built parts.

        Args:
            graph: Reconstructed connection graph.

        Returns:
            List of build steps in order, each with part and connection info.
        """
        if not graph.parts:
            return []

        # Build adjacency list and in-degree count
        adjacency: dict[str, set[str]] = {p.instance_id: set() for p in graph.parts}
        in_degree: dict[str, int] = {p.instance_id: 0 for p in graph.parts}

        for conn in graph.connections:
            adjacency[conn.part_a_id].add(conn.part_b_id)
            adjacency[conn.part_b_id].add(conn.part_a_id)

        # Kahn's algorithm with priority to highly-connected parts
        from collections import deque

        # Start with the most connected part (best anchor)
        connection_counts = {p.instance_id: 0 for p in graph.parts}
        
        for conn in graph.connections:
            connection_counts[conn.part_a_id] += 1
            connection_counts[conn.part_b_id] += 1

        # Find best starting part (most connections)
        remaining = set(graph.parts[0].instance_id for graph.parts if graph.parts else [])
        built: list[str] = []

        while remaining:
            # Find unbuilt part with most connections to built parts
            best_part = None
            best_score = -1

            for part_id in remaining:
                # Count connections to already-built parts
                score = len(adjacency[part_id] & set(built)) if built else connection_counts[part_id]

                if score > best_score:
                    best_score = score
                    best_part = part_id

            if best_part is None:
                break

            # Get connections for this part
            part_connections = [
                conn for conn in graph.connections
                if conn.part_a_id == best_part or conn.part_b_id == best_part
            ]

            # Find the part definition
            part_def = None
            for p in graph.parts:
                if p.instance_id == best_part:
                    part_def = p
                    break

            if part_def:
                built.append(best_part)
                remaining.remove(best_part)

                yield {
                    "step": len(built),
                    "action": "add_part",
                    "part_id": part_def.part_type_id,
                    "instance_id": best_part,
                    "position": part_def.position,
                    "quaternion": part_def.orientation,
                    "connections": [
                        {
                            "port": conn.port_a_id if conn.part_a_id == best_part else conn.port_b_id,
                            "connects_to": conn.part_b_id if conn.part_a_id == best_part else conn.part_a_id,
                            "connects_port": conn.port_b_id if conn.part_a_id == best_part else conn.port_a_id,
                        }
                        for conn in part_connections
                        if (conn.part_a_id == best_part or conn.part_b_id == best_part)
                    ],
                }

    def export_to_knx(
        self, graph: ReconstructedGraph, output_path: str | Path
    ) -> Path:
        """Export reconstructed graph to .knx format.

        Args:
            graph: Reconstructed connection graph.
            output_path: Output file path (will add .knx extension).

        Returns:
            Path to the exported file.
        """
        output_path = Path(output_path)
        if not output_path.suffix:
            output_path = output_path.with_suffix(".knx")

        # Generate build steps
        build_steps = list(self.topological_sort(graph))

        knx_data = {
            "format_version": "1.0",
            "metadata": {
                "source": "scan-to-build",
                "part_count": len(graph.parts),
                "connection_count": len(graph.connections),
            },
            "build_steps": build_steps,
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(knx_data, f, indent=2)

        print(f"Exported {output_path} with {len(build_steps)} build steps")
        return output_path


def main() -> None:
    """Demo script for graph reconstruction."""
    import argparse

    parser = argparse.ArgumentParser(description="Test connection graph reconstruction")
    parser.add_argument("--parts-db", type=str, default="parts/")
    parser.add_argument("--demo", action="store_true", help="Run demo with synthetic data")

    args = parser.parse_args()

    reconstructor = GraphReconstructor(parts_db_path=args.parts)

    if args.demo:
        print("Running demo with synthetic data...")

        # Create fake part instances
        parts = [
            PartInstance3D(
                instance_id="connector_1",
                part_type_id="connector-3way-yellow-v1",
                position=(0, 0, 0),
                orientation=(0, 0, 0, 1),
                ports=[],
            ),
            PartInstance3D(
                instance_id="rod_1",
                part_type_id="rod-150-red-v1",
                position=(75, 0, 0),  # Connected to connector
                orientation=(0, 0, 0, 1),
                ports=[],
            ),
        ]

        graph = reconstructor.reconstruct_graph(parts)
        
        print(f"\nGraph reconstruction {'succeeded' if graph.success else 'failed'}: {graph.message}")
        print(f"Found {len(graph.connections)} connections")

        # Export build sequence
        print("\nBuild sequence:")
        for step in reconstructor.topological_sort(graph):
            print(f"  Step {step['step']}: Add {step['part_id']} at {step['position']}")


if __name__ == "__main__":
    main()
