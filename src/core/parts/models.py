"""Pydantic models for all K'Nex parts. Single source of truth."""

from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict
from typing import Literal, List, Optional


MateType = Literal["rod_hole", "rod_end", "tab", "clip"]


class Port(BaseModel):
    """Single connection port on a part."""

    id: str = Field(..., description="Unique within this part, e.g. 'A', 'end1'")
    position: tuple[float, float, float] = Field(..., description="Local XYZ in mm")
    direction: tuple[float, float, float] = Field(
        ..., description="Unit vector pointing OUT from the part"
    )
    mate_type: MateType
    accepts: List[MateType] = Field(default_factory=list)
    allowed_angles_deg: List[int] = Field(default_factory=lambda: [0, 90, 180, 270])
    tolerance_mm: float = Field(default=0.2)

    model_config = ConfigDict(frozen=True)


class KnexPart(BaseModel):
    """Complete definition of one K'Nex piece (matches knex-part.schema.json)."""

    format_version: str = Field(default="1.0")
    id: str = Field(..., description="Unique machine ID, e.g. 'connector-3way-yellow-v1'")
    name: str
    category: Literal["connector", "rod", "wheel", "plate", "special"]
    mesh_file: str = Field(..., description="Relative path from parts/meshes/")
    default_color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    mass_grams: float = Field(ge=0)
    ports: List[Port] = Field(..., min_length=1)

    model_config = ConfigDict(frozen=True, extra="forbid")


class PartLibrary(BaseModel):
    """In-memory cache of all loaded parts."""

    parts: dict[str, KnexPart] = Field(default_factory=dict)
    by_category: dict[str, list[KnexPart]] = Field(default_factory=dict)

    model_config = ConfigDict(frozen=False)  # mutable cache

    def add(self, part: KnexPart) -> None:
        """Add a part to the library."""
        if part.id in self.parts:
            raise ValueError(f"Duplicate part ID: {part.id}")
        self.parts[part.id] = part
        self.by_category.setdefault(part.category, []).append(part)

    def get(self, part_id: str) -> KnexPart:
        """Get part by ID or raise KeyError."""
        return self.parts[part_id]

    def get_by_category(self, category: str) -> list[KnexPart]:
        """Get all parts of a category."""
        return self.by_category.get(category, [])

class PartInstance(BaseModel):
    """A placed instance of a part in a build."""

    instance_id: str
    part: KnexPart
    position: tuple[float, float, float] = Field(default=(0.0, 0.0, 0.0))
    quaternion: tuple[float, float, float, float] = Field(default=(0.0, 0.0, 0.0, 1.0))
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")

    model_config = ConfigDict(frozen=True)

    def get_port(self, port_id: str) -> Port:
        """Helper to get a port by ID."""
        for p in self.part.ports:
            if p.id == port_id:
                return p
        raise ValueError(f"Port {port_id} not found on {self.part.id}")


class Connection(BaseModel):
    """A validated snap between two ports."""

    from_instance: str
    from_port: str
    to_instance: str
    to_port: str

    model_config = ConfigDict(frozen=True)