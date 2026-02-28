#!/usr/bin/env python3
"""Debug script to inspect mesh loading and CoM."""

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

# Load a mesh
mesh_path = Path('C:/Users/matt_/KNEX Forge/parts/meshes/connector-4way-green.glb')
print(f"Loading mesh from: {mesh_path}")
print(f"  Exists: {mesh_path.exists()}")

if mesh_path.exists():
    mesh = trimesh.load_mesh(str(mesh_path), force='mesh')
    print(f"\nMesh info:")
    print(f"  Vertices: {len(mesh.vertices)}")
    print(f"  Faces: {len(mesh.faces)}")
    print(f"  Bounds: {mesh.bounds}")
    print(f"  Center mass: {mesh.center_mass}")
    print(f"  Extents: {mesh.extents}")
    
    # Create convex hull
    mesh_ch = mesh.convex_hull
    print(f"\nConvex hull:")
    print(f"  Vertices: {len(mesh_ch.vertices)}")
    print(f"  Center mass: {mesh_ch.center_mass}")
    
    # Create collision shape with vertices
    vertices = mesh_ch.vertices.tolist()
    print(f"\nCreating collision shape from {len(vertices)} vertices...")
    
    # Method 1: GEOM_MESH with vertices (what current code does)
    shape1 = p.createCollisionShape(
        p.GEOM_MESH,
        vertices=vertices,
    )
    print(f"  Shape ID (GEOM_MESH): {shape1}")
    
    # Get shape info
    shape_info = p.getCollisionShapeData(shape1)
    print(f"  Shape data: {shape_info}")
    
    # Create body at origin first to check local frame
    body1 = p.createMultiBody(
        baseMass=0.0018,  # 1.8 grams
        baseCollisionShapeIndex=shape1,
        basePosition=[0, 0, 10],
        baseOrientation=[0, 0, 0, 1]
    )
    
    print(f"\nBody info:")
    print(f"  Body ID: {body1}")
    print(f"  Position: {p.getBasePositionAndOrientation(body1)[0]}")
    
    # Get link state (for base, linkIndex=-1)
    link_state = p.getLinkState(body1, -1)
    print(f"  Link state (world frame): {link_state[:2]}")
    
    # Get mass info
    mass, local_inertia, contact_df, elasticity, friction, rolling_friction, spinning_friction = p.getDynamicsInfo(body1, -1)
    print(f"  Mass: {mass}")
    
    # Run simulation for a bit
    print("\nRunning simulation...")
    for _ in range(120):
        p.stepSimulation()
    
    final_pos, final_quat = p.getBasePositionAndOrientation(body1)
    print(f"  Final position: {final_pos}")
    print(f"  Dropped by: {10 - final_pos[2]} mm")
    
    # Now test with GEOM_CONVEX instead
    print("\n" + "="*60)
    print("Testing with GEOM_CONVEX...")
    
    # Reset
    p.removeBody(body1)
    
    # Create convex hull shape using GEOM_CONVEX
    shape2 = p.createCollisionShape(
        p.GEOM_CONVEX,
        vertices=vertices
    )
    print(f"  Shape ID (GEOM_CONVEX): {shape2}")
    
    body2 = p.createMultiBody(
        baseMass=0.0018,
        baseCollisionShapeIndex=shape2,
        basePosition=[0, 0, 10],
        baseOrientation=[0, 0, 0, 1]
    )
    
    print(f"  Body ID: {body2}")
    print(f"  Initial position: {p.getBasePositionAndOrientation(body2)[0]}")
    
    # Run simulation
    for _ in range(120):
        p.stepSimulation()
    
    final_pos2, _ = p.getBasePositionAndOrientation(body2)
    print(f"  Final position: {final_pos2}")
    print(f"  Dropped by: {10 - final_pos2[2]} mm")

p.disconnect()
print("\nDone!")
