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
    part = library.get("connector-4way-green-v1")
    return PartInstance(instance_id="c1", part=part, position=(0.0, 0.0, 0.0))


@pytest.fixture
def rod(library):
    return library.get("rod-128-red-v1")


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
        position=(12.7, 0.0, 0.0),
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
    assert np.allclose(new_pos, (12.7, 0.0, 0.0), atol=0.01)
    assert np.allclose(new_quat, (0.0, 0.0, 0.0, 1.0), atol=0.01)


def test_snap_ports_within_tolerance_passes(connector, rod):
    """Slight offset (0.15 mm) still snaps within 0.2 mm tolerance."""
    offset_rod = PartInstance(
        instance_id="r_offset",
        part=rod,
        position=(12.85, 0.0, 0.0),  # end1 at 12.85 vs port A at 12.7 → 0.15 mm
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert isinstance(result, Connection)


def test_snap_ports_outside_tolerance_fails(connector, rod):
    """Offset > tolerance fails."""
    far_rod = PartInstance(
        instance_id="r_far",
        part=rod,
        position=(13.0, 0.0, 0.0),  # end1 at 13.0 vs port A at 12.7 → 0.3 mm
    )
    result = snap_ports(far_rod, "end1", connector, "A", tolerance_mm=0.2)
    assert result is None


def test_snap_ports_uses_port_specific_tolerance(connector, rod):
    """0.15 mm offset passes with 0.2 tolerance but fails with 0.1."""
    offset_rod = PartInstance(
        instance_id="r_tight",
        part=rod,
        position=(12.85, 0.0, 0.0),  # 0.15 mm offset
    )
    result = snap_ports(offset_rod, "end1", connector, "A", tolerance_mm=0.1)
    assert result is None


@pytest.mark.parametrize("port_id", ["A", "B", "C"])
def test_snap_to_first_three_ports_of_4way_green(connector, rod, port_id):
    """Ports A, B, C on the green 4-way connector are each snappable when properly aligned."""
    aligned = _aligned_rod(rod, connector, port_id)
    result = snap_ports(aligned, "end1", connector, port_id, 0.2)
    assert isinstance(result, Connection)


@pytest.mark.parametrize("port_id", ["A", "B", "C"])
def test_snap_to_all_ports_of_3way_red_connector(library, rod, port_id):
    """All three edge ports (A=0 deg, B=45 deg, C=90 deg) on the red 3-way connector snap correctly."""
    conn_part = library.get("connector-3way-red-v1")
    conn_inst = PartInstance(instance_id="c_red", part=conn_part, position=(0.0, 0.0, 0.0))
    aligned = _aligned_rod(rod, conn_inst, port_id)
    result = snap_ports(aligned, "end1", conn_inst, port_id, 0.2)
    assert isinstance(result, Connection)


# ---------------------------------------------------------------------------
# Side-on (rod_side) snapping tests
# ---------------------------------------------------------------------------


def test_side_clip_connector_onto_rod_succeeds(library):
    """A connector edge port can side-clip onto a rod's center_tangent port."""
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")

    rod_inst = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))

    # Use align_part_to_port to compute exact transform for connector port A
    # onto rod center_tangent, twisted 90° so rod axis is parallel to connector Z
    from core.snapping import align_part_to_port

    conn_temp = PartInstance(instance_id="c1", part=conn_part)
    new_pos, new_quat = align_part_to_port(
        conn_temp, "A", rod_inst, "center_tangent_y_pos", twist_deg=0.0,
    )
    conn_inst = PartInstance(
        instance_id="c1", part=conn_part, position=new_pos, quaternion=new_quat,
    )

    result = snap_ports(conn_inst, "A", rod_inst, "center_tangent_y_pos", tolerance_mm=0.2)
    assert isinstance(result, Connection)
    assert result.from_port == "A"
    assert result.to_port == "center_tangent_y_pos"


@pytest.mark.parametrize(
    "rod_side_port_id, expected_twist",
    [
        ("center_tangent_y_pos", 0.0),
        ("center_tangent_y_neg", 0.0),
        ("center_tangent_z_pos", 0.0),
        ("center_tangent_z_neg", 0.0),
    ],
)
def test_side_clip_connector_onto_explicit_rod_sides_succeeds(library, rod_side_port_id, expected_twist):
    """Connector edge ports can snap to all explicit rod-side ports with correct orientation."""
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")

    rod_inst = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))

    from core.snapping import align_part_to_port

    conn_temp = PartInstance(instance_id="c1", part=conn_part)
    new_pos, new_quat = align_part_to_port(
        conn_temp,
        "A",
        rod_inst,
        rod_side_port_id,
        twist_deg=expected_twist,
    )
    conn_inst = PartInstance(
        instance_id="c1",
        part=conn_part,
        position=new_pos,
        quaternion=new_quat,
    )

    result = snap_ports(conn_inst, "A", rod_inst, rod_side_port_id, tolerance_mm=0.2)
    assert isinstance(result, Connection)
    assert result.from_port == "A"
    assert result.to_port == rod_side_port_id


def test_side_clip_rod_side_compat_with_connector_hole(library):
    """rod_side mate type is compatible with rod_hole accepts list."""
    rod_part = library.get("rod-54-blue-v1")
    conn_part = library.get("connector-8way-white-v1")

    tangent = next(p for p in rod_part.ports if p.id == "center_tangent")
    port_n = next(p for p in conn_part.ports if p.id == "N")

    # rod_side ∈ rod_hole.accepts
    assert tangent.mate_type == "rod_side"
    assert tangent.mate_type in port_n.accepts

    # rod_hole ∈ rod_side.accepts
    assert port_n.mate_type == "rod_hole"
    assert port_n.mate_type in tangent.accepts


def test_align_part_to_port_side_clip(library):
    """align_part_to_port places connector at correct offset for side-on clip."""
    from core.snapping import align_part_to_port

    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")

    rod_inst = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))
    conn_temp = PartInstance(instance_id="c1", part=conn_part)

    new_pos, new_quat = align_part_to_port(
        conn_temp, "A", rod_inst, "center_tangent_y_pos", twist_deg=90.0,
    )

    # Connector port A should be at the rod's center_tangent position (64, 0, 0)
    # after the transform
    from scipy.spatial.transform import Rotation as R

    rot = R.from_quat(new_quat)
    port_a_local = np.array([12.7, 0.0, 0.0])
    port_a_world = np.array(new_pos) + rot.apply(port_a_local)
    assert np.allclose(port_a_world, [64.0, 0.0, 0.0], atol=0.01)


def test_side_clip_wrong_direction_fails(library):
    """Side clip fails when connector is not aligned to rod's tangent direction."""
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")

    rod_inst = PartInstance(instance_id="r1", part=rod_part, position=(0.0, 0.0, 0.0))

    # Place connector at the right position but with a badly rotated orientation
    # (90° off from the needed direction alignment)
    conn_inst = PartInstance(
        instance_id="c1",
        part=conn_part,
        position=(51.3, 0.0, 0.0),  # port A at (64, 0, 0) = center_tangent pos
        quaternion=(0.0, 0.0, 0.0, 1.0),  # identity = port A points [1,0,0]
    )
    # Rod center_tangent direction is [0,1,0], so connector port A direction [1,0,0]
    # doesn't anti-align with it → should fail the direction check
    result = snap_ports(conn_inst, "A", rod_inst, "center_tangent_y_pos", tolerance_mm=0.2)
    assert result is None


def test_joint_type_determination(library):
    """Verify that different MateTypes result in the correct joint_type (Phase 1 Kinematics)."""
    # Create copies of standard parts but tweak their mate_types to test the logic
    rod_part = library.get("rod-128-red-v1")
    conn_part = library.get("connector-4way-green-v1")

    # We only care about the joint_type assigned when `snap_ports` succeeds.
    # Let's set up a successful snap using standard parts
    from core.snapping import align_rod_to_hole
    conn_inst = PartInstance(instance_id="c1", part=conn_part, position=(0.0, 0.0, 0.0))
    
    # Standard rigid hole (rod_end into rod_hole) -> should be fixed
    temp = PartInstance(instance_id="r1", part=rod_part)
    new_pos, new_quat = align_rod_to_hole(temp, "end1", conn_inst, "A")
    rod_inst = PartInstance(instance_id="r1", part=rod_part, position=new_pos, quaternion=new_quat)
    
    conn_fixed = snap_ports(rod_inst, "end1", conn_inst, "A", 0.2)
    assert conn_fixed is not None
    assert conn_fixed.joint_type == "fixed"

    # Now let's artificially change the mate_type of port A on the connector instance
    # to 'rotational_hole' and rod's end1 to accept it.
    # Since models are frozen, we have to bypass validation or copy.
    # It's easier to just call snap_ports on slightly mutated part copies.
    rod_mutated = rod_part.model_copy(update={
        "ports": [p.model_copy(update={"accepts": p.accepts + ["rotational_hole", "slider_hole"]}) for p in rod_part.ports]
    })
    conn_mutated = conn_part.model_copy(update={
        "ports": [p.model_copy(update={"mate_type": "rotational_hole"}) if p.id == "A" else p for p in conn_part.ports]
    })
    
    conn_inst2 = PartInstance(instance_id="c1", part=conn_mutated, position=(0.0, 0.0, 0.0))
    rod_inst2 = PartInstance(instance_id="r1", part=rod_mutated, position=new_pos, quaternion=new_quat)

    conn_revolute = snap_ports(rod_inst2, "end1", conn_inst2, "A", 0.2)
    assert conn_revolute is not None
    assert conn_revolute.joint_type == "revolute"

    conn_mutated_slide = conn_part.model_copy(update={
        "ports": [p.model_copy(update={"mate_type": "slider_hole"}) if p.id == "A" else p for p in conn_part.ports]
    })
    conn_inst3 = PartInstance(instance_id="c1", part=conn_mutated_slide, position=(0.0, 0.0, 0.0))
    conn_prismatic = snap_ports(rod_inst2, "end1", conn_inst3, "A", 0.2)
    assert conn_prismatic is not None
    assert conn_prismatic.joint_type == "prismatic"
