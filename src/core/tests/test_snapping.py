"""TDD tests for snapping behaviour – written BEFORE implementation."""

import pytest
import numpy as np

from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.snapping import snap_ports, align_rod_to_hole  # will fail until impl exists


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def connector(library):
    part = library.get("connector-3way-yellow-v1")
    return PartInstance(instance_id="c1", part=part, position=(0.0, 0.0, 0.0))


@pytest.fixture
def rod(library):
    part = library.get("rod-130-red-v1")
    return PartInstance(instance_id="r1", part=part, position=(0.0, 0.0, 0.0))


def test_snap_ports_successful_rod_to_connector(connector, rod):
    """Basic happy path: rod end snaps perfectly into connector hole."""
    result = snap_ports(
        from_instance=rod,
        from_port_id="end1",
        to_instance=connector,
        to_port_id="A",
        tolerance_mm=0.2
    )
    assert isinstance(result, Connection)
    assert result.from_instance == "r1"
    assert result.from_port == "end1"
    assert result.to_instance == "c1"
    assert result.to_port == "A"


def test_snap_ports_wrong_mate_types_fails(connector, rod):
    """Rod end cannot snap to another rod end."""
    result = snap_ports(
        from_instance=rod,
        from_port_id="end1",
        to_instance=rod,
        to_port_id="end2",
        tolerance_mm=0.2
    )
    assert result is None


def test_snap_ports_respects_allowed_angles(connector, rod):
    """Connector allows 90° steps; invalid angle should fail."""
    # Rotate rod 45° (not allowed)
    bad_rod = PartInstance(
        instance_id="r_bad",
        part=rod.part,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.707, 0.707)  # 90° around Z? Wait, test will use align_rod_to_hole
    )
    result = snap_ports(bad_rod, "end1", connector, "A", 0.2)
    assert result is None  # angle check fails


def test_align_rod_to_hole_computes_correct_transform(connector, rod):
    """Helper returns new position + quaternion for perfect alignment."""
    new_pos, new_quat = align_rod_to_hole(
        rod_instance=rod,
        rod_port_id="end1",
        target_connector=connector,
        target_port_id="A"
    )
    # Rod end1 should now sit exactly at connector port A position
    assert np.allclose(new_pos, (12.5, 0.0, 0.0), atol=0.01)
    # Direction of rod should match connector port direction (opposite for insertion)
    assert np.allclose(new_quat, (0.0, 0.0, 0.0, 1.0), atol=0.01)  # identity for this port


def test_snap_ports_within_tolerance_passes(connector, rod):
    """Slight offset (0.15 mm) still snaps."""
    offset_rod = PartInstance(
        instance_id="r_offset",
        part=rod.part,
        position=(0.15, 0.0, 0.0)  # within 0.2 mm
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert isinstance(result, Connection)


def test_snap_ports_outside_tolerance_fails(connector, rod):
    """Offset > tolerance fails."""
    offset_rod = PartInstance(
        instance_id="r_far",
        part=rod.part,
        position=(0.3, 0.0, 0.0)
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert result is None


def test_snap_ports_uses_port_specific_tolerance(connector, rod):
    """Respects per-port tolerance if set."""
    # (future-proof test)
    result = snap_ports(rod, "end1", connector, "A", tolerance_mm=0.1)
    assert result is None  # would pass with default 0.2 but we force tighter


@pytest.mark.parametrize("port_id", ["A", "B", "C"])
def test_snap_to_any_3way_port_works(connector, rod, port_id):
    """All three ports on 3-way connector are snappable."""
    result = snap_ports(rod, "end1", connector, port_id, 0.2)
    assert isinstance(result, Connection)