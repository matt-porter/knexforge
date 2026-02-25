"""
FastAPI sidecar exposing core K'NexForge operations as HTTP endpoints.
Endpoints: /build, /snap, /stability, /export, /load
WebSocket: /ws/stability
"""

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict
import uvicorn

# Import core logic (relative imports)
from .build import Build
from .snapping import snap_ports
from .file_io import save_knx, load_knx
from .physics.graph import compute_stability

app = FastAPI(title="K'NexForge Core API")

# --- Pydantic Models ---

class BuildRequest(BaseModel):
    parts: list
    connections: list

class BuildResponse(BaseModel):
    build_id: str
    manifest: dict

class SnapRequest(BaseModel):
    build_id: str
    port_a: dict
    port_b: dict

class SnapResponse(BaseModel):
    success: bool
    connection: dict | None

class StabilityRequest(BaseModel):
    build_id: str | None = None
    parts: list | None = None
    connections: list | None = None

class StabilityResponse(BaseModel):
    stability: float
    details: dict
    stress_data: Dict[str, float] | None = None

class ExportRequest(BaseModel):
    build_id: str
    format: str

class ExportResponse(BaseModel):
    data: Any

class LoadRequest(BaseModel):
    file: bytes

class LoadResponse(BaseModel):
    build_id: str
    manifest: dict

# --- In-memory build store (for demo; replace with persistent store as needed) ---
build_store: Dict[str, Build] = {}

# --- Endpoints ---

@app.post("/build", response_model=BuildResponse)
def create_build(req: BuildRequest):
    # TODO: Implement build creation from parts/connections
    # Placeholder logic
    build = Build()
    build_id = "build-001"  # TODO: generate unique ID
    build_store[build_id] = build
    manifest = {}  # TODO: serialize build manifest
    return BuildResponse(build_id=build_id, manifest=manifest)

@app.post("/snap", response_model=SnapResponse)
def snap(req: SnapRequest):
    # TODO: Implement snapping logic
    build = build_store.get(req.build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    # Placeholder: always fail
    return SnapResponse(success=False, connection=None)

@app.post("/stability", response_model=StabilityResponse)
def stability(req: StabilityRequest):
    from .parts.loader import PartLoader
    from .parts.models import PartInstance, Connection
    library = PartLoader.load()
    
    if req.parts is not None and req.connections is not None:
        build = Build()
        try:
            for p in req.parts:
                part_def = library.get(p["part_id"])
                inst = PartInstance(
                    instance_id=p["instance_id"],
                    part=part_def,
                    position=tuple(p["position"]),
                    quaternion=tuple(p["rotation"]),
                    color=p.get("color")
                )
                build.add_part(inst, record=False)
            for c in req.connections:
                build.connections.add(Connection(**c))
                build._graph.add_edge(c["from_instance"], c["to_instance"])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid build data: {e}")
    else:
        build = build_store.get(req.build_id)
        if not build:
            raise HTTPException(status_code=404, detail="Build not found")

    try:
        from .physics.pybullet import simulate_collapse
        result = simulate_collapse(build)
        return StabilityResponse(
            stability=result.score * 100.0,
            details={"unstable_parts": result.unstable_parts},
            stress_data=result.stress_data
        )
    except ImportError:
        # Fallback to graph
        stability_score = compute_stability(build)
        return StabilityResponse(stability=stability_score, details={}, stress_data={})

@app.post("/export", response_model=ExportResponse)
def export(req: ExportRequest):
    build = build_store.get(req.build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    # TODO: Implement export logic
    return ExportResponse(data=None)

@app.post("/load", response_model=LoadResponse)
def load(req: LoadRequest):
    # TODO: Implement load logic
    build_id = "build-002"  # TODO: generate unique ID
    manifest = {}  # TODO: parse manifest
    build_store[build_id] = Build()
    return LoadResponse(build_id=build_id, manifest=manifest)

# --- WebSocket for real-time stability updates ---
@app.websocket("/ws/stability")
async def ws_stability(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            build_id = data.get("build_id")
            build = build_store.get(build_id)
            if not build:
                await websocket.send_json({"error": "Build not found"})
                continue
            # Placeholder: always send stability=1.0
            await websocket.send_json({"stability": 1.0, "details": {}})
    except Exception:
        await websocket.close()

# --- Entrypoint for running with uvicorn ---
if __name__ == "__main__":
    uvicorn.run("src.core.api:app", host="127.0.0.1", port=8000, reload=True)
