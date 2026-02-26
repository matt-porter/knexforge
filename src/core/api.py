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
                conn = Connection(**c)
                build.connections.add(conn)
                build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=conn.joint_type)
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

import asyncio

@app.websocket("/ws/simulate")
async def ws_simulate(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        from .parts.loader import PartLoader
        from .parts.models import PartInstance, Connection
        library = PartLoader.load()
        build = Build()
        
        for p_data in data.get("parts", []):
            part_def = library.get(p_data["part_id"])
            inst = PartInstance(
                instance_id=p_data["instance_id"],
                part=part_def,
                position=tuple(p_data["position"]),
                quaternion=tuple(p_data.get("rotation", p_data.get("quaternion", [0,0,0,1]))),
                color=p_data.get("color")
            )
            build.add_part(inst, record=False)
            
        for c in data.get("connections", []):
            conn = Connection(**c)
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=conn.joint_type)

        from .physics.pybullet import PyBulletSimulator
        import pybullet as p
        
        with PyBulletSimulator(build) as sim:
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id
                
                # Anchor the motor (mass=0 makes it static)
                if "motor" in part_inst.part.id:
                    p.changeDynamics(body_id, -1, mass=0.0)
            
            sim.create_joints()
            
            p.setGravity(0, 0, 0.0) # Zero gravity for maximum visibility of spin
            motor_speed = float(data.get("motor_speed", 10.0))
            
            motor_ids = [i for i, part in build.parts.items() if "motor" in part.part.id]
            driven_info = [] # (body_id, axis_world)
            for conn in build.connections:
                if conn.from_instance in motor_ids or conn.to_instance in motor_ids:
                    m_id = conn.from_instance if conn.from_instance in motor_ids else conn.to_instance
                    d_id = conn.to_instance if m_id == conn.from_instance else conn.from_instance

                    motor_port_id = conn.from_port if m_id == conn.from_instance else conn.to_port
                    # Only drive the motor's axle connection. This avoids applying motor torque
                    # through static mounting snaps (mount_1 / mount_2) when present.
                    if motor_port_id != "drive_axle" and conn.joint_type != "revolute":
                        continue

                    m_inst = build.parts[m_id]
                    m_port = m_inst.get_port(motor_port_id)
                    from scipy.spatial.transform import Rotation as R
                    m_rot = R.from_quat(m_inst.quaternion)
                    axis_world = m_rot.apply(m_port.direction)
                    b_id = sim.part_bodies.get(d_id)
                    if b_id is not None:
                        driven_info.append((b_id, axis_world))
            
            # Signal ready to frontend
            await websocket.send_json({"type": "status", "data": "ready"})
            
            while True:
                try:
                    msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                    if "motor_speed" in msg:
                        motor_speed = float(msg["motor_speed"])
                    if msg.get("action") == "stop":
                        break
                except asyncio.TimeoutError:
                    pass
                except Exception:
                    break

                # Run physics steps
                for _ in range(4):
                    for b_id, axis in driven_info:
                        # Massive torque application
                        torque_vec = [axis[0] * motor_speed * 10000.0, axis[1] * motor_speed * 10000.0, axis[2] * motor_speed * 10000.0]
                        p.applyExternalTorque(b_id, -1, torque_vec, p.WORLD_FRAME)
                    p.stepSimulation()

                transforms = {}
                for inst_id, body_id in sim.part_bodies.items():
                    pos, quat = p.getBasePositionAndOrientation(body_id)
                    transforms[inst_id] = {"position": pos, "quaternion": quat}
                
                await websocket.send_json({"type": "transforms", "data": transforms})
                await asyncio.sleep(1/60.0)

    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass

# --- Entrypoint for running with uvicorn ---
if __name__ == "__main__":
    uvicorn.run("src.core.api:app", host="127.0.0.1", port=8000, reload=True)
