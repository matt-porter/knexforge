"""Part loader — reads JSON definitions from parts/ and caches them."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import ClassVar, Optional

from .models import KnexPart, PartLibrary

logger = logging.getLogger(__name__)

PARTS_DIR = Path(__file__).resolve().parents[3] / "parts"


class PartLoader:
    """Singleton loader that reads all part JSON files into a PartLibrary."""

    _cache: ClassVar[Optional[PartLibrary]] = None

    @classmethod
    def load(cls, *, force_reload: bool = False) -> PartLibrary:
        """Load all parts from PARTS_DIR. Returns cached instance on repeat calls."""
        if cls._cache is not None and not force_reload:
            return cls._cache

        if not PARTS_DIR.exists():
            raise FileNotFoundError(f"Parts directory not found: {PARTS_DIR}")

        library = PartLibrary()

        for json_file in sorted(PARTS_DIR.glob("*.json")):
            raw = json.loads(json_file.read_text(encoding="utf-8"))
            part = KnexPart.model_validate(raw)

            mesh_path = PARTS_DIR / part.mesh_file
            if not mesh_path.exists():
                logger.warning("Mesh file missing for %s: %s", part.id, mesh_path)

            library.add(part)

        cls._cache = library
        return library

    @classmethod
    def clear_cache(cls) -> None:
        """Reset the singleton cache."""
        cls._cache = None

    @classmethod
    def get_mesh_path(cls, part_id: str) -> Path:
        """Return the resolved Path to a part's GLB mesh file."""
        library = cls.load()
        part = library.get(part_id)
        return PARTS_DIR / part.mesh_file
