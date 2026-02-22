"""Tests for snapping behaviour — uses correct port geometry."""

import pytest
import numpy as np

from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.snapping import snap_ports, align_rod_to_hole


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def connector(library):
    part = library.get("connector-3way-yellow-v1")
    return PartInstance(instance_id="c1", part=part, position=(0.0, 0.0, 0.0))


@pytest.fixture
def rod(library):
    return library.get("rod-130-red-v1")


def _aligned_rod(rod_part, connector_inst, port_id, instance_id="r1"):
    """Create a rod perfectly aligned to a connector port."""
    temp = PartInstance(instance_id=instance_id, part=rod_part)
    new_pos, new_quat = align_rod_to_hole(temp, "end1", connector_inst, port_id)
    return PartInstance(instance_id=instance_id, part=rod_part, position=new_pos, quaternion=new_quat)


def test_snap_ports_successful_rod_to_connector(connector, rod):
    """Basic happy path: rod end snaps perfectly into connector hole."""
    aligned = _aligned_rod(rod, connector, "A")
    result = snap_ports(
        from_instance=aligned,
        from_port_id="end1",
        to_instance=connector,
        to_port_id="A",
        tolerance_mm=0.2,
    )
    assert isinstance(result, Connection)
    assert result.from_instance == "r1"
    assert result.from_port == "end1"
    assert result.to_instance == "c1"
    assert result.to_port == "A"


def test_snap_ports_wrong_mate_types_fails(connector, rod):
    """Rod end cannot snap to another rod end."""
    r1 = PartInstance(instance_id="r1", part=rod)
    r2 = PartInstance(instance_id="r2", part=rod)
    result = snap_ports(r1, "end1", r2, "end2", tolerance_mm=0.2)
    assert result is None


def test_snap_ports_respects_allowed_angles(connector, rod):
    """Position is correct but direction is wrong — angle check should reject."""
    # Rod at port A position but rotated 90° around Z (wrong direction)
    bad_rod = PartInstance(
        instance_id="r_bad",
        part=rod,
        position=(12.5, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.707, 0.707),
    )
    result = snap_ports(bad_rod, "end1", connector, "A", 0.2)
    assert result is None


def test_align_rod_to_hole_computes_correct_transform(connector, rod):
    """Helper returns new position + quaternion for perfect alignment."""
    temp = PartInstance(instance_id="r1", part=rod)
    new_pos, new_quat = align_rod_to_hole(
        rod_instance=temp,
        rod_port_id="end1",
        target_connector=connector,
        target_port_id="A",
    )
    assert np.allclose(new_pos, (12.5, 0.0, 0.0), atol=0.01)
    assert np.allclose(new_quat, (0.0, 0.0, 0.0, 1.0), atol=0.01)


def test_snap_ports_within_tolerance_passes(connector, rod):
    """Slight offset (0.15 mm) still snaps within 0.2 mm tolerance."""
    offset_rod = PartInstance(
        instance_id="r_offset",
        part=rod,
        position=(12.65, 0.0, 0.0),  # end1 at 12.65 vs port A at 12.5 → 0.15 mm
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert isinstance(result, Connection)


def test_snap_ports_outside_tolerance_fails(connector, rod):
    """Offset > tolerance fails."""
    far_rod = PartInstance(
        instance_id="r_far",
        part=rod,
        position=(12.8, 0.0, 0.0),  # end1 at 12.8 vs port A at 12.5 → 0.3 mm
    )
    result = snap_ports(far_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert result is None


def test_snap_ports_uses_port_specific_tolerance(connector, rod):
    """0.15 mm offset passes with 0.2 tolerance but fails with 0.1."""
    offset_rod = PartInstance(
        instance_id="r_tight",
        part=rod,
        position=(12.65, 0.0, 0.0),  # 0.15 mm offset
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.1)
    assert result is None


@pytest.mark.parametrize("port_id", ["A", "B", "C"])
def test_snap_to_any_3way_port_works(connector, rod, port_id):
    """All three ports on 3-way connector are snappable when properly aligned."""
    aligned = _aligned_rod(rod, connector, port_id)
    result = snap_ports(aligned, "end1", connector, port_id, 0.2)
    assert isinstance(result, Connection)
