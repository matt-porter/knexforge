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
    build_resp = client.post("/build", json={"parts": [], "connections": []})
    build_id = build_resp.json()["build_id"]
    resp = client.post("/export", json={"build_id": build_id, "format": "knx"})
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data

def test_load_endpoint():
    resp = client.post("/load", json={"file": "dGVzdA=="})  # base64 for 'test'
    assert resp.status_code == 200
    data = resp.json()
    assert "build_id" in data
    assert "manifest" in data
