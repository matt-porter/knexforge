"""TDD tests for physics integration and stability_score definition."""

import pytest

from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance
from core.physics.graph import compute_stability


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def disconnected_build(library):
    build = Build(library)
    build.add_part(PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0)))
    build.add_part(PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 300)))
    return build


@pytest.fixture
def good_triangle(library):
    build = Build(library)
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0))
    c2 = PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(130, 0, 0))
    c3 = PartInstance(instance_id="c3", part=library.get("connector-3way-yellow-v1"), position=(65, 112.58, 0))
    r1 = PartInstance(instance_id="r1", part=library.get("rod-130-red-v1"), position=(0, 0, 0))
    r2 = PartInstance(instance_id="r2", part=library.get("rod-130-red-v1"), position=(65, 112.58, 0))
    r3 = PartInstance(instance_id="r3", part=library.get("rod-130-red-v1"), position=(0, 0, 0))
    build.add_part(c1); build.add_part(c2); build.add_part(c3)
    build.add_part(r1); build.add_part(r2); build.add_part(r3)
    build.attempt_snap("r1", "end1", "c1", "A")
    build.attempt_snap("r1", "end2", "c2", "A")
    build.attempt_snap("r2", "end1", "c2", "B")
    build.attempt_snap("r2", "end2", "c3", "A")
    build.attempt_snap("r3", "end1", "c3", "B")
    build.attempt_snap("r3", "end2", "c1", "B")
    return build


@pytest.fixture
def tall_tower(library):
    build = Build(library)
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 0))
    c2 = PartInstance(instance_id="c2", part=library.get("connector-3way-yellow-v1"), position=(0, 0, 260))
    r1 = PartInstance(instance_id="r1", part=library.get("rod-192-grey-v1"), position=(0, 0, 0))
    build.add_part(c1)
    build.add_part(c2)
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")
    build.attempt_snap("r1", "end2", "c2", "A")
    return build


def test_compute_stability_disconnected_is_zero(disconnected_build):
    assert compute_stability(disconnected_build) == 0.0


def test_compute_stability_good_triangle_high_score(good_triangle):
    score = compute_stability(good_triangle)
    assert 85 <= score <= 100.0


def test_compute_stability_tall_tower_lower_score(tall_tower):
    score = compute_stability(tall_tower)
    assert score < 65.0   # tall & narrow = penalty


def test_build_stability_score_calls_physics(empty_build, library):
    """Build.stability_score() now delegates to the physics layer."""
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-yellow-v1"), position=(0,0,0))
    r1 = PartInstance(instance_id="r1", part=library.get("rod-130-red-v1"), position=(0,0,0))
    empty_build.add_part(c1)
    empty_build.add_part(r1)
    empty_build.attempt_snap("r1", "end1", "c1", "A")
    assert empty_build.stability_score() > 0.0