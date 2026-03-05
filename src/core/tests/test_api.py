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

def test_load_endpoint():
    # 'file_bytes' is base64 for a valid v1.0 build JSON
    import base64
    import json
    # Minimal valid build data
    data = {
        "manifest": {"format_version": "1.0", "piece_count": 0},
        "model": {"parts": [], "connections": []}
    }
    json_str = json.dumps(data)
    b64_str = base64.b64encode(json_str.encode("utf-8")).decode("utf-8")
    
    resp = client.post("/load", json={"data": data})
    assert resp.status_code == 200
    data = resp.json()
    assert "build_id" in data
    assert "manifest" in data


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
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
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
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
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
        from_port = conn.get("from_port", "")
        to_port = conn.get("to_port", "")
        assert from_port != "center_tangent", "Legacy center_tangent should be normalized"
        assert to_port != "center_tangent", "Legacy center_tangent should be normalized"


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
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
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
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                },
                {
                    "instance_id": "conn-1",
                    "part_id": conn_3way.id,
                    "position": [27.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
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

