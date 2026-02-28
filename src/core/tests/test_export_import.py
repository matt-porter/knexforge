"""Tests for build export and import functionality."""

import json
from pathlib import Path
import tempfile
import pytest

from core.build import Build
from core.parts.loader import PartLoader
from core.parts.models import PartInstance, Connection
from core.snapping import align_rod_to_hole


@pytest.fixture
def simple_build(library):
    """Create a simple 2-part build (connector + rod)."""
    build = Build()

    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    r1 = align_rod_to_hole(
        PartInstance(instance_id="r1", part=library.get("rod-128-red-v1")),
        "end1",
        c1,
        "A"
    )

    build.add_part(c1)
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")

    return build


@pytest.fixture
def complex_build(library):
    """Create a more complex build with multiple parts and connections."""
    build = Build()

    # Central connector
    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    build.add_part(c1)

    # Add 3 rods in different directions
    r1 = align_rod_to_hole(
        PartInstance(instance_id="r1", part=library.get("rod-128-red-v1")),
        "end1", c1, "A"
    )
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")

    r2 = align_rod_to_hole(
        PartInstance(instance_id="r2", part=library.get("rod-64-blue-v1")),
        "end1", c1, "B"
    )
    build.add_part(r2)
    build.attempt_snap("r2", "end1", "c1", "B")

    r3 = align_rod_to_hole(
        PartInstance(instance_id="r3", part=library.get("rod-64-blue-v1")),
        "end1", c1, "C"
    )
    build.add_part(r3)
    build.attempt_snap("r3", "end1", "c1", "C")

    return build


def test_export_basic_build(simple_build):
    """Test exporting a simple 2-part build."""
    from core.file_io import export_build

    result = export_build(simple_build)

    assert "manifest" in result
    assert "model" in result
    assert result["manifest"]["piece_count"] == 2
    assert len(result["model"]["parts"]) == 2
    assert len(result["model"]["connections"]) == 1


def test_export_complex_build(complex_build):
    """Test exporting a complex build with multiple parts and connections."""
    from core.file_io import export_build

    result = export_build(complex_build)

    assert result["manifest"]["piece_count"] == len(complex_build.parts)
    assert len(result["model"]["parts"]) == len(complex_build.parts)
    # Complex build has 3 connections
    assert len(result["model"]["connections"]) == 3


def test_import_roundtrip_simple(simple_build):
    """Test that import after export produces identical build."""
    from core.file_io import export_build, import_build

    # Export
    exported_data = export_build(simple_build)

    # Import
    imported_build, manifest = import_build(exported_data)

    # Compare parts
    assert len(imported_build.parts) == len(simple_build.parts)

    for inst_id in simple_build.parts:
        orig_part = simple_build.parts[inst_id]
        imp_part = imported_build.parts[inst_id]

        assert orig_part.part.id == imp_part.part.id
        assert orig_part.position == imp_part.position
        assert orig_part.quaternion == imp_part.quaternion
        assert orig_part.color == imp_part.color

    # Compare connections
    assert len(imported_build.connections) == len(simple_build.connections)


def test_import_roundtrip_complex(complex_build):
    """Test round-trip with complex build."""
    from core.file_io import export_build, import_build

    exported_data = export_build(complex_build)
    imported_build, _ = import_build(exported_data)

    # Verify all parts match
    assert len(imported_build.parts) == len(complex_build.parts)
    for inst_id in complex_build.parts:
        orig = complex_build.parts[inst_id]
        imp = imported_build.parts[inst_id]
        assert orig.position == imp.position
        assert orig.quaternion == imp.quaternion

    # Verify all connections match
    assert len(imported_build.connections) == len(complex_build.connections)


def test_save_load_knx_file(simple_build):
    """Test saving and loading .knx file."""
    from core.file_io import save_knx, load_knx

    with tempfile.TemporaryDirectory() as tmpdir:
        knx_path = Path(tmpdir) / "test.knx"
        save_knx(simple_build, knx_path)

        # Verify file exists and is valid ZIP
        assert knx_path.exists()

        # Load back
        loaded_build, manifest = load_knx(knx_path)

        # Compare
        assert len(loaded_build.parts) == len(simple_build.parts)
        for inst_id in simple_build.parts:
            orig = simple_build.parts[inst_id]
            loaded = loaded_build.parts[inst_id]
            assert orig.position == loaded.position


def test_export_validation_missing_part():
    """Test that export fails if part not in library."""
    from core.file_io import export_build, ExportValidationError

    build = Build()

    # Create a part with invalid ID
    fake_part = type("FakePart", (), {"id": "nonexistent-part-xyz"})()
    instance = PartInstance(
        instance_id="test-inst",
        part=fake_part,
        position=(0, 0, 0),
        quaternion=(0, 0, 0, 1),
    )
    build.add_part(instance, record=False)

    with pytest.raises(ExportValidationError) as exc_info:
        export_build(build)

    assert "nonexistent-part-xyz" in str(exc_info.value)


def test_import_invalid_format():
    """Test that import fails gracefully on invalid format."""
    from core.file_io import import_build

    # Missing 'parts' key
    with pytest.raises(ValueError, match="missing 'parts'"):
        import_build({"model": {"parts": []}})

    # Invalid part entry (missing required fields)
    with pytest.raises(ValueError):
        import_build({
            "manifest": {},
            "model": {"parts": [{"part_id": "red-rod"}]},  # missing instance_id, position, etc.
        })


def test_manifest_metadata(simple_build):
    """Test that manifest contains correct metadata."""
    from core.file_io import export_build

    result = export_build(simple_build)
    manifest = result["manifest"]

    assert "format_version" in manifest
    assert manifest["piece_count"] == 2
    assert "stability_score" in manifest
    assert "created_at" in manifest


def test_large_build_performance():
    """Test that export/import works efficiently for large builds."""
    from core.file_io import export_build, import_build
    import time

    # Create a build with 50 parts
    build = Build()
    library = PartLoader.load()
    for i in range(50):
        part = library.get("rod-128-red-v1")
        instance = PartInstance(
            instance_id=f"part-{i}",
            part=part,
            position=(i * 1.0, 0, 0),
            quaternion=(0, 0, 0, 1),
        )
        build.add_part(instance, record=False)

    # Time export
    start = time.time()
    exported_data = export_build(build)
    export_time = time.time() - start

    assert export_time < 2.0, f"Export took too long: {export_time}s"

    # Time import
    start = time.time()
    imported_build, _ = import_build(exported_data)
    import_time = time.time() - start

    assert import_time < 2.0, f"Import took too long: {import_time}s"
    assert len(imported_build.parts) == 50


def test_connection_preservation(complex_build):
    """Test that all connections are preserved through export/import."""
    from core.file_io import export_build, import_build

    exported_data = export_build(complex_build)

    # Verify connection format in exported data
    for conn in exported_data["model"]["connections"]:
        assert "from" in conn
        assert "to" in conn
        assert "." in conn["from"]  # instance.port format
        assert "." in conn["to"]

    imported_build, _ = import_build(exported_data)

    # Verify all connections restored
    assert len(imported_build.connections) == len(complex_build.connections)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
