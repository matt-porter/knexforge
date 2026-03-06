"""Tests for the parts loading system (TDD – written BEFORE any snapping code)."""

import pytest
from pathlib import Path

from pydantic import ValidationError

from core.parts.loader import PartLoader
from core.parts.models import KnexPart, Port


def test_part_loader_loads_all_active_parts(clean_part_library):
    """Verify all active parts (non-underscore-prefixed) are loaded correctly."""
    library = clean_part_library
    assert len(library.parts) == 17
    assert len(library.get_by_category("connector")) == 9
    assert len(library.get_by_category("rod")) == 6
    assert len(library.get_by_category("wheel")) == 1
    assert len(library.get_by_category("special")) == 1


def test_part_loader_returns_correct_4way_connector(clean_part_library):
    """Detailed check on the green 4-way connector (4 edge ports + center)."""
    part: KnexPart = clean_part_library.get("connector-4way-green-v1")

    assert part.name == "Green 4-Way Connector (135°)"
    assert part.category == "connector"
    assert part.default_color == "#00B050"
    assert part.mass_grams == 1.5
    assert len(part.ports) == 5  # A, B, C, D edge ports + center hole

    # Port A (positive X) — edge clip accepts rod_end and rod_side
    a = next(p for p in part.ports if p.id == "A")
    assert a.position == (12.7, 0.0, 0.0)
    assert a.direction == (1.0, 0.0, 0.0)
    assert a.mate_type == "rod_hole"
    assert a.accepts == ["rod_end", "rod_side"]
    assert a.allowed_angles_deg == [0, 90, 180, 270]

    # Port B (45°)
    b = next(p for p in part.ports if p.id == "B")
    assert b.position == (8.98, 8.98, 0.0)
    assert b.direction == (0.707, 0.707, 0.0)  # cos(45°), sin(45°)

    # Center hole — only accepts rod_end (for axial through-connections)
    center = next(p for p in part.ports if p.id == "center")
    assert center.position == (0.0, 0.0, 0.0)
    assert center.direction == (0.0, 0.0, 1.0)
    assert center.mate_type == "rod_hole"
    assert center.accepts == ["rod_end"]




def test_part_loader_returns_correct_3way_red_connector(clean_part_library):
    """Detailed check on the red 3-way connector (3 edge ports at 0°/45°/90° + center)."""
    part: KnexPart = clean_part_library.get("connector-3way-red-v1")

    assert part.name == "Red 3-Way Connector (90°)"
    assert part.category == "connector"
    assert part.default_color == "#E21B1B"
    assert len(part.ports) == 4  # A (0°), B (45°), C (90°) edge ports + center hole

    # Port A at 0° (positive X)
    a = next(p for p in part.ports if p.id == "A")
    assert a.position == (12.7, 0.0, 0.0)
    assert a.direction == (1.0, 0.0, 0.0)
    assert a.mate_type == "rod_hole"
    assert a.accepts == ["rod_end", "rod_side"]

    # Port B at 45°
    b = next(p for p in part.ports if p.id == "B")
    assert b.position == (8.98, 8.98, 0.0)
    assert b.direction == (0.707, 0.707, 0.0)
    assert b.mate_type == "rod_hole"

    # Port C at 90° (positive Y)
    c = next(p for p in part.ports if p.id == "C")
    assert c.position == (0.0, 12.7, 0.0)
    assert c.direction == (0.0, 1.0, 0.0)
    assert c.mate_type == "rod_hole"

    # Center hole — only accepts rod_end
    center = next(p for p in part.ports if p.id == "center")
    assert center.position == (0.0, 0.0, 0.0)
    assert center.direction == (0.0, 0.0, 1.0)
    assert center.accepts == ["rod_end"]

def test_rod_ports(clean_part_library):
    """Rods expose end/axial ports plus 4 explicit side ports for side clipping."""
    rod = clean_part_library.get("rod-128-red-v1")
    assert rod.category == "rod"
    assert len(rod.ports) == 8

    end1 = next(p for p in rod.ports if p.id == "end1")
    end2 = next(p for p in rod.ports if p.id == "end2")

    assert end1.mate_type == "rod_end"
    assert end2.mate_type == "rod_end"
    assert end2.position[0] == 128.0  # exact length from JSON

    # Canonical center tangent port for side-on clipping
    tangent = next(p for p in rod.ports if p.id == "center_tangent_y_pos")
    assert tangent.mate_type == "rod_side"
    assert set(tangent.accepts) == {"rod_hole", "clip", "rotational_hole", "slider_hole"}
    assert tangent.position[0] == 64.0  # midpoint of rod

    side_ports = {
        p.id: p for p in rod.ports if p.id.startswith("center_tangent_")
    }
    assert set(side_ports.keys()) == {
        "center_tangent_y_pos",
        "center_tangent_y_neg",
        "center_tangent_z_pos",
        "center_tangent_z_neg",
    }

    assert side_ports["center_tangent_y_pos"].direction == (0.0, 1.0, 0.0)
    assert side_ports["center_tangent_y_neg"].direction == (0.0, -1.0, 0.0)
    assert side_ports["center_tangent_z_pos"].direction == (0.0, 0.0, 1.0)
    assert side_ports["center_tangent_z_neg"].direction == (0.0, 0.0, -1.0)


def test_part_loader_get_mesh_path_returns_correct_path(clean_part_library):
    """Mesh path helper returns correct path to GLB."""
    mesh_path = PartLoader.get_mesh_path("wheel-medium-black-v1")
    assert mesh_path.name == "wheel-medium-black.glb"


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
    PartLoader.clear_cache()
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
    part = clean_part_library.get("rod-16-green-v1")
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
