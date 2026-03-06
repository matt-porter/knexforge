"""Save and load .knx build files (ZIP packages per docs/file-formats.md)."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, ValidationError

from .action_history import ActionHistory
from .build import Build
from .parts.loader import PARTS_DIR, PartLoader
from .parts.models import Connection, PartInstance, PartLibrary


def _normalize_legacy_port_id(port_id: str) -> str:
    """Canonicalize legacy rod-side port IDs to explicit side IDs."""
    return "center_tangent_y_pos" if port_id == "center_tangent" else port_id


class Manifest(BaseModel):
    """Metadata stored in manifest.json inside a .knx file."""

    format_version: str = "1.0"
    app_version: str = "0.1.0"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    author: str = ""
    title: str = ""
    description: str = ""
    ai_prompt: Optional[str] = None
    piece_count: int = 0
    stability_score: float = 0.0


class ExportValidationError(Exception):
    """Raised when build cannot be exported due to invalid data."""

    def __init__(self, message: str, missing_parts: list[str] | None = None):
        super().__init__(message)
        self.missing_parts = missing_parts or []


# ============================================================================
# Version Migration System (Task 5.8)
# ============================================================================

class VersionMigrationError(Exception):
    """Raised when version migration fails."""
    pass


def detect_format_version(data: dict) -> str:
    """Detect the format version of exported data.

    Args:
        data: Dict with 'manifest' key (or legacy structure).

    Returns:
        Version string like "1.0", "0.9", etc.

    Raises:
        ValueError: If version cannot be determined.
    """
    if "manifest" in data and isinstance(data["manifest"], dict):
        return str(data["manifest"].get("format_version", "unknown"))

    # Legacy format detection (pre-manifest)
    if "parts" in data and "connections" in data:
        return "0.9"  # Pre-manifest version

    raise ValueError("Cannot determine format version")


def migrate_data_v0_9_to_1_0(data: dict) -> dict:
    """Migrate legacy v0.9 format to v1.0.

    Legacy format had parts/connections at root level without manifest.
    New format wraps them in 'model' with a separate 'manifest'.

    Args:
        data: Legacy v0.9 format data.

    Returns:
        Migrated v1.0 format data.
    """
    if "manifest" in data:
        # Already migrated or new format
        return data

    # Create manifest from existing data
    piece_count = len(data.get("parts", []))
    stability_score = 0.0

    # Try to extract stability score if present in legacy format
    if "stability" in data:
        stability_score = float(data["stability"])

    migrated_data = {
        "manifest": {
            "format_version": "1.0",
            "app_version": "0.1.0",  # Unknown for legacy files
            "created_at": datetime.now(timezone.utc).isoformat(),
            "author": data.get("author", ""),
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "piece_count": piece_count,
            "stability_score": stability_score,
        },
        "model": {
            "parts": data["parts"],
            "connections": data.get("connections", []),
        },
    }

    return migrated_data


def migrate_data(data: dict) -> tuple[dict, str]:
    """Migrate build data to current format version.

    Args:
        data: Build data in any supported format.

    Returns:
        Tuple of (migrated_data, original_version).

    Raises:
        VersionMigrationError: If migration is not possible.
    """
    try:
        original_version = detect_format_version(data)
    except ValueError as e:
        raise VersionMigrationError(f"Cannot determine format version: {e}")

    # Current version - no migration needed
    if original_version == "1.0":
        return data, original_version

    # Legacy versions that need migration
    if original_version == "0.9":
        migrated = migrate_data_v0_9_to_1_0(data)
        return migrated, original_version

    # Unknown version - try to load anyway but warn
    import warnings
    warnings.warn(f"Unknown format version {original_version}, attempting direct load")
    return data, original_version


def validate_manifest(manifest: dict) -> list[str]:
    """Validate manifest structure and required fields.

    Args:
        manifest: Manifest dict to validate.

    Returns:
        List of validation errors (empty if valid).
    """
    errors = []

    # Check required fields
    required_fields = ["format_version", "piece_count"]
    for field in required_fields:
        if field not in manifest:
            errors.append(f"Missing required manifest field: {field}")

    # Validate format_version is parseable
    if "format_version" in manifest:
        try:
            version_parts = str(manifest["format_version"]).split(".")
            if len(version_parts) < 2:
                errors.append("Invalid format_version: must be major.minor")
        except Exception:
            errors.append("Invalid format_version: cannot parse")

    # Validate piece_count is non-negative integer
    if "piece_count" in manifest:
        try:
            pc = int(manifest["piece_count"])
            if pc < 0:
                errors.append("piece_count must be non-negative")
        except (ValueError, TypeError):
            errors.append("piece_count must be an integer")

    return errors


def validate_model(model_data: dict) -> list[str]:
    """Validate model structure and required fields.

    Args:
        model_data: Model dict to validate.

    Returns:
        List of validation errors (empty if valid).
    """
    errors = []

    # Check required arrays
    if "parts" not in model_data:
        errors.append("Missing 'parts' array")
    elif not isinstance(model_data["parts"], list):
        errors.append("'parts' must be an array")

    if "connections" not in model_data:
        errors.append("Missing 'connections' array")
    elif not isinstance(model_data["connections"], list):
        errors.append("'connections' must be an array")

    # Validate part entries
    for i, part in enumerate(model_data.get("parts", [])):
        part_errors = validate_part_entry(part, i)
        errors.extend(part_errors)

    # Validate connection entries
    for i, conn in enumerate(model_data.get("connections", [])):
        conn_errors = validate_connection_entry(conn, i)
        errors.extend(conn_errors)

    return errors


def validate_part_entry(part: dict, index: int) -> list[str]:
    """Validate a single part entry.

    Args:
        part: Part dict to validate.
        index: Index in parts array (for error messages).

    Returns:
        List of validation errors.
    """
    errors = []

    required_fields = ["instance_id", "part_id", "position", "quaternion"]
    for field in required_fields:
        if field not in part:
            errors.append(f"Part {index}: missing required field '{field}'")

    # Validate position is 3-element array of numbers
    if "position" in part:
        pos = part["position"]
        if not isinstance(pos, (list, tuple)) or len(pos) != 3:
            errors.append(f"Part {index}: 'position' must be [x, y, z]")
        elif not all(isinstance(v, (int, float)) for v in pos):
            errors.append(f"Part {index}: position values must be numbers")

    # Validate quaternion is 4-element array of numbers
    if "quaternion" in part:
        quat = part["quaternion"]
        if not isinstance(quat, (list, tuple)) or len(quat) != 4:
            errors.append(f"Part {index}: 'quaternion' must be [x, y, z, w]")
        elif not all(isinstance(v, (int, float)) for v in quat):
            errors.append(f"Part {index}: quaternion values must be numbers")

    return errors


def validate_connection_entry(conn: dict, index: int) -> list[str]:
    """Validate a single connection entry.

    Args:
        conn: Connection dict to validate.
        index: Index in connections array (for error messages).

    Returns:
        List of validation errors.
    """
    errors = []

    required_fields = ["from", "to"]
    for field in required_fields:
        if field not in conn:
            errors.append(f"Connection {index}: missing required field '{field}'")

    # Validate port format (instance.port)
    if "from" in conn and "." not in str(conn["from"]):
        errors.append(f"Connection {index}: 'from' must be in format 'instance_id.port_name'")

    if "to" in conn and "." not in str(conn["to"]):
        errors.append(f"Connection {index}: 'to' must be in format 'instance_id.port_name'")

    return errors


def validate_exported_data(data: dict) -> tuple[bool, list[str]]:
    """Validate complete exported build data.

    Args:
        data: Exported data with manifest and model.

    Returns:
        Tuple of (is_valid, list_of_errors).
    """
    all_errors = []

    # Validate structure
    if "manifest" not in data:
        all_errors.append("Missing 'manifest' key")
    else:
        manifest_errors = validate_manifest(data["manifest"])
        all_errors.extend(manifest_errors)

    if "model" not in data:
        all_errors.append("Missing 'model' key")
    else:
        model_errors = validate_model(data["model"])
        all_errors.extend(model_errors)

    return len(all_errors) == 0, all_errors


def _build_to_model_json(build: Build, library: PartLibrary) -> dict:
    """Serialize a Build to the compact model.json format from the spec.

    Uses part_id (not full part object) and dotted connection refs ("c1.A").

    Args:
        build: The Build to serialize.
        library: Part library for validation.

    Returns:
        Dict with 'parts' and 'connections' keys.

    Raises:
        ExportValidationError: If any part_id is not found in the library.
    """
    parts = []
    missing_parts: list[str] = []

    for inst in build.parts.values():
        try:
            # Validate part exists in library
            library.get(inst.part.id)
            parts.append({
                "instance_id": inst.instance_id,
                "part_id": inst.part.id,
                "position": list(inst.position),
                "quaternion": list(inst.quaternion),
                "color": inst.color,
            })
        except KeyError:
            missing_parts.append(inst.part.id)

    if missing_parts:
        raise ExportValidationError(
            f"Cannot export: {len(missing_parts)} part(s) not found in library",
            missing_parts=missing_parts,
        )

    connections = []
    for conn in build.connections:
        from_port = _normalize_legacy_port_id(conn.from_port)
        to_port = _normalize_legacy_port_id(conn.to_port)
        c_dict = {
            "from": f"{conn.from_instance}.{from_port}",
            "to": f"{conn.to_instance}.{to_port}",
            "joint_type": getattr(conn, 'joint_type', 'fixed'),
        }
        if hasattr(conn, 'twist_deg') and conn.twist_deg != 0:
            c_dict["twist_deg"] = conn.twist_deg
        connections.append(c_dict)

    return {"parts": parts, "connections": connections}


def _model_json_to_build(data: dict, library: PartLibrary) -> Build:
    """Reconstruct a Build from model.json data.

    Args:
        data: Parsed JSON dict with 'parts' and 'connections'.
        library: Part library for resolving part_ids.

    Returns:
        Reconstructed Build object.

    Raises:
        ValueError: If required fields are missing or invalid.
    """
    if "parts" not in data:
        raise ValueError("Invalid build file: missing 'parts' array")

    build = Build()

    for p_dict in data["parts"]:
        if "part_id" not in p_dict or "instance_id" not in p_dict:
            raise ValueError(f"Invalid part entry: {p_dict}")

        part = library.get(p_dict["part_id"])
        instance = PartInstance(
            instance_id=p_dict["instance_id"],
            part=part,
            position=tuple(p_dict["position"]),
            quaternion=tuple(p_dict["quaternion"]),
            color=p_dict.get("color"),
        )
        build.add_part(instance, record=False)

    for c_dict in data.get("connections", []):
        if "from" not in c_dict or "to" not in c_dict:
            raise ValueError(f"Invalid connection entry: {c_dict}")

        from_instance, from_port = c_dict["from"].rsplit(".", 1)
        to_instance, to_port = c_dict["to"].rsplit(".", 1)
        conn = Connection(
            from_instance=from_instance,
            from_port=_normalize_legacy_port_id(from_port),
            to_instance=to_instance,
            to_port=_normalize_legacy_port_id(to_port),
            joint_type=c_dict.get("joint_type", "fixed"),
            twist_deg=c_dict.get("twist_deg", 0.0),
        )
        build.connections.add(conn)
        build._graph.add_edge(from_instance, to_instance, joint_type=conn.joint_type)

    return build


def export_build(build: Build, library: PartLibrary | None = None) -> dict:
    """Export a Build to a portable JSON format.

    Args:
        build: The Build to export.
        library: Part library for validation. Uses default loader if None.

    Returns:
        Dict containing 'manifest' and 'model' keys with all build data.

    Raises:
        ExportValidationError: If build contains parts not in library.
    """
    if library is None:
        library = PartLoader.load()

    manifest_data = Manifest(
        format_version="1.0",
        app_version="0.1.0",
        title="",
        description="",
        author="",
        piece_count=len(build.parts),
        stability_score=build.stability_score(),
    )

    model_data = _build_to_model_json(build, library)

    return {
        "manifest": manifest_data.model_dump(mode="json"),
        "model": model_data,
    }


def import_build(data: dict, library: PartLibrary | None = None) -> tuple[Build, Manifest]:
    """Import a Build from exported JSON data.

    Args:
        data: Dict with 'manifest' and 'model' keys (from export_build).
        library: Part library for resolving part_ids. Uses default loader if None.

    Returns:
        Tuple of (Build, Manifest).

    Raises:
        ValueError: If data format is invalid or parts not found in library.
        VersionMigrationError: If migration fails.
    """
    if library is None:
        library = PartLoader.load()

    # Migrate to current version if needed (Task 5.8)
    migrated_data, original_version = migrate_data(data)

    # Validate structure
    is_valid, errors = validate_exported_data(migrated_data)
    if not is_valid:
        raise ValueError(f"Invalid export format:\n  - " + "\n  - ".join(errors))

    # Log migration info for debugging
    if original_version != "1.0":
        import warnings
        warnings.warn(
            f"Loaded legacy format v{original_version}, migrated to v1.0",
            UserWarning,
        )

    manifest = Manifest.model_validate(migrated_data["manifest"])
    build = _model_json_to_build(migrated_data["model"], library)

    return build, manifest


def save_knx(build: Build, path: Path, manifest: Manifest | None = None, library: PartLibrary | None = None) -> None:
    """Save a Build as a .knx ZIP package.

    Args:
        build: The build to save.
        path: Destination file path (should end in .knx).
        manifest: Optional metadata. Auto-populated fields if omitted.
        library: Part library for validation. Uses default loader if None.

    Raises:
        ExportValidationError: If build contains parts not in library.
    """
    if library is None:
        library = PartLoader.load()

    if manifest is None:
        manifest = Manifest()

    # Validate before export
    _build_to_model_json(build, library)

    manifest.piece_count = len(build.parts)
    manifest.stability_score = build.stability_score()

    model_data = _build_to_model_json(build, library)

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(manifest.model_dump(mode="json"), indent=2),
        )

        zf.writestr(
            "model.json",
            json.dumps(model_data, indent=2),
        )

        # Action history (JSONL)
        history_jsonl = build.history.to_jsonl()
        if history_jsonl:
            zf.writestr("action_history.jsonl", history_jsonl)

        # Embed required mesh files
        mesh_files_added: set[str] = set()
        for inst in build.parts.values():
            mesh_rel = inst.part.mesh_file
            if mesh_rel in mesh_files_added:
                continue
            mesh_abs = PARTS_DIR / mesh_rel
            if mesh_abs.exists():
                zf.write(mesh_abs, f"meshes/{mesh_abs.name}")
                mesh_files_added.add(mesh_rel)


def load_knx(path: Path, library: PartLibrary | None = None) -> tuple[Build, Manifest]:
    """Load a .knx file and return the Build + Manifest.

    Args:
        path: Path to the .knx file.
        library: Part library for resolving part_ids. Uses default loader if None.

    Returns:
        Tuple of (Build, Manifest).

    Raises:
        ValueError: If file format is invalid or parts not found in library.
    """
    if library is None:
        library = PartLoader.load()

    with zipfile.ZipFile(path, "r") as zf:
        manifest_data = json.loads(zf.read("manifest.json"))
        manifest = Manifest.model_validate(manifest_data)

        model_data = json.loads(zf.read("model.json"))
        build = _model_json_to_build(model_data, library)

        if "action_history.jsonl" in zf.namelist():
            history_text = zf.read("action_history.jsonl").decode("utf-8")
            build.history = ActionHistory.from_jsonl(history_text)

    build._stability_score = manifest.stability_score
    return build, manifest
