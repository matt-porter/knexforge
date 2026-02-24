"""Tests for the central Build class."""

import pytest

from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.snapping import align_rod_to_hole


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def empty_build(library):
    return Build(library)


def _aligned_rod(library, connector_inst, port_id, instance_id="r1"):
    """Create a rod aligned to a connector port."""
    rod_part = library.get("rod-128-red-v1")
    temp = PartInstance(instance_id=instance_id, part=rod_part)
    new_pos, new_quat = align_rod_to_hole(temp, "end1", connector_inst, port_id)
    return PartInstance(instance_id=instance_id, part=rod_part, position=new_pos, quaternion=new_quat)


def test_build_starts_empty(empty_build):
    assert len(empty_build.parts) == 0
    assert len(empty_build.connections) == 0
    assert empty_build.stability_score() == 100.0


def test_add_part_increases_count(empty_build, library):
    connector = PartInstance(
        instance_id="c1",
        part=library.get("connector-4way-green-v1"),
    )
    empty_build.add_part(connector)
    assert len(empty_build.parts) == 1
    assert "c1" in empty_build.parts


def test_attempt_snap_successful(empty_build, library):
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    rod = _aligned_rod(library, c1, "A")

    empty_build.add_part(c1)
    empty_build.add_part(rod)

    conn = empty_build.attempt_snap("r1", "end1", "c1", "A")
    assert isinstance(conn, Connection)
    assert len(empty_build.connections) == 1
    assert empty_build.is_connected("r1", "c1")


def test_attempt_snap_fails_on_invalid_mate(empty_build, library):
    rod_part = library.get("rod-128-red-v1")
    rod1 = PartInstance(instance_id="r1", part=rod_part)
    rod2 = PartInstance(instance_id="r2", part=rod_part)

    empty_build.add_part(rod1)
    empty_build.add_part(rod2)

    conn = empty_build.attempt_snap("r1", "end1", "r2", "end2")
    assert conn is None
    assert len(empty_build.connections) == 0


def test_remove_part_cleans_connections(empty_build, library):
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    r1 = _aligned_rod(library, c1, "A")

    empty_build.add_part(c1)
    empty_build.add_part(r1)
    conn = empty_build.attempt_snap("r1", "end1", "c1", "A")
    assert conn is not None

    empty_build.remove_part("r1")
    assert len(empty_build.parts) == 1
    assert len(empty_build.connections) == 0


def test_get_connected_parts(empty_build, library):
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    r1 = _aligned_rod(library, c1, "A", instance_id="r1")
    r2 = _aligned_rod(library, c1, "B", instance_id="r2")

    empty_build.add_part(c1)
    empty_build.add_part(r1)
    empty_build.add_part(r2)
    empty_build.attempt_snap("r1", "end1", "c1", "A")
    empty_build.attempt_snap("r2", "end1", "c1", "B")

    connected = empty_build.get_connected_parts("c1")
    assert len(connected) == 2
    assert "r1" in connected and "r2" in connected


def test_build_to_dict_and_from_dict_roundtrip(empty_build, library):
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    r1 = _aligned_rod(library, c1, "A")

    empty_build.add_part(c1)
    empty_build.add_part(r1)
    empty_build.attempt_snap("r1", "end1", "c1", "A")

    data = empty_build.to_dict()
    rebuilt = Build.from_dict(data, library)

    assert len(rebuilt.parts) == 2
    assert len(rebuilt.connections) == 1
    assert rebuilt.stability_score() == empty_build.stability_score()


def test_stability_score_defaults_to_100_and_updates_with_physics_placeholder(empty_build):
    assert empty_build.stability_score() == 100.0
    empty_build._stability_score = 87.5
    assert empty_build.stability_score() == 87.5
