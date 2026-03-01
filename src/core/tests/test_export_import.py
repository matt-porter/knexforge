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
def library(clean_part_library):
    """Alias for the clean part library fixture."""
    return clean_part_library


@pytest.fixture
def simple_build(library):
    """Create a simple 2-part build (connector + rod)."""
    build = Build()

    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    rod_part = library.get("rod-128-red-v1")
    temp_rod = PartInstance(instance_id="r1", part=rod_part)
    r1_pos, r1_quat = align_rod_to_hole(temp_rod, "end1", c1, "A")
    r1 = PartInstance(instance_id="r1", part=rod_part, position=r1_pos, quaternion=r1_quat)

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

    rod_part_red = library.get("rod-128-red-v1")
    rod_part_blue = library.get("rod-54-blue-v1")

    # Add 3 rods in different directions
    temp_r1 = PartInstance(instance_id="r1", part=rod_part_red)
    r1_pos, r1_quat = align_rod_to_hole(temp_r1, "end1", c1, "A")
    r1 = PartInstance(instance_id="r1", part=rod_part_red, position=r1_pos, quaternion=r1_quat)
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")

    temp_r2 = PartInstance(instance_id="r2", part=rod_part_blue)
    r2_pos, r2_quat = align_rod_to_hole(temp_r2, "end1", c1, "B")
    r2 = PartInstance(instance_id="r2", part=rod_part_blue, position=r2_pos, quaternion=r2_quat)
    build.add_part(r2)
    build.attempt_snap("r2", "end1", "c1", "B")

    temp_r3 = PartInstance(instance_id="r3", part=rod_part_blue)
    r3_pos, r3_quat = align_rod_to_hole(temp_r3, "end1", c1, "C")
    r3 = PartInstance(instance_id="r3", part=rod_part_blue, position=r3_pos, quaternion=r3_quat)
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


def test_export_validation_missing_part(library):
    """Test that export fails if part not in library."""
    from core.file_io import export_build, ExportValidationError

    build = Build()

    # Create a part with valid KnexPart but ID not in library
    real_part = library.get("rod-128-red-v1")
    fake_part = real_part.model_copy(update={"id": "nonexistent-part-xyz"})
    
    instance = PartInstance(
        instance_id="test-inst",
        part=fake_part,
        position=(0, 0, 0),
        quaternion=(0, 0, 0, 1),
    )
    build.add_part(instance, record=False)

    with pytest.raises(ExportValidationError) as exc_info:
        export_build(build)

    assert "nonexistent-part-xyz" in exc_info.value.missing_parts


def test_import_invalid_format():
    """Test that import fails gracefully on invalid format."""
    from core.file_io import import_build, VersionMigrationError

    # Missing version indicators (manifest or root parts/connections)
    with pytest.raises(VersionMigrationError, match="Cannot determine format version"):
        import_build({"model": {"parts": []}})

    # Invalid part entry (missing required fields)
    with pytest.raises(ValueError, match="Invalid export format"):
        import_build({
            "manifest": {"format_version": "1.0", "piece_count": 0},
            "model": {"parts": [{"part_id": "red-rod"}], "connections": []},
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


def test_very_large_build_performance():
    """Test performance with 100+ part builds (Task 5.7)."""
    from core.file_io import export_build, import_build
    import time

    library = PartLoader.load()

    # Create a build with 100 parts
    build = Build()
    for i in range(100):
        part = library.get("rod-128-red-v1")
        instance = PartInstance(
            instance_id=f"part-{i}",
            part=part,
            position=(i * 1.0, 0, 0),
            quaternion=(0, 0, 0, 1),
        )
        build.add_part(instance, record=False)

    # Time export - should complete in <3 seconds for 100 parts
    start = time.time()
    exported_data = export_build(build)
    export_time = time.time() - start

    assert export_time < 3.0, f"Export took too long: {export_time}s"

    # Time import - should complete in <3 seconds for 100 parts
    start = time.time()
    imported_build, _ = import_build(exported_data)
    import_time = time.time() - start

    assert import_time < 3.0, f"Import took too long: {import_time}s"
    assert len(imported_build.parts) == 100


def test_200_part_build_performance():
    """Test performance with 200 part builds (Task 5.7 success criteria)."""
    from core.file_io import export_build, import_build
    import time

    library = PartLoader.load()

    # Create a build with 200 parts
    build = Build()
    for i in range(200):
        part = library.get("rod-128-red-v1")
        instance = PartInstance(
            instance_id=f"part-{i}",
            part=part,
            position=(i * 1.0, 0, 0),
            quaternion=(0, 0, 0, 1),
        )
        build.add_part(instance, record=False)

    # Time export - should complete in <5 seconds for 200 parts
    start = time.time()
    exported_data = export_build(build)
    export_time = time.time() - start

    assert export_time < 5.0, f"Export took too long: {export_time}s"

    # Time import - should complete in <5 seconds for 200 parts
    start = time.time()
    imported_build, _ = import_build(exported_data)
    import_time = time.time() - start

    assert import_time < 5.0, f"Import took too long: {import_time}s"
    assert len(imported_build.parts) == 200


def test_export_import_with_colors():
    """Test that color overrides are preserved through round-trip."""
    from core.file_io import export_build, import_build

    build = Build()
    library = PartLoader.load()

    c1 = PartInstance(instance_id="c1", part=library.get("connector-4way-green-v1"))
    rod_part = library.get("rod-128-red-v1")
    temp_rod = PartInstance(instance_id="r1", part=rod_part)
    r1_pos, r1_quat = align_rod_to_hole(temp_rod, "end1", c1, "A")

    # Add color override
    r1_with_color = PartInstance(
        instance_id="r1",
        part=rod_part,
        position=r1_pos,
        quaternion=r1_quat,
        color="#FF00FF",  # Magenta override
    )

    build.add_part(c1)
    build.add_part(r1_with_color)
    build.attempt_snap("r1", "end1", "c1", "A")

    exported_data = export_build(build)

    # Verify color is in exported data
    assert len(exported_data["model"]["parts"]) == 2
    r1_exported = next(p for p in exported_data["model"]["parts"] if p["instance_id"] == "r1")
    assert r1_exported.get("color") == "#FF00FF"

    imported_build, _ = import_build(exported_data)
    r1_imported = imported_build.parts["r1"]

    # Verify color is preserved after import
    assert r1_imported.color == "#FF00FF"


def test_empty_build_export():
    """Test that empty builds can be exported and imported."""
    from core.file_io import export_build, import_build

    build = Build()

    exported_data = export_build(build)

    assert exported_data["manifest"]["piece_count"] == 0
    assert len(exported_data["model"]["parts"]) == 0
    assert len(exported_data["model"]["connections"]) == 0

    imported_build, _ = import_build(exported_data)
    assert len(imported_build.parts) == 0


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


# ============================================================================
# Version Migration Tests (Task 5.8)
# ============================================================================

def test_detect_format_version_new():
    """Test version detection for current format."""
    from core.file_io import detect_format_version

    data = {
        "manifest": {"format_version": "1.0"},
        "model": {"parts": [], "connections": []},
    }

    assert detect_format_version(data) == "1.0"


def test_detect_format_version_legacy():
    """Test version detection for legacy format."""
    from core.file_io import detect_format_version

    data = {
        "parts": [{"instance_id": "c1", "part_id": "test"}],
        "connections": [],
    }

    assert detect_format_version(data) == "0.9"


def test_detect_format_version_invalid():
    """Test version detection fails on invalid format."""
    from core.file_io import detect_format_version

    with pytest.raises(ValueError, match="Cannot determine format version"):
        detect_format_version({"random": "data"})


def test_migrate_v0_9_to_1_0():
    """Test migration from v0.9 to v1.0."""
    from core.file_io import migrate_data_v0_9_to_1_0

    legacy_data = {
        "parts": [
            {"instance_id": "c1", "part_id": "connector-4way-green-v1"},
        ],
        "connections": [],
        "title": "Legacy Build",
        "author": "Test User",
        "stability": 85.0,
    }

    migrated = migrate_data_v0_9_to_1_0(legacy_data)

    # Check manifest was created
    assert "manifest" in migrated
    assert migrated["manifest"]["format_version"] == "1.0"
    assert migrated["manifest"]["title"] == "Legacy Build"
    assert migrated["manifest"]["author"] == "Test User"
    assert migrated["manifest"]["piece_count"] == 1
    assert migrated["manifest"]["stability_score"] == 85.0

    # Check model was created
    assert "model" in migrated
    assert len(migrated["model"]["parts"]) == 1


def test_migrate_already_v1_0():
    """Test that v1.0 data passes through unchanged."""
    from core.file_io import migrate_data

    current_data = {
        "manifest": {"format_version": "1.0", "piece_count": 5},
        "model": {"parts": [], "connections": []},
    }

    migrated, original_version = migrate_data(current_data)

    assert original_version == "1.0"
    # Should be same object (no copy needed)
    assert migrated is current_data


def test_migrate_unknown_version():
    """Test migration with unknown version warns but proceeds."""
    from core.file_io import migrate_data
    import warnings

    data = {
        "manifest": {"format_version": "9.9"},  # Unknown future version
        "model": {"parts": [], "connections": []},
    }

    # Should not raise, just warn
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        migrated, original_version = migrate_data(data)

        assert len(w) == 1
        assert "Unknown format version" in str(w[0].message)
        assert original_version == "9.9"


def test_validate_manifest_valid():
    """Test validation of valid manifest."""
    from core.file_io import validate_manifest

    manifest = {
        "format_version": "1.0",
        "piece_count": 10,
        "title": "Test Build",
    }

    errors = validate_manifest(manifest)
    assert len(errors) == 0


def test_validate_manifest_missing_fields():
    """Test validation catches missing required fields."""
    from core.file_io import validate_manifest

    manifest = {
        # Missing format_version and piece_count
        "title": "Test Build",
    }

    errors = validate_manifest(manifest)
    assert len(errors) == 2
    assert any("format_version" in e for e in errors)
    assert any("piece_count" in e for e in errors)


def test_validate_model_valid():
    """Test validation of valid model."""
    from core.file_io import validate_model

    model = {
        "parts": [
            {
                "instance_id": "c1",
                "part_id": "connector-4way-green-v1",
                "position": [0, 0, 0],
                "quaternion": [0, 0, 0, 1],
            }
        ],
        "connections": [],
    }

    errors = validate_model(model)
    assert len(errors) == 0


def test_validate_model_invalid_part():
    """Test validation catches invalid part entries."""
    from core.file_io import validate_model

    model = {
        "parts": [
            {"instance_id": "c1"},  # Missing position, quaternion, part_id
        ],
        "connections": [],
    }

    errors = validate_model(model)
    assert len(errors) >= 2  # Should catch multiple missing fields


def test_validate_connection_invalid_format():
    """Test validation catches invalid connection format."""
    from core.file_io import validate_model

    model = {
        "parts": [],
        "connections": [
            {"from": "invalid", "to": "also-invalid"},  # Missing port names
        ],
    }

    errors = validate_model(model)
    assert any("instance_id.port_name" in e for e in errors)


def test_validate_exported_data_complete():
    """Test complete data validation."""
    from core.file_io import validate_exported_data

    # Valid data
    valid_data = {
        "manifest": {"format_version": "1.0", "piece_count": 5},
        "model": {"parts": [], "connections": []},
    }

    is_valid, errors = validate_exported_data(valid_data)
    assert is_valid
    assert len(errors) == 0

    # Invalid data (missing manifest)
    invalid_data = {"model": {"parts": [], "connections": []}}
    is_valid, errors = validate_exported_data(invalid_data)
    assert not is_valid
    assert any("manifest" in e for e in errors)


def test_import_legacy_format():
    """Test importing legacy v0.9 format."""
    from core.file_io import import_build

    # Simulate legacy data (pre-manifest format)
    legacy_data = {
        "parts": [
            {
                "instance_id": "c1",
                "part_id": "connector-4way-green-v1",
                "position": [0, 0, 0],
                "quaternion": [0, 0, 0, 1],
            }
        ],
        "connections": [],
        "title": "Legacy Build",
    }

    # Should migrate and import successfully
    build, manifest = import_build(legacy_data)

    assert len(build.parts) == 1
    assert manifest.title == "Legacy Build"


def test_import_invalid_format_raises():
    """Test that invalid format raises VersionMigrationError."""
    from core.file_io import import_build, VersionMigrationError

    # Missing both manifest and model
    with pytest.raises(VersionMigrationError, match="Cannot determine format version"):
        import_build({"random": "data"})

    # Missing parts array
    with pytest.raises(ValueError):
        import_build({
            "manifest": {"format_version": "1.0", "piece_count": 0},
            "model": {"connections": []},  # Missing 'parts'
        })


def test_full_migration_roundtrip(simple_build):
    """Test complete migration and round-trip for legacy data."""
    from core.file_io import export_build, import_build

    # Export to current format
    exported_data = export_build(simple_build)

    # Simulate legacy format by removing manifest wrapper
    legacy_style = {
        "parts": exported_data["model"]["parts"],
        "connections": exported_data["model"]["connections"],
        "title": "Migrated Build",
        "author": "Test User",
    }

    # Import should migrate automatically
    imported_build, manifest = import_build(legacy_style)

    # Verify migration worked
    assert len(imported_build.parts) == 2
    assert manifest.title == "Migrated Build"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
