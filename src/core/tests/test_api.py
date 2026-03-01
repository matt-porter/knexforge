"""
Tests for FastAPI sidecar (src/core/api.py)
"""
import pytest
from fastapi.testclient import TestClient
from src.core.api import app

client = TestClient(app)

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
