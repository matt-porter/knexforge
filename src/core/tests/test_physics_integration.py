import pytest
import os
import json
from pathlib import Path
import numpy as np

# Use absolute imports from core
from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection

# Only import pybullet if available
try:
    import pybullet as p
    from core.physics.pybullet import PyBulletSimulator
    PYBULLET_AVAILABLE = True
except ImportError:
    PYBULLET_AVAILABLE = False

@pytest.mark.skipif(not PYBULLET_AVAILABLE, reason="pybullet not installed")
class TestPhysicsIntegration:
    """Integration tests for PyBullet physics simulation."""

    @pytest.fixture
    def library(self):
        return PartLoader.load()

    def test_simple_connection_stability(self, library):
        """Test that two connected parts stay together in simulation."""
        connector = library.get("connector-4way-green-v1")
        rod = library.get("rod-16-green-v1")
        
        assert connector is not None
        assert rod is not None
        
        build = Build()
        
        # Add connector at origin
        conn_inst = PartInstance(
            instance_id="connector-1",
            part=connector,
            position=(0.0, 0.0, 50.0), # Lifted
            quaternion=(0.0, 0.0, 0.0, 1.0),
        )
        build.add_part(conn_inst, record=False)
        
        # Add rod connected to port A of connector
        # Port A is at (12.7, 0, 0) with direction (1, 0, 0)
        rod_inst = PartInstance(
            instance_id="rod-1",
            part=rod,
            position=(25.4, 0.0, 50.0),
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
        # Manually add to graph since we skipped record=True
        build._graph.add_edge("connector-1", "rod-1", joint_type="fixed")
        
        # Run simulation
        with PyBulletSimulator(build) as sim:
            # Set gravity to Y-up as fixed in recent review
            p.setGravity(0, -9.81, 0, physicsClientId=sim.client)
            
            for inst_id, part_inst in build.parts.items():
                sim.part_bodies[inst_id] = sim.load_part_mesh(part_inst)
            
            sim.create_joints()
            
            # Run simulation
            result = sim.simulate(steps=120, movement_threshold=5.0)
            
            # Parts should stay together (score 1.0)
            assert result.score > 0.5
            assert len(result.unstable_parts) == 0

    def test_dataset_model_stability(self, library):
        """Test stability of the motorized spinner model from the dataset."""
        dataset_path = Path(__file__).parent.parent.parent.parent / "dataset.jsonl"
        if not dataset_path.exists():
            pytest.skip("dataset.jsonl not found")
            
        with open(dataset_path, 'r') as f:
            line = f.readline()
            data = json.loads(line)
            
        build = Build()
        
        # Reconstruct from actions
        for action in data['actions']:
            if action['action'] == 'add_part':
                part_def = library.get(action['part_id'])
                if not part_def:
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
                
                # Infer joint type (revolute for motor)
                joint_type = "fixed"
                from_port = action['from_port'][from_dot+1:]
                to_port = action['to_port'][to_dot+1:]

                # Motor-v1 uses 'drive_axle' instead of 'center'
                if from_port == "center" and "motor" in action['from_port']:
                    from_port = "drive_axle"
                if to_port == "center" and "motor" in action['to_port']:
                    to_port = "drive_axle"

                if 'drive_axle' in from_port or 'drive_axle' in to_port:
                    joint_type = "revolute"

                conn = Connection(
                    from_instance=action['from_port'][:from_dot],
                    from_port=from_port,
                    to_instance=action['to_port'][:to_dot],
                    to_port=to_port,
                    joint_type=joint_type
                )

                build.connections.add(conn)
                build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=joint_type)
        
        # Run simulation
        with PyBulletSimulator(build) as sim:
            # Set gravity to Y-up
            p.setGravity(0, -9.81, 0, physicsClientId=sim.client)
            
            for inst_id, part_inst in build.parts.items():
                sim.part_bodies[inst_id] = sim.load_part_mesh(part_inst)
            
            sim.create_joints()
            
            # The motorized spinner is a mechanism, so it should be mostly stable 
            # (ignoring the spinning rod itself)
            result = sim.simulate(steps=120, movement_threshold=20.0)
            
            # Should have a decent stability score
            assert result.score > 0.0
