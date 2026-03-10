"""Pydantic models for all K'Nex parts. Single source of truth."""

from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Literal, List, Optional, Any


MateType = Literal["rod_hole", "rod_end", "tab", "clip", "rod_side", "slide_hole", "connector_slot", "rotational_hole", "slider_hole"]


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
    slide_clearance_mm: float = Field(
        default=15.0,
        description="Minimum spacing between this connector and adjacent slide connections"
    )
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
    is_pinned: bool = Field(default=False)

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
    joint_type: Literal["fixed", "revolute", "prismatic"] = Field(default="fixed")
    twist_deg: float = Field(default=0.0)
    fixed_roll: bool = Field(default=False)
    slide_offset: float = Field(
        default=0.0,
        description="Offset in mm along the rod's main axis from the port's default position. "
                    "Only meaningful for center_axial and center_tangent ports."
    )

    model_config = ConfigDict(frozen=True)

    @field_validator("from_port", "to_port")
    @classmethod
    def normalize_port_id(cls, v: str) -> str:
        """Normalize legacy rod-side port IDs."""
        if v == "center_tangent":
            return "center_tangent_y_pos"
        return v

def get_slide_range(part: KnexPart, port_id: str) -> tuple[float, float] | None:
    """Return (min_offset, max_offset) in mm for a slidable port, or None if not slidable."""
    if not (port_id.startswith("center_axial") or port_id.startswith("center_tangent")):
        return None

    # Find the port
    port = next((p for p in part.ports if p.id == port_id), None)
    if not port:
        return None

    # We need end1 and end2 to find the rod length
    end1 = next((p for p in part.ports if p.id == "end1"), None)
    end2 = next((p for p in part.ports if p.id == "end2"), None)
    
    if not end1 or not end2:
        return None
        
    clearance = port.slide_clearance_mm / 2.0
    
    min_x = min(end1.position[0], end2.position[0]) + clearance
    max_x = max(end1.position[0], end2.position[0]) - clearance
    
    if min_x > max_x:
        return 0.0, 0.0
        
    center_x = port.position[0]
    
    return (min_x - center_x, max_x - center_x)