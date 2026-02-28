#!/usr/bin/env python3
"""Test script to verify the physics constraint fix."""

import sys
sys.path.insert(0, '/c/Users/matt_/KNEX Forge/src')

from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.physics.pybullet import PyBulletSimulator
import numpy as np

def test_simple_connection():
    """Test that two connected parts stay together in simulation."""
    print("Loading part library...")
    library = PartLoader.load()
    
    # Get two simple parts
    connector = library.get("connector-4way-green-v1")
    rod = library.get("rod-16-green-v1")
    
    if not connector or not rod:
        print("ERROR: Could not load test parts")
        return False
    
    # Create a build with two connected parts
    build = Build()
    
    # Add connector at origin
    conn_inst = PartInstance(
        instance_id="connector-1",
        part=connector,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )
    build.add_part(conn_inst, record=False)
    
    # Add rod connected to port A of connector
    # Port A is at (12.7, 0, 0) with direction (1, 0, 0)
    rod_inst = PartInstance(
        instance_id="rod-1",
        part=rod,
        position=(25.4, 0.0, 0.0),  # Rod end1 should connect to connector port A
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )
    build.add_part(rod_inst, record=False)
    
    # Create connection
    conn = Connection(
        from_instance="connector-1",
        from_port="A",
        to_instance="rod-1",
        to_port="end1",
        joint_type="fixed"
    )
    build.connections.add(conn)
    build._graph.add_edge("connector-1", "rod-1", joint_type="fixed")
    
    print(f"Created build with {len(build.parts)} parts and {len(build.connections)} connections")
    
    # Run simulation
    print("Running PyBullet simulation...")
    try:
        with PyBulletSimulator(build) as sim:
            # Load parts
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id
                print(f"  Loaded {inst_id} as body {body_id}")
            
            # Create joints
            sim.create_joints()
            print(f"  Created {len(sim.joint_constraints)} joint constraints")
            
            # Run simulation for a bit
            result = sim.simulate(steps=120, movement_threshold=5.0)
            
            print(f"\nSimulation results:")
            print(f"  Score: {result.score}")
            print(f"  Unstable parts: {result.unstable_parts}")
            print(f"  Stress data: {result.stress_data}")
            
            if result.score > 0.5 and len(result.unstable_parts) == 0:
                print("\n✓ SUCCESS: Parts stayed connected!")
                return True
            else:
                print("\n✗ FAILURE: Parts detached during simulation")
                return False
                
    except Exception as e:
        print(f"ERROR during simulation: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_dataset_model():
    """Test with a real dataset model."""
    print("\n" + "="*60)
    print("Testing with dataset model proc_0000...")
    print("="*60)
    
    import json
    
    # Load first model from dataset
    with open('/c/Users/matt_/KNEX Forge/dataset.jsonl', 'r') as f:
        line = f.readline()
        data = json.loads(line)
    
    library = PartLoader.load()
    build = Build()
    
    # Reconstruct from actions
    for action in data['actions']:
        if action['action'] == 'add_part':
            part_def = library.get(action['part_id'])
            if not part_def:
                print(f"Warning: Part {action['part_id']} not found")
                continue
            
            inst = PartInstance(
                instance_id=action['instance_id'],
                part=part_def,
                position=tuple(action['position']),
                quaternion=tuple(action['quaternion']),
                color=action.get('color')
            )
            build.add_part(inst, record=False)
        
        elif action['action'] == 'snap':
            from_dot = action['from_port'].rfind('.')
            to_dot = action['to_port'].rfind('.')
            
            # Infer joint type
            joint_type = "fixed"
            if 'drive_axle' in action['from_port'] or 'drive_axle' in action['to_port']:
                joint_type = "revolute"
            
            conn = Connection(
                from_instance=action['from_port'][:from_dot],
                from_port=action['from_port'][from_dot+1:],
                to_instance=action['to_port'][:to_dot],
                to_port=action['to_port'][to_dot+1:],
                joint_type=joint_type
            )
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=joint_type)
    
    print(f"Loaded {len(build.parts)} parts and {len(build.connections)} connections")
    
    # Run simulation
    try:
        with PyBulletSimulator(build) as sim:
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id
            
            sim.create_joints()
            print(f"Created {len(sim.joint_constraints)} joint constraints")
            
            result = sim.simulate(steps=120, movement_threshold=10.0)
            
            print(f"\nSimulation results:")
            print(f"  Score: {result.score}")
            print(f"  Unstable parts: {len(result.unstable_parts)}")
            
            if result.score > 0.5:
                print("\n✓ SUCCESS: Model stayed mostly connected!")
                return True
            else:
                print("\n✗ FAILURE: Model fell apart")
                return False
                
    except Exception as e:
        print(f"ERROR during simulation: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("="*60)
    print("Testing Physics Constraint Fix")
    print("="*60)
    
    test1 = test_simple_connection()
    test2 = test_dataset_model()
    
    print("\n" + "="*60)
    print(f"Results: {sum([test1, test2])}/2 tests passed")
    print("="*60)
