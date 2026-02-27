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
        p.setAdditionalSearchPath(pybullet_data.getDataPath())
        p.setGravity(0, 0, -9.81)
        self.plane_id = p.loadURDF("plane.urdf")
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
        
        body_id = p.createMultiBody(
            baseMass=part_instance.part.mass_grams / 1000.0 if hasattr(part_instance.part, 'mass_grams') else 1.0,
            baseCollisionShapeIndex=collision_shape,
            basePosition=part_instance.position,
            baseOrientation=part_instance.quaternion
        )
        # Prevent bodies from sleeping so simulation remains live
        p.changeDynamics(body_id, -1, activationState=p.ACTIVATION_STATE_DISABLE_SLEEPING)
        return body_id

    def create_joints(self):
        """Creates joints between parts at validated ports."""
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
            p.setCollisionFilterPair(parent_body, child_body, -1, -1, 0)

            # Backward compatibility: infer dynamic joint types when older snapshots omit joint_type.
            mate_types = {from_port.mate_type, to_port.mate_type}
            joint_type = conn.joint_type
            if joint_type == "fixed":
                if "rotational_hole" in mate_types:
                    joint_type = "revolute"
                elif "slider_hole" in mate_types:
                    joint_type = "prismatic"

            if joint_type == "revolute":
                # Try native revolute joint first (improved spinning reliability)
                from_rot = R.from_quat(from_inst.quaternion)
                to_rot = R.from_quat(to_inst.quaternion)
                from_origin = np.array(from_inst.position, dtype=float)
                to_origin = np.array(to_inst.position, dtype=float)

                # World positions of connection ports
                from_port_world = from_origin + from_rot.apply(np.array(from_port.position, dtype=float))
                to_port_world = to_origin + to_rot.apply(np.array(to_port.position, dtype=float))
                pivot_world = (from_port_world + to_port_world) * 0.5

                # Get correct spin axis (use rotational_hole if present)
                axis_inst = from_inst
                axis_port = from_port
                if from_port.mate_type != "rotational_hole" and to_port.mate_type == "rotational_hole":
                    axis_inst = to_inst
                    axis_port = to_port
                axis_world = R.from_quat(axis_inst.quaternion).apply(np.array(axis_port.direction, dtype=float))
                axis_norm = np.linalg.norm(axis_world)
                if axis_norm <= 1e-8:
                    axis_world = np.array([0.0, 0.0, 1.0], dtype=float)
                else:
                    axis_world = axis_world / axis_norm

                # Parent/child pivot in each body's local frame
                pivot_parent = from_rot.inv().apply(pivot_world - from_origin).tolist()
                pivot_child = to_rot.inv().apply(pivot_world - to_origin).tolist()
                axis_parent = from_rot.inv().apply(axis_world).tolist()
                axis_child = to_rot.inv().apply(axis_world).tolist()

                try:
                    revolute_id = p.createConstraint(
                        parentBodyUniqueId=parent_body,
                        parentLinkIndex=-1,
                        childBodyUniqueId=child_body,
                        childLinkIndex=-1,
                        jointType=p.JOINT_REVOLUTE,
                        jointAxis=axis_child,
                        parentFramePosition=pivot_parent,
                        childFramePosition=pivot_child
                    )
                    p.changeConstraint(revolute_id, maxForce=20000)
                    self.joint_constraints.append({"id": revolute_id, "parts": [from_inst.instance_id, to_inst.instance_id]})
                except Exception:
                    # Fallback: dual point-to-point as pseudo-hinge (legacy)
                    try:
                        secondary_world = pivot_world + axis_world * 10.0
                        p1_parent = pivot_parent
                        p1_child = pivot_child
                        p2_parent = from_rot.inv().apply(secondary_world - from_origin).tolist()
                        p2_child = to_rot.inv().apply(secondary_world - to_origin).tolist()
                        cid1 = p.createConstraint(parent_body, -1, child_body, -1, p.JOINT_POINT2POINT, [0,0,0], p1_parent, p1_child)
                        cid2 = p.createConstraint(parent_body, -1, child_body, -1, p.JOINT_POINT2POINT, [0,0,0], p2_parent, p2_child)
                        p.changeConstraint(cid1, maxForce=20000)
                        p.changeConstraint(cid2, maxForce=20000)
                        self.joint_constraints.append({"id": cid1, "parts": [from_inst.instance_id, to_inst.instance_id]})
                        self.joint_constraints.append({"id": cid2, "parts": [from_inst.instance_id, to_inst.instance_id]})
                    except Exception:
                        # As last resort, rigid constraint
                        fixed_id = p.createConstraint(
                            parentBodyUniqueId=parent_body,
                            parentLinkIndex=-1,
                            childBodyUniqueId=child_body,
                            childLinkIndex=-1,
                            jointType=p.JOINT_FIXED,
                            jointAxis=[0, 0, 0],
                            parentFramePosition=list(from_port.position),
                            childFramePosition=list(to_port.position)
                        )
                        p.changeConstraint(fixed_id, maxForce=10000)
                        self.joint_constraints.append({"id": fixed_id, "parts": [from_inst.instance_id, to_inst.instance_id]})
                continue # Joint(s) created, skip the standard block below

            pb_joint_type = p.JOINT_FIXED
            if joint_type == "prismatic":
                pb_joint_type = p.JOINT_PRISMATIC

            # The joint axis in parent (from_inst) local frame
            joint_axis = from_port.direction if pb_joint_type != p.JOINT_FIXED else [0, 0, 0]

            try:
                joint_id = p.createConstraint(
                    parentBodyUniqueId=parent_body,
                    parentLinkIndex=-1,
                    childBodyUniqueId=child_body,
                    childLinkIndex=-1,
                    jointType=pb_joint_type,
                    jointAxis=joint_axis,
                    parentFramePosition=list(from_port.position),
                    childFramePosition=list(to_port.position)
                )
            except Exception:
                joint_id = p.createConstraint(
                    parentBodyUniqueId=parent_body,
                    parentLinkIndex=-1,
                    childBodyUniqueId=child_body,
                    childLinkIndex=-1,
                    jointType=p.JOINT_FIXED,
                    jointAxis=[0, 0, 0],
                    parentFramePosition=list(from_port.position),
                    childFramePosition=list(to_port.position)
                )

            p.changeConstraint(joint_id, maxForce=10000)

            self.joint_constraints.append({
                "id": joint_id,
                "parts": [from_inst.instance_id, to_inst.instance_id]
            })

    def simulate(self, steps: int = 240, movement_threshold: float = 2.0) -> CollapseResult:
        """Runs the simulation and returns a CollapseResult based on part movement and stress."""
        # Add some linear/angular damping to stabilize K'NEX connections
        for body_id in self.part_bodies.values():
            p.changeDynamics(body_id, -1, linearDamping=0.05, angularDamping=0.05)

        initial_positions = {}
        for inst_id, body_id in self.part_bodies.items():
            pos, _ = p.getBasePositionAndOrientation(body_id)
            initial_positions[inst_id] = pos

        # Let simulation settle
        for _ in range(steps):
            p.stepSimulation()

        unstable_parts = []
        for inst_id, body_id in self.part_bodies.items():
            final_pos, _ = p.getBasePositionAndOrientation(body_id)
            init_pos = initial_positions[inst_id]
            dist = sum((f - i) ** 2 for f, i in zip(final_pos, init_pos)) ** 0.5
            if dist > movement_threshold:
                unstable_parts.append(inst_id)

        # Calculate stress
        stress_data = {inst_id: 0.0 for inst_id in self.part_bodies.keys()}
        max_stress = 1.0 # Avoid division by zero
        for joint in self.joint_constraints:
            state = p.getConstraintState(joint["id"])
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
