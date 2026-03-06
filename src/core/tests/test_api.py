"""
Tests for FastAPI sidecar (src/core/api.py)
"""
import pytest
from fastapi.testclient import TestClient
import src.core.api as core_api

client = TestClient(core_api.app)

def test_build_endpoint():
    resp = client.post("/build", json={"parts": [], "connections": []})
    assert resp.status_code == 200
    data = resp.json()
    assert "build_id" in data
    assert "manifest" in data

def test_snap_endpoint():
    # Create build first
    build_resp = client.post("/build", json={"parts": [], "connections": []})
    build_id = build_resp.json()["build_id"]
    resp = client.post("/snap", json={"build_id": build_id, "port_a": {}, "port_b": {}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["connection"] is None

def test_stability_endpoint():
    build_resp = client.post("/build", json={"parts": [], "connections": []})
    build_id = build_resp.json()["build_id"]
    resp = client.post("/stability", json={"build_id": build_id})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stability"] == 100.0
    assert "details" in data

def test_stability_endpoint_falls_back_when_pybullet_runtime_fails(monkeypatch):
    pybullet_module = pytest.importorskip("src.core.physics.pybullet")

    def _raise_runtime_error(_build):
        raise RuntimeError("gc2 mesh load failed")

    monkeypatch.setattr(pybullet_module, "simulate_collapse", _raise_runtime_error)
    monkeypatch.setattr(core_api, "compute_stability", lambda _build: 73.0)

    build_resp = client.post("/build", json={"parts": [], "connections": []})
    build_id = build_resp.json()["build_id"]
    resp = client.post("/stability", json={"build_id": build_id})

    assert resp.status_code == 200
    data = resp.json()
    assert data["stability"] == 73.0
    assert data["details"]["fallback"] == "graph"
    assert "gc2 mesh load failed" in data["details"]["reason"]

def test_export_endpoint():
    resp = client.post("/export", json={"parts": [], "connections": []})
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert data["success"] is True

def test_load_endpoint_normalizes_legacy_center_tangent_port():
    """Legacy center_tangent should be canonicalized to center_tangent_y_pos during load."""
    # Build data with legacy port
    data = {
        "manifest": {"format_version": "1.0", "piece_count": 2},
        "model": {
            "parts": [
                {
                    "instance_id": "rod-1",
                    "part_id": "rod-54-blue-v1",
                    "position": [0.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": "connector-3way-red-v1",
                    "position": [27.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
            ],
            "connections": [
                {
                    "from": "rod-1.center_tangent",
                    "to": "conn-1.A",
                    "joint_type": "fixed",
                }
            ]
        }
    }
    
    resp = client.post("/load", json={"data": data})
    assert resp.status_code == 200
    build_id = resp.json()["build_id"]
    
    # Verify build in store is normalized
    build = core_api.build_store[build_id]
    conn = list(build.connections)[0]
    assert conn.from_port == "center_tangent_y_pos"


# -----------------------------------------------------------------------------
# Legacy port normalization regression tests (API boundary)
# -----------------------------------------------------------------------------

def test_stability_endpoint_normalizes_legacy_center_tangent_port():
    """Legacy center_tangent should be canonicalized to center_tangent_y_pos at API boundary."""
    from src.core.parts.loader import PartLoader
    
    library = PartLoader.load()
    rod = library.get("rod-54-blue-v1")
    conn_3way = library.get("connector-3way-red-v1")
    
    # Build with legacy center_tangent port ID
    resp = client.post(
        "/stability",
        json={
            "parts": [
                {
                    "instance_id": "rod-1",
                    "part_id": rod.id,
                    "position": [0.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
            ],
            "connections": [
                {
                    "from_instance": "rod-1",
                    "from_port": "center_tangent",  # Legacy ID
                    "to_instance": "conn-1",
                    "to_port": "A",
                    "joint_type": "fixed",
                }
            ],
        },
    )
    
    assert resp.status_code == 200, f"Stability endpoint failed: {resp.text}"
    data = resp.json()
    assert "stability" in data


def test_export_endpoint_normalizes_legacy_center_tangent_port():
    """Legacy center_tangent should be canonicalized to center_tangent_y_pos during export."""
    from src.core.parts.loader import PartLoader
    
    library = PartLoader.load()
    rod = library.get("rod-54-blue-v1")
    conn_3way = library.get("connector-3way-red-v1")
    
    # Build with legacy center_tangent port ID
    resp = client.post(
        "/export",
        json={
            "parts": [
                {
                    "instance_id": "rod-1",
                    "part_id": rod.id,
                    "position": [0.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
            ],
            "connections": [
                {
                    "from_instance": "rod-1",
                    "from_port": "center_tangent",  # Legacy ID
                    "to_instance": "conn-1",
                    "to_port": "A",
                    "joint_type": "fixed",
                }
            ],
        },
    )
    
    assert resp.status_code == 200, f"Export endpoint failed: {resp.text}"
    data = resp.json()
    assert data["success"] is True
    # Verify exported data contains canonical port ID
    exported_conns = data["data"]["model"]["connections"]
    for conn in exported_conns:
        # Export format uses dotted strings "inst.port"
        from_ref = conn.get("from", "")
        to_ref = conn.get("to", "")
        assert "center_tangent" not in from_ref or "center_tangent_y_pos" in from_ref
        assert "center_tangent" not in to_ref or "center_tangent_y_pos" in to_ref


def test_diagnostics_endpoint_normalizes_legacy_center_tangent_port():
    """Legacy center_tangent should be canonicalized in diagnostics endpoint."""
    from src.core.parts.loader import PartLoader
    
    library = PartLoader.load()
    rod = library.get("rod-54-blue-v1")
    conn_3way = library.get("connector-3way-red-v1")
    
    # Build with legacy center_tangent port ID
    resp = client.post(
        "/diagnostics/sim-orientation",
        json={
            "parts": [
                {
                    "instance_id": "rod-1",
                    "part_id": rod.id,
                    "position": [0.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
            ],
            "connections": [
                {
                    "from_instance": "rod-1",
                    "from_port": "center_tangent",  # Legacy ID
                    "to_instance": "conn-1",
                    "to_port": "A",
                    "joint_type": "fixed",
                }
            ],
        },
    )
    
    assert resp.status_code == 200, f"Diagnostics endpoint failed: {resp.text}"
    data = resp.json()
    assert "parts" in data
    assert "constraints" in data


def test_stability_endpoint_accepts_explicit_side_ports():
    """Explicit side port IDs should pass through unchanged."""
    from src.core.parts.loader import PartLoader
    
    library = PartLoader.load()
    rod = library.get("rod-54-blue-v1")
    conn_3way = library.get("connector-3way-red-v1")
    
    # Build with explicit side port ID (should not be modified)
    resp = client.post(
        "/stability",
        json={
            "parts": [
                {
                    "instance_id": "rod-1",
                    "part_id": rod.id,
                    "position": [0.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "quaternion": [0.0, 0.0, 0.0, 1.0],
                },
            ],
            "connections": [
                {
                    "from_instance": "rod-1",
                    "from_port": "center_tangent_y_pos",  # Explicit ID (should pass through)
                    "to_instance": "conn-1",
                    "to_port": "A",
                    "joint_type": "fixed",
                }
            ],
        },
    )
    
    assert resp.status_code == 200, f"Stability endpoint failed: {resp.text}"
    data = resp.json()
    assert "stability" in data

