"""Tests for joint type inference and physics constraints."""

import pytest
import numpy as np
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.snapping import snap_ports, infer_joint_type
from core.build import Build

@pytest.fixture
def library(clean_part_library):
    return clean_part_library

def test_infer_joint_type_center_axial(library):
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")
    
    # Port center_axial_1 (id: center_axial_1)
    rod_port = next(p for p in rod_part.ports if p.id == "center_axial_1")
    # Port center (id: center)
    conn_port = next(p for p in conn_part.ports if p.id == "center")
    
    joint = infer_joint_type(rod_port, conn_port)
    assert joint == "revolute", f"Rods through center holes should be revolute, got {joint}"

def test_snap_ports_center_axial_is_revolute(library):
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")
    
    r1 = PartInstance(instance_id="r1", part=rod_part, position=(0,0,0))
    # Align rod center_axial_1 to connector center
    # Connector center at (0,0,0), rod center_axial_1 at (64,0,0)
    # To align, rod should be at (-64,0,0)
    # Also need to align directions: rod center_axial_1 points -X, connector center points +Z.
    from core.snapping import align_part_to_port
    c1_temp = PartInstance(instance_id="c1", part=conn_part)
    new_pos, new_quat = align_part_to_port(c1_temp, "center", r1, "center_axial_1")
    c1 = PartInstance(instance_id="c1", part=conn_part, position=new_pos, quaternion=new_quat)
    
    conn = snap_ports(c1, "center", r1, "center_axial_1", 0.2)
    assert conn is not None
    assert conn.joint_type == "revolute", "Rod through center hole should result in a revolute connection"

def test_undo_redo_preserves_joint_type(library):
    """Ensure that undo/redo correctly restores the inferred joint type."""
    build = Build(library)
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")
    
    r1 = PartInstance(instance_id="r1", part=rod_part, position=(0,0,0))
    build.add_part(r1)
    
    # Connector aligned to center_axial_1
    from core.snapping import align_part_to_port
    c1_temp = PartInstance(instance_id="c1", part=conn_part)
    new_pos, new_quat = align_part_to_port(c1_temp, "center", r1, "center_axial_1")
    c1 = PartInstance(instance_id="c1", part=conn_part, position=new_pos, quaternion=new_quat)
    build.add_part(c1)
    
    # Snap
    build.attempt_snap("c1", "center", "r1", "center_axial_1")
    
    assert list(build.connections)[0].joint_type == "revolute"
    assert build._graph.get_edge_data("c1", "r1")["joint_type"] == "revolute"
    
    # Undo
    build.undo() # undone Snap
    assert len(build.connections) == 0
    
    # Redo
    build.redo() # redone Snap
    assert len(build.connections) == 1
    assert list(build.connections)[0].joint_type == "revolute", "Redone snap should have revolute joint_type"
    assert build._graph.get_edge_data("c1", "r1")["joint_type"] == "revolute"
