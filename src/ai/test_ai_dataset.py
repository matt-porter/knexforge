import pytest
from src.core.parts.loader import PartLoader
from src.core.snapping import snap_ports
from src.core.parts.models import PartInstance
from src.ai.dataset_generator import generate_procedural_build

def test_generated_builds_have_valid_snaps():
    """All generated procedural builds have physically valid connections (snapping logic passes)."""
    library = PartLoader.load(force_reload=True)
    for _ in range(10):
        build = generate_procedural_build(library, max_parts=12)
        for conn in build.connections:
            from_inst = build.parts[conn.from_instance]
            to_inst = build.parts[conn.to_instance]
            result = snap_ports(
                from_inst, conn.from_port,
                to_inst, conn.to_port,
                tolerance_mm=0.21
            )
            assert result is not None, (
                f"Invalid snap in build: {conn.from_instance}:{conn.from_port} -> {conn.to_instance}:{conn.to_port}"
            )
