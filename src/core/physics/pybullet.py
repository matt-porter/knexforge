"""
pybullet.py — Tier 2 physics simulation for K'NexForge

- Wrapper around PyBullet for full rigid-body simulation
- Auto-generates convex hulls from GLB meshes
- Joint creation at validated ports
- Exposes simulate_collapse(build) -> CollapseResult

This module is optional and requires pybullet to be installed.
"""

from typing import Any, Optional
from pathlib import Path
import importlib.util

try:
    import pybullet as p
    import pybullet_data
except ImportError:
    p = None

from ..build import Build
from .graph import StabilityScore

class CollapseResult(StabilityScore):
    """Result of a collapse simulation, extends StabilityScore."""
    pass

class PyBulletSimulator:
    def __init__(self, build: Build, mesh_dir: Optional[Path] = None):
        if p is None:
            raise ImportError("pybullet is not installed. Run 'pip install pybullet' to use physics simulation.")
        self.build = build
        self.mesh_dir = mesh_dir
        self.client = None
        self.part_bodies = {}

    def __enter__(self):
        self.client = p.connect(p.DIRECT)
        p.setAdditionalSearchPath(pybullet_data.getDataPath())
        p.setGravity(0, 0, -9.81)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.client is not None:
            p.disconnect(self.client)
            self.client = None

    def load_part_mesh(self, part_instance) -> int:
        """Loads a part's convex hull mesh as a collision shape and returns the body id."""
        import trimesh
        from ..parts.loader import PartLoader
        part_id = getattr(part_instance, 'part_id', getattr(part_instance, 'id', None))
        mesh_path = None
        if part_id:
            mesh_path = PartLoader.get_mesh_path(part_id)
        if mesh_path and mesh_path.exists():
            mesh = trimesh.load_mesh(str(mesh_path), force='mesh')
            if not mesh.is_watertight:
                mesh = mesh.convex_hull
            vertices = mesh.vertices.tolist()
            faces = mesh.faces.tolist()
            collision_shape = p.createCollisionShape(
                p.GEOM_MESH,
                vertices=vertices,
                indices=[i for face in faces for i in face],
                flags=p.GEOM_FORCE_CONCAVE_TRIMESH
            )
        else:
            # fallback: simple box
            collision_shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[5, 5, 5])
        body_id = p.createMultiBody(baseMass=1.0, baseCollisionShapeIndex=collision_shape)
        return body_id

    def create_joints(self):
        """Creates joints between parts at validated ports."""
        # For each connection, create a fixed joint between the two part bodies at the port positions
        from ..parts.models import Connection
        for conn in self.build.connections:
            from_inst = self.build.parts[conn.from_instance]
            to_inst = self.build.parts[conn.to_instance]
            from_port = from_inst.get_port(conn.from_port)
            to_port = to_inst.get_port(conn.to_port)
            parent_body = self.part_bodies[from_inst.instance_id]
            child_body = self.part_bodies[to_inst.instance_id]
            # Compute world positions for ports
            from_pos = from_inst.position
            to_pos = to_inst.position
            # For now, use fixed joint at midpoint between ports
            joint_pos = [
                (f + t) / 2 for f, t in zip(from_pos, to_pos)
            ]
            p.createConstraint(
                parentBodyUniqueId=parent_body,
                parentLinkIndex=-1,
                childBodyUniqueId=child_body,
                childLinkIndex=-1,
                jointType=p.JOINT_FIXED,
                jointAxis=[0, 0, 0],
                parentFramePosition=[c - f for c, f in zip(joint_pos, from_pos)],
                childFramePosition=[c - t for c, t in zip(joint_pos, to_pos)]
            )

    def simulate(self, steps: int = 240, movement_threshold: float = 2.0) -> CollapseResult:
        """Runs the simulation and returns a CollapseResult based on part movement."""
        initial_positions = {}
        for inst_id, body_id in self.part_bodies.items():
            pos, _ = p.getBasePositionAndOrientation(body_id)
            initial_positions[inst_id] = pos
        for _ in range(steps):
            p.stepSimulation()
        unstable_parts = []
        for inst_id, body_id in self.part_bodies.items():
            final_pos, _ = p.getBasePositionAndOrientation(body_id)
            init_pos = initial_positions[inst_id]
            dist = sum((f - i) ** 2 for f, i in zip(final_pos, init_pos)) ** 0.5
            if dist > movement_threshold:
                unstable_parts.append(inst_id)
        score = 1.0 if not unstable_parts else 0.0
        return CollapseResult(score=score, unstable_parts=unstable_parts)

def simulate_collapse(build: Build, mesh_dir: Optional[Path] = None) -> CollapseResult:
    """Simulate collapse using PyBullet. Returns CollapseResult."""
    with PyBulletSimulator(build, mesh_dir) as sim:
        for part in build.parts:
            sim.part_bodies[part.id] = sim.load_part_mesh(part)
        sim.create_joints()
        result = sim.simulate()
    return result
