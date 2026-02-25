"""
build_assistant.py -- Core procedural builder (structure generation) for K'NexForge

Provides algorithms for generating simple structures (e.g., bridges) using available K'Nex parts, snapping, and constraints.

API is agent- and test-friendly, pydantic-driven, and extendable.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class BuildSpec(BaseModel):
    """Defines the target structure to generate and constraints."""
    goal: Literal["bridge"] = Field("bridge", description="Type of structure to build")
    length_units: int = Field(..., ge=1, description="Length of span (rod units)")
    allowed_parts: Optional[List[str]] = Field(None, description="Part IDs allowed (optional)")
    anchor_a: Optional[tuple[float, float, float]] = Field(None, description="Start anchor coordinates (mm)")
    anchor_b: Optional[tuple[float, float, float]] = Field(None, description="End anchor coordinates (mm)")

class BuildStep(BaseModel):
    """A single part placement action."""
    part_id: str
    position: tuple[float, float, float]  # mm
    rotation: tuple[float, float, float]  # Euler XYZ, degrees
    meta: Optional[dict] = None

class BuildPlan(BaseModel):
    """A sequence of steps to assemble the structure."""
    steps: List[BuildStep]

class BuildAssistant:
    """
    Main procedural builder class.

    Usage:
        spec = BuildSpec(length_units=5)
        plan = BuildAssistant().generate_build(spec)
    """

    def generate_build(self, spec: BuildSpec) -> BuildPlan:
        """Generate a BuildPlan to construct a structure given a BuildSpec."""
        if spec.goal != "bridge":
            raise NotImplementedError(f"Unsupported goal: {spec.goal}")

        # Determine anchors
        anchor_a = spec.anchor_a or (0.0, 0.0, 0.0)
        anchor_b = spec.anchor_b or (spec.length_units * 100.0, 0.0, 0.0)  # 100mm per unit

        # Choose part
        allowed_rods = spec.allowed_parts or ["rod"]
        rod_id = next((pid for pid in allowed_rods if "rod" in pid), allowed_rods[0])

        steps = []
        for i in range(spec.length_units):
            # Linear interpolate between anchors
            t = i / max(spec.length_units - 1, 1)
            pos = tuple(
                anchor_a[j] * (1 - t) + anchor_b[j] * t
                for j in range(3)
            )
            step = BuildStep(
                part_id=rod_id,
                position=pos,
                rotation=(0.0, 0.0, 0.0),
                meta={"index": i, "bridge": True},
            )
            steps.append(step)
        return BuildPlan(steps=steps)

