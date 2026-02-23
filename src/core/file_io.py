"""Save and load .knx build files (ZIP packages per docs/file-formats.md)."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .action_history import ActionHistory
from .build import Build
from .parts.loader import PARTS_DIR, PartLoader
from .parts.models import Connection, PartInstance, PartLibrary


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


def _build_to_model_json(build: Build) -> dict:
    """Serialize a Build to the compact model.json format from the spec.

    Uses part_id (not full part object) and dotted connection refs ("c1.A").
    """
    parts = []
    for inst in build.parts.values():
        parts.append({
            "instance_id": inst.instance_id,
            "part_id": inst.part.id,
            "position": list(inst.position),
            "quaternion": list(inst.quaternion),
            "color": inst.color,
        })

    connections = []
    for conn in build.connections:
        connections.append({
            "from": f"{conn.from_instance}.{conn.from_port}",
            "to": f"{conn.to_instance}.{conn.to_port}",
        })

    return {"parts": parts, "connections": connections}


def _model_json_to_build(data: dict, library: PartLibrary) -> Build:
    """Reconstruct a Build from model.json data."""
    build = Build()

    for p_dict in data["parts"]:
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
        from_instance, from_port = c_dict["from"].rsplit(".", 1)
        to_instance, to_port = c_dict["to"].rsplit(".", 1)
        conn = Connection(
            from_instance=from_instance,
            from_port=from_port,
            to_instance=to_instance,
            to_port=to_port,
        )
        build.connections.add(conn)
        build._graph.add_edge(from_instance, to_instance)

    return build


def save_knx(build: Build, path: Path, manifest: Manifest | None = None) -> None:
    """Save a Build as a .knx ZIP package.

    Args:
        build: The build to save.
        path: Destination file path (should end in .knx).
        manifest: Optional metadata. Auto-populated fields if omitted.
    """
    if manifest is None:
        manifest = Manifest()

    manifest.piece_count = len(build.parts)
    manifest.stability_score = build.stability_score()

    model_data = _build_to_model_json(build)

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
