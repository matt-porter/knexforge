"""Tests for .knx file save/load round-trip."""

import json
import zipfile
from pathlib import Path

import pytest

from core.build import Build
from core.file_io import Manifest, load_knx, save_knx
from core.parts.models import Connection, PartInstance
from core.snapping import align_rod_to_hole


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


@pytest.fixture
def sample_build(library):
    """A small build: one connector + one rod snapped together."""
    build = Build()
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    rod_part = library.get("rod-128-red-v1")
    temp = PartInstance(instance_id="r1", part=rod_part)
    pos, quat = align_rod_to_hole(temp, "end1", c1, "A")
    r1 = PartInstance(instance_id="r1", part=rod_part, position=pos, quaternion=quat)
    build.add_part(c1)
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")
    return build


def test_save_creates_valid_zip(sample_build, tmp_path):
    out = tmp_path / "test.knx"
    save_knx(sample_build, out)

    assert out.exists()
    assert zipfile.is_zipfile(out)

    with zipfile.ZipFile(out, "r") as zf:
        names = zf.namelist()
        assert "manifest.json" in names
        assert "model.json" in names


def test_save_manifest_has_correct_metadata(sample_build, tmp_path):
    out = tmp_path / "test.knx"
    manifest = Manifest(title="Test Build", author="Unit Test")
    save_knx(sample_build, out, manifest)

    with zipfile.ZipFile(out, "r") as zf:
        data = json.loads(zf.read("manifest.json"))

    assert data["title"] == "Test Build"
    assert data["author"] == "Unit Test"
    assert data["piece_count"] == 2
    assert data["stability_score"] > 0
    assert data["format_version"] == "1.0"


def test_save_model_json_uses_compact_format(sample_build, tmp_path):
    out = tmp_path / "test.knx"
    save_knx(sample_build, out)

    with zipfile.ZipFile(out, "r") as zf:
        model = json.loads(zf.read("model.json"))

    assert len(model["parts"]) == 2
    part_entry = next(p for p in model["parts"] if p["instance_id"] == "c1")
    assert part_entry["part_id"] == "connector-4way-green-v1"
    assert "part" not in part_entry  # compact format, no nested part object

    assert len(model["connections"]) == 1
    conn = model["connections"][0]
    assert "." in conn["from"]  # dotted format "r1.end1"
    assert "." in conn["to"]


def test_save_embeds_mesh_files(sample_build, tmp_path):
    out = tmp_path / "test.knx"
    save_knx(sample_build, out)

    with zipfile.ZipFile(out, "r") as zf:
        mesh_files = [n for n in zf.namelist() if n.startswith("meshes/")]

    assert len(mesh_files) == 2
    mesh_names = {Path(m).name for m in mesh_files}
    assert "connector-4way-green.glb" in mesh_names
    assert "rod-128-red.glb" in mesh_names


def test_load_roundtrip(sample_build, library, tmp_path):
    out = tmp_path / "roundtrip.knx"
    manifest = Manifest(title="Round Trip", author="Test")
    save_knx(sample_build, out, manifest)

    loaded_build, loaded_manifest = load_knx(out, library)

    assert loaded_manifest.title == "Round Trip"
    assert len(loaded_build.parts) == 2
    assert "c1" in loaded_build.parts
    assert "r1" in loaded_build.parts
    assert len(loaded_build.connections) == 1


def test_load_preserves_positions(sample_build, library, tmp_path):
    out = tmp_path / "positions.knx"
    save_knx(sample_build, out)

    loaded_build, _ = load_knx(out, library)

    for iid in sample_build.parts:
        orig = sample_build.parts[iid]
        loaded = loaded_build.parts[iid]
        assert orig.position == pytest.approx(loaded.position, abs=0.001)
        assert orig.quaternion == pytest.approx(loaded.quaternion, abs=0.001)
        assert orig.part.id == loaded.part.id


def test_load_preserves_connections(sample_build, library, tmp_path):
    out = tmp_path / "connections.knx"
    save_knx(sample_build, out)

    loaded_build, _ = load_knx(out, library)

    orig_conns = {(c.from_instance, c.from_port, c.to_instance, c.to_port) for c in sample_build.connections}
    loaded_conns = {(c.from_instance, c.from_port, c.to_instance, c.to_port) for c in loaded_build.connections}
    assert orig_conns == loaded_conns


def test_load_rebuilds_graph(sample_build, library, tmp_path):
    out = tmp_path / "graph.knx"
    save_knx(sample_build, out)

    loaded_build, _ = load_knx(out, library)
    assert loaded_build._graph.number_of_edges() == 1
    assert loaded_build._graph.has_edge("r1", "c1")


def test_save_empty_build(tmp_path):
    build = Build()
    out = tmp_path / "empty.knx"
    save_knx(build, out)

    loaded_build, manifest = load_knx(out)
    assert len(loaded_build.parts) == 0
    assert len(loaded_build.connections) == 0
    assert manifest.piece_count == 0


def test_manifest_defaults():
    m = Manifest()
    assert m.format_version == "1.0"
    assert m.app_version == "0.1.0"
    assert m.created_at is not None
    assert m.ai_prompt is None
