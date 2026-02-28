#!/usr/bin/env python3
"""Full debug test with actual meshes."""

import sys
sys.path.insert(0, 'C:/Users/matt_/KNEX Forge/src')

import pybullet as p
from scipy.spatial.transform import Rotation as R
import numpy as np
import trimesh
from pathlib import Path

# Connect to PyBullet
p.connect(p.DIRECT)
p.setGravity(0, 0, -9.81)

from core.parts.loader import PartLoader
library = PartLoader.load()

connector = library.get("connector-4way-green-v1")
rod = library.get("rod-16-green-v1")

print(f"Connector: {connector.id}, mass={connector.mass_grams}g")
print(f"Rod: {rod.id}, mass={rod.mass_grams}g")

# Load meshes
conn_mesh_path = Path('C:/Users/matt_/KNEX Forge/parts/meshes/connector-4way-green.glb')
rod_mesh_path = Path('C:/Users/matt_/KNEX Forge/parts/meshes/rod-16-green.glb')

conn_mesh = trimesh.load_mesh(str(conn_mesh_path), force='mesh')
rod_mesh = trimesh.load_mesh(str(rod_mesh_path), force='mesh')

print(f"\nConnector mesh CoM: {conn_mesh.center_mass}")
print(f"Rod mesh CoM: {rod_mesh.center_mass}")

# Create convex hulls
conn_ch = conn_mesh.convex_hull
rod_ch = rod_mesh.convex_hull

print(f"Connector hull CoM: {conn_ch.center_mass}")
print(f"Rod hull CoM: {rod_ch.center_mass}")

# Create collision shapes
conn_shape = p.createCollisionShape(p.GEOM_MESH, vertices=conn_ch.vertices.tolist())
rod_shape = p.createCollisionShape(p.GEOM_MESH, vertices=rod_ch.vertices.tolist())

# Create bodies at specific positions
conn_pos = (0.0, 0.0, 20.0)
rod_pos = (25.4, 0.0, 20.0)

print(f"\nCreating bodies:")
print(f"  Connector at {conn_pos}")
print(f"  Rod at {rod_pos}")

conn_body = p.createMultiBody(
    baseMass=connector.mass_grams / 1000.0,
    baseCollisionShapeIndex=conn_shape,
    basePosition=conn_pos,
    baseOrientation=[0, 0, 0, 1]
)

rod_body = p.createMultiBody(
    baseMass=rod.mass_grams / 1000.0,
    baseCollisionShapeIndex=rod_shape,
    basePosition=rod_pos,
    baseOrientation=[0, 0, 0, 1]
)

# Get actual positions (PyBullet places CoM at the specified position)
actual_conn_pos, _ = p.getBasePositionAndOrientation(conn_body)
actual_rod_pos, _ = p.getBasePositionAndOrientation(rod_body)

print(f"\nActual body positions (CoM):")
print(f"  Connector: {actual_conn_pos}")
print(f"  Rod: {actual_rod_pos}")

# Now compute constraint positions correctly
# The port positions are in the mesh's local frame, but PyBullet uses CoM as origin
# So we need to account for the offset between mesh origin and CoM

from_port_pos = np.array(connector.ports[0].position)  # Port A: (12.7, 0, 0)
to_port_pos = np.array([pt.position for pt in rod.ports if pt.id == 'end1'][0])  # end1: (0, 0, 0)

print(f"\nPort positions (in mesh local frame):")
print(f"  Connector port A: {from_port_pos}")
print(f"  Rod port end1: {to_port_pos}")

# The mesh origin is offset from CoM by the center_mass vector
# So to get port position in PyBullet's body frame (CoM-centered), we need:
# port_in_body_frame = port_in_mesh_frame - center_mass

conn_com_offset = np.array(conn_ch.center_mass)
rod_com_offset = np.array(rod_ch.center_mass)

print(f"\nCoM offsets (mesh origin relative to CoM):")
print(f"  Connector: {conn_com_offset}")
print(f"  Rod: {rod_com_offset}")

# Port positions in body frame (CoM-centered)
from_port_body = from_port_pos - conn_com_offset
to_port_body = to_port_pos - rod_com_offset

print(f"\nPort positions in body frame (CoM-centered):")
print(f"  Connector port A: {from_port_body}")
print(f"  Rod port end1: {to_port_body}")

# World positions of ports
from_port_world = np.array(actual_conn_pos) + from_port_body
to_port_world = np.array(actual_rod_pos) + to_port_body

print(f"\nPort world positions:")
print(f"  Connector port A: {from_port_world}")
print(f"  Rod port end1: {to_port_world}")
print(f"  Distance: {np.linalg.norm(from_port_world - to_port_world)}")

# Compute pivot
pivot_world = (from_port_world + to_port_world) * 0.5
print(f"\nPivot world: {pivot_world}")

# Transform to body frames
pivot_parent = (pivot_world - np.array(actual_conn_pos)).tolist()
pivot_child = (pivot_world - np.array(actual_rod_pos)).tolist()

print(f"\nPivot in body frames:")
print(f"  Parent (connector): {pivot_parent}")
print(f"  Child (rod): {pivot_child}")

# Create constraint
print("\nCreating FIXED constraint...")
constraint_id = p.createConstraint(
    parentBodyUniqueId=conn_body,
    parentLinkIndex=-1,
    childBodyUniqueId=rod_body,
    childLinkIndex=-1,
    jointType=p.JOINT_FIXED,
    jointAxis=[0, 0, 0],
    parentFramePosition=pivot_parent,
    childFramePosition=pivot_child
)
p.changeConstraint(constraint_id, maxForce=10000)

# Run simulation
print("\nRunning simulation for 240 steps...")
for _ in range(240):
    p.stepSimulation()

final_conn_pos, _ = p.getBasePositionAndOrientation(conn_body)
final_rod_pos, _ = p.getBasePositionAndOrientation(rod_body)

print(f"\nFinal positions:")
print(f"  Connector: {final_conn_pos}")
print(f"  Rod: {final_rod_pos}")

initial_dist = np.linalg.norm(np.array(actual_conn_pos) - np.array(actual_rod_pos))
final_dist = np.linalg.norm(np.array(final_conn_pos) - np.array(final_rod_pos))

print(f"\nDistance between bodies:")
print(f"  Initial: {initial_dist}")
print(f"  Final: {final_dist}")
print(f"  Change: {abs(final_dist - initial_dist)}")

if abs(final_dist - initial_dist) < 5.0:
    print("\nSUCCESS: Parts stayed connected!")
else:
    print("\nFAILURE: Parts detached!")

p.disconnect()
