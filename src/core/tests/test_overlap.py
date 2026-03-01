"""Tests for part overlap detection logic."""

import pytest
import numpy as np
from core.parts.loader import PartLoader
from core.parts.models import PartInstance
from core.snapping import check_part_overlap

@pytest.fixture
def library(clean_part_library):
    return clean_part_library

@pytest.fixture
def green_connector(library):
    part = library.get("connector-4way-green-v1")
    return PartInstance(instance_id="c1", part=part, position=(0.0, 0.0, 0.0))

@pytest.fixture
def red_rod(library):
    part = library.get("rod-128-red-v1")
    # Rod-128 is 128mm long. Starts at origin, goes along X.
    return PartInstance(instance_id="r1", part=part, position=(0.0, 0.0, 0.0))

def test_check_part_overlap_rod_vs_rod(library):
    rod_part = library.get("rod-128-red-v1")
    r1 = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))
    # Parallel rod 2mm apart (clearance is 3mm)
    r2 = PartInstance(instance_id="r2", part=rod_part, position=(0.0, 2.0, 0.0))
    
    existing = {"r1": r1}
    assert check_part_overlap(r2, existing, set()) is False, "Parallel rods too close should overlap"
    
    # Far away rod
    r3 = PartInstance(instance_id="r3", part=rod_part, position=(0.0, 10.0, 0.0))
    assert check_part_overlap(r3, existing, set()) is True, "Far rods should not overlap"

def test_check_part_overlap_connector_vs_connector(library):
    conn_part = library.get("connector-4way-green-v1")
    c1 = PartInstance(instance_id="c1", part=conn_part, position=(0.0, 0.0, 0.0))
    # Connector 10mm away (clearance is 15mm)
    c2 = PartInstance(instance_id="c2", part=conn_part, position=(10.0, 0.0, 0.0))
    
    existing = {"c1": c1}
    assert check_part_overlap(c2, existing, set()) is False, "Connectors too close should overlap"
    
    # Far away connector
    c3 = PartInstance(instance_id="c3", part=conn_part, position=(30.0, 0.0, 0.0))
    assert check_part_overlap(c3, existing, set()) is True, "Far connectors should not overlap"

def test_check_part_overlap_rod_vs_connector_detected(library):
    """Confirm the bug is fixed: rod vs connector overlap is now detected."""
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")
    
    # Connector at (50, 0, 0)
    c1 = PartInstance(instance_id="c1", part=conn_part, position=(50.0, 0.0, 0.0))
    
    # Rod passing right through the connector's center
    r1 = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))
    
    existing_conn = {"c1": c1}
    # Should detect overlap
    assert check_part_overlap(r1, existing_conn, set()) is False, "Rod passing through connector center should overlap"
    
    # The other way: placing connector on rod
    existing_rod = {"r1": r1}
    assert check_part_overlap(c1, existing_rod, set()) is False, "Connector placed on rod should overlap"

def test_check_part_overlap_rod_near_connector_clearance(library):
    """Test the clearance threshold for rod vs connector center."""
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")
    
    # Connector at (50, 0, 0)
    c1 = PartInstance(instance_id="c1", part=conn_part, position=(50.0, 0.0, 0.0))
    
    # Rod passing nearby (parallel to X at Y=10)
    # Distance from (50,0,0) to line Y=10 is 10mm.
    # Clearance = 15.0 * 0.7 + 3.0 = 13.5mm.
    # So Y=10 should still be detected as overlap.
    r_near = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 10.0, 0.0))
    
    existing = {"c1": c1}
    assert check_part_overlap(r_near, existing, set()) is False, "Rod passing 10mm from connector center should overlap (threshold 13.5)"
    
    # Rod passing far away (Y=20)
    r_far = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 20.0, 0.0))
    assert check_part_overlap(r_far, existing, set()) is True, "Rod passing 20mm from connector center should NOT overlap"
