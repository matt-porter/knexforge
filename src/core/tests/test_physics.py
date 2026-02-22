"""Tests for physics integration and stability scoring."""

import pytest

from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.physics.graph import compute_stability
from core.snapping import align_rod_to_hole


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def empty_build(library):
    return Build(library)


def _aligned_rod(library, connector_inst, port_id, instance_id="r1"):
    rod_part = library.get("rod-130-red-v1")
    temp = PartInstance(instance_id=instance_id, part=rod_part)
    new_pos, new_quat = align_rod_to_hole(temp, "end1", connector_inst, port_id)
    return PartInstance(instance_id=instance_id, part=rod_part, position=new_pos, quaternion=new_quat)


@pytest.fixture
def disconnected_build(library):
    build = Build(library)
    build.add_part(PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0)))
    build.add_part(PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 300)))
    return build


@pytest.fixture
def good_triangle(library):
    """Equilateral triangle: 3 connectors + 3 rods, all on the ground plane."""
    build = Build(library)
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0))
    c2 = PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(130, 0, 0))
    c3 = PartInstance(instance_id="c3", part=library.get("connector-3way-yellow-v1"), position=(65, 112.58, 0))

    r1 = _aligned_rod(library, c1, "A", "r1")
    r2 = _aligned_rod(library, c2, "B", "r2")
    r3 = _aligned_rod(library, c3, "B", "r3")

    build.add_part(c1)
    build.add_part(c2)
    build.add_part(c3)
    build.add_part(r1)
    build.add_part(r2)
    build.add_part(r3)

    # Wire connectivity manually — physics tests care about the graph, not snap geometry
    for from_id, to_id in [("r1", "c1"), ("r1", "c2"), ("r2", "c2"), ("r2", "c3"), ("r3", "c3"), ("r3", "c1")]:
        build._graph.add_edge(from_id, to_id)
        build.connections.add(Connection(from_instance=from_id, from_port="end1", to_instance=to_id, to_port="A"))

    return build


@pytest.fixture
def tall_tower(library):
    build = Build(library)
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0))
    c2 = PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 260))
    r1 = PartInstance(instance_id="r1", part=library.get("rod-192-grey-v1"), position=(0, 0, 130))
    build.add_part(c1)
    build.add_part(c2)
    build.add_part(r1)

    # Wire connectivity manually
    build._graph.add_edge("r1", "c1")
    build._graph.add_edge("r1", "c2")
    build.connections.add(Connection(from_instance="r1", from_port="end1", to_instance="c1", to_port="A"))
    build.connections.add(Connection(from_instance="r1", from_port="end2", to_instance="c2", to_port="A"))

    return build


def test_compute_stability_disconnected_is_zero(disconnected_build):
    assert compute_stability(disconnected_build) == 0.0


def test_compute_stability_good_triangle_high_score(good_triangle):
    score = compute_stability(good_triangle)
    assert 70 <= score <= 100.0


def test_compute_stability_tall_tower_lower_score(tall_tower):
    score = compute_stability(tall_tower)
    assert score < 65.0


def test_build_stability_score_calls_physics(empty_build, library):
    """Build.stability_score() delegates to the physics layer."""
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0))
    r1 = _aligned_rod(library, c1, "A")

    empty_build.add_part(c1)
    empty_build.add_part(r1)
    empty_build.attempt_snap("r1", "end1", "c1", "A")
    assert empty_build.stability_score() > 0.0
