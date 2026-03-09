"""
pybullet.py — Tier 2 physics simulation for K'NexForge

- Wrapper around PyBullet for full rigid-body simulation
- Auto-generates convex hulls from GLB meshes
- Joint creation at validated ports
- Exposes simulate_collapse(build) -> CollapseResult

This module is optional and requires pybullet to be installed.
"""

from typing import Optional
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation as R

try:
    import pybullet as p
    import pybullet_data
except ImportError:
    p = None

from ..build import Build
from dataclasses import dataclass

@dataclass
class CollapseResult:
    """Result of a collapse simulation."""
    score: float
    unstable_parts: list[str]
    stress_data: dict[str, float]

class PyBulletSimulator:
    def __init__(self, build: Build, mesh_dir: Optional[Path] = None):
        if p is None:
            raise ImportError("pybullet is not installed. Run 'pip install pybullet' to use physics simulation.")
        self.build = build
        self.mesh_dir = mesh_dir
        self.client = None
        self.part_bodies = {}
        self.joint_constraints = []

    def __enter__(self):
        self.client = p.connect(p.DIRECT)
        p.setAdditionalSearchPath(pybullet_data.getDataPath(), physicsClientId=self.client)
        p.setGravity(0, 0, -9.81, physicsClientId=self.client)
        # More solver iterations = stiffer constraints (default is 50).
        p.setPhysicsEngineParameter(
            numSolverIterations=200,
            physicsClientId=self.client,
        )
        self.plane_id = p.loadURDF("plane.urdf", physicsClientId=self.client)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.client is not None:
            p.disconnect(self.client)
            self.client = None

    def load_part_mesh(self, part_instance) -> int:
        """Loads a part's convex hull mesh as a collision shape and returns the body id."""
        import trimesh
        from ..parts.loader import PartLoader
        part_id = getattr(part_instance, 'part', None)
        part_id = getattr(part_id, 'id', None)
        mesh_path = None
        if part_id:
            mesh_path = PartLoader.get_mesh_path(part_id)
        if mesh_path and mesh_path.exists():
            mesh = trimesh.load_mesh(str(mesh_path), force='mesh')
            # Always use the convex hull so the body can be dynamic in PyBullet.
            # GEOM_FORCE_CONCAVE_TRIMESH makes bodies effectively static.
            mesh = mesh.convex_hull
            vertices = np.array(mesh.vertices, dtype=float)

            # Rod GLB meshes are generated along the Z-axis and centered at origin,
            # but the port data convention defines rods along the X-axis with end1
            # at the origin.  The frontend applies this same correction visually
            # (see meshCorrection.ts).  We must apply it to the collision shape
            # vertices so the physics body matches the port-data coordinate system.
            if part_instance.part.category == "rod":
                end2 = next((pt for pt in part_instance.part.ports if pt.id == "end2"), None)
                rod_length = end2.position[0] if end2 else float(np.max(np.abs(vertices[:, 2])) * 2)
                # Rotate -90° around Y: [x,y,z] → [z, y, -x]
                correction_rot = R.from_euler('y', -90, degrees=True)
                vertices = correction_rot.apply(vertices)
                # Translate so end1 sits at origin
                vertices[:, 0] += rod_length / 2

            collision_shape = p.createCollisionShape(
                p.GEOM_MESH,
                vertices=vertices.tolist(),
                physicsClientId=self.client,
            )
        else:
            # fallback: simple box
            collision_shape = p.createCollisionShape(
                p.GEOM_BOX, halfExtents=[5, 5, 5], physicsClientId=self.client,
            )
        
        body_id = p.createMultiBody(
            baseMass=part_instance.part.mass_grams / 1000.0 if hasattr(part_instance.part, 'mass_grams') else 1.0,
            baseCollisionShapeIndex=collision_shape,
            basePosition=part_instance.position,
            baseOrientation=part_instance.quaternion,
            physicsClientId=self.client,
        )
        # Prevent bodies from sleeping so simulation remains live.
        # Add damping to stabilise constraint-coupled bodies.
        p.changeDynamics(
            body_id, -1,
            activationState=p.ACTIVATION_STATE_DISABLE_SLEEPING,
            linearDamping=0.3,
            angularDamping=0.3,
            physicsClientId=self.client,
        )
        return body_id

    def create_joints(self):
        """Creates joints between parts at validated ports."""
        cid = self.client
        # For each connection, create a constraint between the two part bodies at the port positions
        for conn in self.build.connections:
            if conn.from_instance not in self.part_bodies or conn.to_instance not in self.part_bodies:
                continue
                
            from_inst = self.build.parts[conn.from_instance]
            to_inst = self.build.parts[conn.to_instance]
            from_port = from_inst.get_port(conn.from_port)
            to_port = to_inst.get_port(conn.to_port)
            parent_body = self.part_bodies[from_inst.instance_id]
            child_body = self.part_bodies[to_inst.instance_id]
            
            # Disable collision between joined parts to prevent binding
            p.setCollisionFilterPair(parent_body, child_body, -1, -1, 0, physicsClientId=cid)

            # Re-infer joint type from ports for physics consistency
            from ..snapping import infer_joint_type
            
            # Physics specific override for cylindrical joints
            is_cylindrical = from_port.id.startswith("center_axial") or to_port.id.startswith("center_axial")
            is_fixed_offset = from_port.id.startswith("center_tangent") or to_port.id.startswith("center_tangent")
            
            joint_type = infer_joint_type(from_port, to_port)

            # Compute rotations and positions
            from_rot = R.from_quat(from_inst.quaternion)
            to_rot = R.from_quat(to_inst.quaternion)
            from_origin = np.array(from_inst.position, dtype=float)
            to_origin = np.array(to_inst.position, dtype=float)
            
            # Apply slide_offset to port positions
            from_pos = list(from_port.position)
            to_pos = list(to_port.position)
            
            if is_fixed_offset or is_cylindrical:
                if from_port.id.startswith("center_axial") or from_port.id.startswith("center_tangent"):
                    from_pos[0] += getattr(conn, 'slide_offset', 0.0)
                if to_port.id.startswith("center_axial") or to_port.id.startswith("center_tangent"):
                    to_pos[0] += getattr(conn, 'slide_offset', 0.0)

            from_port_world = from_origin + from_rot.apply(np.array(from_pos, dtype=float))
            to_port_world = to_origin + to_rot.apply(np.array(to_pos, dtype=float))
            pivot_world = (from_port_world + to_port_world) * 0.5

            # Anchor arm length — larger arms resist torque better
            # (constraint_force × arm = resistive_torque).
            ARM_MM = 30.0

            if is_cylindrical:
                # Cylindrical: 2 P2P perpendicular to rotation axis
                # This locks off-axis translation and tilt
                # but allows rotation AND axial sliding
                axis_inst = from_inst
                axis_port = from_port
                if from_port.mate_type != "rotational_hole" and to_port.mate_type == "rotational_hole":
                    axis_inst = to_inst
                    axis_port = to_port
                axis_world = R.from_quat(axis_inst.quaternion).apply(np.array(axis_port.direction, dtype=float))
                axis_norm = np.linalg.norm(axis_world)
                if axis_norm > 1e-8:
                    axis_world = axis_world / axis_norm
                else:
                    axis_world = np.array([0.0, 0.0, 1.0])
                    
                perp1 = np.cross(axis_world, [0, 1, 0])
                if np.linalg.norm(perp1) < 1e-6:
                    perp1 = np.cross(axis_world, [1, 0, 0])
                perp1 = perp1 / np.linalg.norm(perp1)
                perp2 = np.cross(axis_world, perp1)
                perp2 = perp2 / np.linalg.norm(perp2)
                
                anchors_world = [
                    pivot_world + perp1 * ARM_MM,
                    pivot_world + perp2 * ARM_MM,
                ]
            elif joint_type == "revolute":
                # Revolute: 2 P2P along rotation axis — allows rotation around
                # that axis but locks translation + off-axis rotation.
                axis_inst = from_inst
                axis_port = from_port
                if from_port.mate_type != "rotational_hole" and to_port.mate_type == "rotational_hole":
                    axis_inst = to_inst
                    axis_port = to_port
                axis_world = R.from_quat(axis_inst.quaternion).apply(np.array(axis_port.direction, dtype=float))
                axis_norm = np.linalg.norm(axis_world)
                if axis_norm > 1e-8:
                    axis_world = axis_world / axis_norm
                else:
                    axis_world = np.array([0.0, 0.0, 1.0])

                anchors_world = [pivot_world, pivot_world + axis_world * ARM_MM]
            else:
                # Fixed/prismatic: 3 P2P at non-collinear points to lock all 6 DOF
                direction = from_rot.apply(np.array(from_port.direction, dtype=float))
                d_norm = np.linalg.norm(direction)
                if d_norm > 1e-8:
                    direction = direction / d_norm
                else:
                    direction = np.array([1.0, 0.0, 0.0])

                up = np.array([0.0, 1.0, 0.0]) if abs(direction[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
                perp1 = np.cross(direction, up)
                perp1 = perp1 / (np.linalg.norm(perp1) + 1e-8)
                perp2 = np.cross(direction, perp1)

                anchors_world = [
                    pivot_world,
                    pivot_world + perp1 * ARM_MM,
                    pivot_world + perp2 * ARM_MM,
                ]

            # Create POINT2POINT constraints for each anchor.
            # Force must exceed any applied torque / arm distance to stay rigid.
            max_force = 100000
            for anchor_world in anchors_world:
                anchor_parent = from_rot.inv().apply(anchor_world - from_origin).tolist()
                anchor_child = to_rot.inv().apply(anchor_world - to_origin).tolist()
                try:
                    c_id = p.createConstraint(
                        parent_body, -1, child_body, -1,
                        p.JOINT_POINT2POINT, [0, 0, 0],
                        anchor_parent, anchor_child,
                        physicsClientId=cid,
                    )
                    p.changeConstraint(c_id, maxForce=max_force, physicsClientId=cid)
                    self.joint_constraints.append({
                        "id": c_id,
                        "parts": [from_inst.instance_id, to_inst.instance_id]
                    })
                except Exception:
                    pass

    def simulate(self, steps: int = 240, movement_threshold: float = 2.0) -> CollapseResult:
        """Runs the simulation and returns a CollapseResult based on part movement and stress."""
        cid = self.client
        # Add some linear/angular damping to stabilize K'NEX connections
        for body_id in self.part_bodies.values():
            p.changeDynamics(body_id, -1, linearDamping=0.05, angularDamping=0.05,
                             physicsClientId=cid)

        initial_positions = {}
        for inst_id, body_id in self.part_bodies.items():
            pos, _ = p.getBasePositionAndOrientation(body_id, physicsClientId=cid)
            initial_positions[inst_id] = pos

        # Let simulation settle
        for _ in range(steps):
            p.stepSimulation(physicsClientId=cid)

        unstable_parts = []
        for inst_id, body_id in self.part_bodies.items():
            final_pos, _ = p.getBasePositionAndOrientation(body_id, physicsClientId=cid)
            init_pos = initial_positions[inst_id]
            dist = sum((f - i) ** 2 for f, i in zip(final_pos, init_pos)) ** 0.5
            if dist > movement_threshold:
                unstable_parts.append(inst_id)

        # Calculate stress
        stress_data = {inst_id: 0.0 for inst_id in self.part_bodies.keys()}
        max_stress = 1.0 # Avoid division by zero
        for joint in self.joint_constraints:
            state = p.getConstraintState(joint["id"], physicsClientId=cid)
            if len(state) >= 3:
                fx, fy, fz = state[0:3]
                force_mag = (fx**2 + fy**2 + fz**2)**0.5
                for part_id in joint["parts"]:
                    stress_data[part_id] += force_mag
                    if stress_data[part_id] > max_stress:
                        max_stress = stress_data[part_id]

        # Normalize stress data to 0-1
        for part_id in stress_data:
            stress_data[part_id] = stress_data[part_id] / max_stress

        score = 1.0 if not unstable_parts else 0.0
        return CollapseResult(score=score, unstable_parts=unstable_parts, stress_data=stress_data)

def simulate_collapse(build: Build, mesh_dir: Optional[Path] = None) -> CollapseResult:
    """Simulate collapse using PyBullet. Returns CollapseResult."""
    with PyBulletSimulator(build, mesh_dir) as sim:
        for inst_id, part_inst in build.parts.items():
            sim.part_bodies[inst_id] = sim.load_part_mesh(part_inst)
        sim.create_joints()
        result = sim.simulate()
    return result
