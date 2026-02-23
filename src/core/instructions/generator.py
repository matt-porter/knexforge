"""
Instruction step generator for K'NexForge.
- Computes build steps (topological sort)
- Exploded view step computation
- BOM (Bill of Materials) generation
"""
from typing import List, Dict
from ..build import Build, PartInstance

class InstructionStep:
    """Represents a single instruction step."""
    def __init__(self, parts: List[PartInstance], description: str = ""):
        self.parts = parts
        self.description = description

class InstructionsGenerator:
    """
    Generates build instructions from a Build object.
    """
    def __init__(self, build: Build):
        self.build = build

    def compute_steps(self) -> List[InstructionStep]:
        """
        Computes the build steps using topological sort of the connection graph.
        """
        # TODO: Implement topological sort based on build.connection_graph
        raise NotImplementedError

    def compute_exploded_steps(self) -> List[InstructionStep]:
        """
        Computes exploded view steps for the build.
        """
        # TODO: Implement exploded view logic
        raise NotImplementedError

    def generate_bom(self) -> Dict[str, int]:
        """
        Generates a Bill of Materials (BOM) for the build.
        Returns a dict mapping part_id to quantity.
        """
        bom: Dict[str, int] = {}
        for inst in self.build.parts.values():
            part_id = inst.part.id
            bom[part_id] = bom.get(part_id, 0) + 1
        return bom
