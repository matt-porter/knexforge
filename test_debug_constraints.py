#!/usr/bin/env python3
"""Debug script to inspect constraint creation."""

import sys
sys.path.insert(0, 'C:/Users/matt_/KNEX Forge/src')

import pybullet as p
from scipy.spatial.transform import Rotation as R
import numpy as np
from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection

# Connect to PyBullet
p.connect(p.DIRECT)
p.setGravity(0, 0, -9.81)

library = PartLoader.load()
connector = library.get("connector-4way-green-v1")
rod = library.get("rod-16-green-v1")

print(f"Connector: {connector.id}")
print(f"  Port A position: {connector.ports[0].position}")
print(f"  Port A direction: {connector.ports[0].direction}")
print(f"Rod: {rod.id}")
print(f"  Port end1 position: {[pt for pt in rod.ports if pt.id == 'end1'][0].position}")

# Create parts
conn_inst = PartInstance(
    instance_id="connector-1",
    part=connector,
    position=(0.0, 0.0, 10.0),  # Above ground
    quaternion=(0.0, 0.0, 0.0, 1.0),
)

rod_inst = PartInstance(
    instance_id="rod-1",
    part=rod,
    position=(25.4, 0.0, 10.0),
    quaternion=(0.0, 0.0, 0.0, 1.0),
)

# Create collision shapes (simple boxes for debugging)
conn_shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[5, 5, 5])
rod_shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[20, 2, 2])

conn_body = p.createMultiBody(
    baseMass=0.1,
    baseCollisionShapeIndex=conn_shape,
    basePosition=conn_inst.position,
    baseOrientation=conn_inst.quaternion
)

rod_body = p.createMultiBody(
    baseMass=0.05,
    baseCollisionShapeIndex=rod_shape,
    basePosition=rod_inst.position,
    baseOrientation=rod_inst.quaternion
)

print(f"\nCreated bodies:")
print(f"  Connector body: {conn_body} at {p.getBasePositionAndOrientation(conn_body)[0]}")
print(f"  Rod body: {rod_body} at {p.getBasePositionAndOrientation(rod_body)[0]}")

# Get port info
from_port = conn_inst.get_port("A")
to_port = rod_inst.get_port("end1")

print(f"\nPort info:")
print(f"  from_port (connector.A): position={from_port.position}, direction={from_port.direction}")
print(f"  to_port (rod.end1): position={to_port.position}, direction={to_port.direction}")

# Compute world positions
from_rot = R.from_quat(conn_inst.quaternion)
to_rot = R.from_quat(rod_inst.quaternion)
from_origin = np.array(conn_inst.position, dtype=float)
to_origin = np.array(rod_inst.position, dtype=float)

from_port_world = from_origin + from_rot.apply(np.array(from_port.position, dtype=float))
to_port_world = to_origin + to_rot.apply(np.array(to_port.position, dtype=float))

print(f"\nWorld positions:")
print(f"  from_port_world: {from_port_world}")
print(f"  to_port_world: {to_port_world}")
print(f"  Distance between ports: {np.linalg.norm(from_port_world - to_port_world)}")

# Compute pivot
pivot_world = (from_port_world + to_port_world) * 0.5
print(f"  pivot_world (midpoint): {pivot_world}")

# Transform back to local frames
pivot_parent = from_rot.inv().apply(pivot_world - from_origin).tolist()
pivot_child = to_rot.inv().apply(pivot_world - to_origin).tolist()

print(f"\nLocal pivot positions:")
print(f"  pivot_parent (in connector frame): {pivot_parent}")
print(f"  pivot_child (in rod frame): {pivot_child}")

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

print(f"  Constraint ID: {constraint_id}")

# Verify constraint
state = p.getConstraintState(constraint_id)
print(f"  Constraint state: {state}")

# Run simulation
print("\nRunning simulation for 240 steps...")
for i in range(240):
    p.stepSimulation()

# Check final positions
conn_pos, conn_quat = p.getBasePositionAndOrientation(conn_body)
rod_pos, rod_quat = p.getBasePositionAndOrientation(rod_body)

print(f"\nFinal positions:")
print(f"  Connector: {conn_pos}")
print(f"  Rod: {rod_pos}")
print(f"  Distance moved (connector): {np.linalg.norm(np.array(conn_pos) - np.array(conn_inst.position))}")
print(f"  Distance moved (rod): {np.linalg.norm(np.array(rod_pos) - np.array(rod_inst.position))}")

# Check if they stayed together
dist_between = np.linalg.norm(np.array(conn_pos) - np.array(rod_pos))
expected_dist = np.linalg.norm(np.array(conn_inst.position) - np.array(rod_inst.position))
print(f"\nDistance between parts:")
print(f"  Initial: {expected_dist}")
print(f"  Final: {dist_between}")
print(f"  Change: {abs(dist_between - expected_dist)}")

if abs(dist_between - expected_dist) < 5.0:
    print("\nSUCCESS: Parts stayed connected!")
else:
    print("\nFAILURE: Parts detached!")

p.disconnect()
