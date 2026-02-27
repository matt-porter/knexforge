"""
Unit tests for src/core/physics/pybullet.py
"""

import pytest
import types
from pathlib import Path
import importlib
pybullet_mod = importlib.util.find_spec("pybullet")
pytestmark = pytest.mark.skipif(pybullet_mod is None, reason="pybullet not installed")

try:
    from src.core.build import Build
    from src.core.parts.loader import PartLoader
    from src.core.physics.pybullet import simulate_collapse, PyBulletSimulator, CollapseResult
    from src.core.parts.models import PartInstance, Connection
except ImportError:
    Build = None
    PartLoader = None
    simulate_collapse = None
    CollapseResult = None
    PartInstance = None
    Connection = None

@pytest.mark.skipif(Build is None, reason="Test skipped: cannot import core modules.")
def test_simulate_collapse_simple():
    library = PartLoader.load()
    rod = library.get_by_category("rod")[0]
    conn = library.get_by_category("connector")[0]
    rod_inst = PartInstance(instance_id="rod1", part=rod, position=(0.0, 0.0, 5.0))
    conn_inst = PartInstance(instance_id="conn1", part=conn, position=(100.0, 0.0, 5.0))
    build = Build()
    build.add_part(rod_inst)
    build.add_part(conn_inst)
    result = simulate_collapse(build)
    assert isinstance(result, CollapseResult)
    assert 0.0 <= result.score <= 1.0
    # Unconnected parts above the ground may fall — just verify the result is well-formed
    assert isinstance(result.unstable_parts, list)
    assert isinstance(result.stress_data, dict)

@pytest.mark.skipif(Build is None, reason="Test skipped: cannot import core modules.")
def test_simulate_collapse_with_connection():
    library = PartLoader.load()
    rod = library.get_by_category("rod")[0]
    conn = library.get_by_category("connector")[0]
    rod_inst = PartInstance(instance_id="rod1", part=rod, position=(0.0, 0.0, 5.0))
    conn_inst = PartInstance(instance_id="conn1", part=conn, position=(16.0, 0.0, 5.0))
    from src.core.snapping import align_rod_to_hole
    new_pos, new_quat = align_rod_to_hole(rod_inst, rod.ports[0].id, conn_inst, conn.ports[0].id)
    rod_inst = PartInstance(instance_id="rod1", part=rod, position=new_pos, quaternion=new_quat)

    build = Build()
    build.add_part(rod_inst)
    build.add_part(conn_inst)
    # Fake a connection (simulate a snap)
    build.connections.add(Connection(
        from_instance="rod1", from_port=rod.ports[0].id,
        to_instance="conn1", to_port=conn.ports[0].id
    ))
    result = simulate_collapse(build)
    assert isinstance(result, CollapseResult)
    assert 0.0 <= result.score <= 1.0
    assert isinstance(result.stress_data, dict)
    assert len(result.stress_data) == 2
