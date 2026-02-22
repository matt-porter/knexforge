"""Tests for the parts loading system (TDD – written BEFORE any snapping code)."""

import pytest
from pathlib import Path

from pydantic import ValidationError

from core.parts.loader import PartLoader
from core.parts.models import KnexPart, Port


def test_part_loader_loads_all_12_core_parts(clean_part_library):
    """Verify all 12 parts from our JSON files are loaded correctly."""
    library = clean_part_library
    assert len(library.parts) == 12
    assert len(library.get_by_category("connector")) == 5
    assert len(library.get_by_category("rod")) == 6
    assert len(library.get_by_category("wheel")) == 1


def test_part_loader_returns_correct_3way_connector(clean_part_library):
    """Detailed check on the most complex part (3-way yellow connector)."""
    part: KnexPart = clean_part_library.get("connector-3way-yellow-v1")

    assert part.name == "3-Way Connector (Yellow)"
    assert part.category == "connector"
    assert part.default_color == "#FFCC00"
    assert part.mass_grams == 2.1
    assert len(part.ports) == 3

    # Port A (positive X)
    a = next(p for p in part.ports if p.id == "A")
    assert a.position == (12.5, 0.0, 0.0)
    assert a.direction == (1.0, 0.0, 0.0)
    assert a.mate_type == "rod_hole"
    assert a.accepts == ["rod_end"]
    assert a.allowed_angles_deg == [0, 90, 180, 270]

    # Port B (120°)
    b = next(p for p in part.ports if p.id == "B")
    assert b.position == (-6.25, 10.825, 0.0)
    assert b.direction == (-0.5, 0.866, 0.0)  # cos(120°), sin(120°)


def test_part_loader_rod_port_geometry(clean_part_library):
    """Rods have exactly two opposite 'rod_end' ports with correct length."""
    rod = clean_part_library.get("rod-130-red-v1")
    assert rod.category == "rod"
    assert len(rod.ports) == 2

    end1 = next(p for p in rod.ports if p.id == "end1")
    end2 = next(p for p in rod.ports if p.id == "end2")

    assert end1.mate_type == "rod_end"
    assert end2.mate_type == "rod_end"
    assert end2.position[0] == 130.0  # exact length from JSON


def test_part_loader_get_mesh_path_returns_correct_path(clean_part_library):
    """Mesh path helper works and points to existing GLB."""
    mesh_path = PartLoader.get_mesh_path("wheel-medium-black-v1")
    assert mesh_path.name == "wheel-medium-black.glb"
    assert mesh_path.exists()  # assumes you ran generate_meshes.py


def test_part_loader_cache_behavior():
    """Singleton cache works and force_reload clears it."""
    PartLoader.clear_cache()
    lib1 = PartLoader.load()
    lib2 = PartLoader.load()  # should be same instance
    assert lib1 is lib2

    PartLoader.clear_cache()
    lib3 = PartLoader.load()
    assert lib1 is not lib3


def test_part_loader_raises_on_missing_parts_dir(tmp_path, monkeypatch):
    """Graceful failure if parts/ directory is missing."""
    monkeypatch.setattr("core.parts.loader.PARTS_DIR", tmp_path / "nonexistent")
    with pytest.raises(FileNotFoundError):
        PartLoader.load()


def test_part_loader_raises_on_invalid_json(tmp_path, monkeypatch):
    """Pydantic validation error on bad JSON."""
    bad_file = tmp_path / "bad-part.json"
    bad_file.write_text('{"id": "bad", "name": "Bad"}')  # missing required fields

    monkeypatch.setattr("core.parts.loader.PARTS_DIR", tmp_path)
    with pytest.raises(ValidationError):
        PartLoader.load(force_reload=True)


def test_part_loader_logs_missing_mesh_as_warning(clean_part_library, caplog):
    """Missing GLB file logs a warning but still loads the part."""
    # Temporarily rename a mesh to trigger warning
    part = clean_part_library.get("rod-17-green-v1")
    original_mesh = PartLoader.get_mesh_path(part.id)
    temp_missing = original_mesh.with_suffix(".missing")
    if original_mesh.exists():
        original_mesh.rename(temp_missing)

    try:
        PartLoader.clear_cache()
        with caplog.at_level("WARNING"):
            library = PartLoader.load()
            assert "Mesh file missing" in caplog.text
            assert library.get(part.id) is not None  # still loads
    finally:
        if temp_missing.exists():
            temp_missing.rename(original_mesh)


def test_all_core_parts_have_valid_schema(clean_part_library):
    """Every loaded part passes full Pydantic validation (extra safety)."""
    for part in clean_part_library.parts.values():
        # re-validate to catch any loader bugs
        KnexPart.model_validate(part.model_dump())