"""
Unit tests for the instructions generator module.
"""

import pytest
from core.build import Build, PartInstance
from core.instructions.generator import InstructionsGenerator


from core.parts.loader import PartLoader

class DummyBuild(Build):
    # Minimal stub for testing
    def __init__(self):
        library = PartLoader.load()
        self.parts = {
            "r1": PartInstance(instance_id="r1", part=library.get("rod-32-white-v1")),
            "c1": PartInstance(instance_id="c1", part=library.get("connector-3way-green-v1")),
        }
        self.connections = set()
        self._graph = None

def test_generate_bom():
    build = DummyBuild()
    gen = InstructionsGenerator(build)
    bom = gen.generate_bom()
    assert bom == {"connector-3way-green-v1": 1, "rod-32-white-v1": 1}

# TODO: Add tests for compute_steps and compute_exploded_steps when implemented
