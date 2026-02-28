"""
FastAPI sidecar exposing core K'NexForge operations as HTTP endpoints.
Endpoints: /build, /snap, /stability, /export, /load
WebSocket: /ws/stability, /ws/simulate
"""

import logging

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict
import uvicorn

# Import core logic (relative imports)
from .build import Build
from .snapping import snap_ports
from .file_io import save_knx, load_knx
from .physics.graph import compute_stability

logger = logging.getLogger("knexforge.api")

app = FastAPI(title="K'NexForge Core API")

# CORS — allow the Vite dev server and Tauri WebView to reach the sidecar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- Sim-orientation diagnostic models ---

class PartOrientationDiag(BaseModel):
    initial_position: list[float]
    initial_quaternion: list[float]
    after_position: list[float]
    after_quaternion: list[float]
    rotation_delta_deg: float
    euler_delta_deg: list[float]
    flipped: bool

class ConstraintDiag(BaseModel):
    from_instance: str
    to_instance: str
    joint_type: str
    anchor_count: int

class SimOrientationResponse(BaseModel):
    parts: Dict[str, PartOrientationDiag]
    constraints: list[ConstraintDiag]

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

# --- Diagnostics ---

@app.post("/diagnostics/sim-orientation", response_model=SimOrientationResponse)
def diagnostics_sim_orientation(req: BuildRequest):
    """Step simulation 1 frame (zero gravity, no torque) and report orientation deltas."""
    from .parts.loader import PartLoader
    from .parts.models import PartInstance, Connection
    import numpy as np
    from scipy.spatial.transform import Rotation as R

    library = PartLoader.load()
    build = Build()

    try:
        for p_data in req.parts:
            part_def = library.get(p_data["part_id"])
            inst = PartInstance(
                instance_id=p_data["instance_id"],
                part=part_def,
                position=tuple(p_data["position"]),
                quaternion=tuple(p_data.get("rotation", p_data.get("quaternion", [0, 0, 0, 1]))),
                color=p_data.get("color"),
            )
            build.add_part(inst, record=False)
        for c in req.connections:
            conn = Connection(**c)
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=conn.joint_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid build data: {e}")

    try:
        from .physics.pybullet import PyBulletSimulator
        import pybullet as pb
    except ImportError:
        raise HTTPException(status_code=501, detail="pybullet not installed")

    parts_diag: Dict[str, PartOrientationDiag] = {}
    constraints_diag: list[ConstraintDiag] = []

    with PyBulletSimulator(build) as sim:
        for inst_id, part_inst in build.parts.items():
            body_id = sim.load_part_mesh(part_inst)
            sim.part_bodies[inst_id] = body_id

        sim.create_joints()
        pb.setGravity(0, 0, 0, physicsClientId=sim.client)

        # Capture initial state
        initial: Dict[str, tuple] = {}
        for inst_id, body_id in sim.part_bodies.items():
            pos, quat = pb.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
            initial[inst_id] = (list(pos), list(quat))

        # Step 1 frame (4 sub-steps, matching ws/simulate)
        for _ in range(4):
            pb.stepSimulation(physicsClientId=sim.client)

        # Collect results
        for inst_id, body_id in sim.part_bodies.items():
            pos, quat = pb.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
            i_pos, i_quat = initial[inst_id]

            r1 = R.from_quat(i_quat)
            r2 = R.from_quat(list(quat))
            delta = r2 * r1.inv()
            rotation_delta = float(np.degrees(delta.magnitude()))
            euler = delta.as_euler("xyz", degrees=True).tolist()

            parts_diag[inst_id] = PartOrientationDiag(
                initial_position=i_pos,
                initial_quaternion=i_quat,
                after_position=list(pos),
                after_quaternion=list(quat),
                rotation_delta_deg=rotation_delta,
                euler_delta_deg=euler,
                flipped=rotation_delta > 45.0,
            )

        # Collect constraint info
        body_to_inst = {v: k for k, v in sim.part_bodies.items()}
        anchor_counts: dict[int, int] = {}
        anchor_meta: dict[int, dict] = {}
        for jc in sim.joint_constraints:
            c_id = jc["id"]
            info = pb.getConstraintInfo(c_id, physicsClientId=sim.client)
            parent_body = info[0]
            child_body = info[2]
            joint_type_id = info[4]

            joint_name = {
                pb.JOINT_POINT2POINT: "P2P",
                pb.JOINT_FIXED: "FIXED",
                pb.JOINT_REVOLUTE: "REVOLUTE",
                pb.JOINT_PRISMATIC: "PRISMATIC",
            }.get(joint_type_id, f"UNKNOWN({joint_type_id})")

            key = (parent_body, child_body)
            anchor_counts[key] = anchor_counts.get(key, 0) + 1
            anchor_meta[key] = {
                "from_instance": body_to_inst.get(parent_body, f"body-{parent_body}"),
                "to_instance": body_to_inst.get(child_body, f"body-{child_body}"),
                "joint_type": joint_name,
            }

        for key, count in anchor_counts.items():
            meta = anchor_meta[key]
            constraints_diag.append(ConstraintDiag(
                from_instance=meta["from_instance"],
                to_instance=meta["to_instance"],
                joint_type=meta["joint_type"],
                anchor_count=count,
            ))

    return SimOrientationResponse(parts=parts_diag, constraints=constraints_diag)


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
import traceback

@app.websocket("/ws/simulate")
async def ws_simulate(websocket: WebSocket):
    await websocket.accept()
    logger.info("[SIM] WebSocket accepted")
    try:
        data = await websocket.receive_json()
        from .parts.loader import PartLoader
        from .parts.models import PartInstance, Connection
        library = PartLoader.load()
        build = Build()

        parts_data = data.get("parts", [])
        conns_data = data.get("connections", [])
        logger.info("[SIM] Received %d parts, %d connections", len(parts_data), len(conns_data))

        for p_data in parts_data:
            part_def = library.get(p_data["part_id"])
            inst = PartInstance(
                instance_id=p_data["instance_id"],
                part=part_def,
                position=tuple(p_data["position"]),
                quaternion=tuple(p_data.get("rotation", p_data.get("quaternion", [0,0,0,1]))),
                color=p_data.get("color")
            )
            build.add_part(inst, record=False)

        for c in conns_data:
            conn = Connection(**c)
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance, joint_type=conn.joint_type)
            logger.info(
                "[SIM] Connection: %s.%s -> %s.%s  joint_type=%s",
                conn.from_instance[:8], conn.from_port,
                conn.to_instance[:8], conn.to_port,
                conn.joint_type,
            )

        from .physics.pybullet import PyBulletSimulator
        import pybullet as pb

        with PyBulletSimulator(build) as sim:
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id
                logger.info(
                    "[SIM] Loaded body %d for %s (%s)",
                    body_id, inst_id[:8], part_inst.part.id,
                )

                if "motor" in part_inst.part.id:
                    pb.changeDynamics(body_id, -1, mass=0.0, physicsClientId=sim.client)
                    logger.info("[SIM] Anchored motor body %d (mass=0)", body_id)

            sim.create_joints()
            logger.info("[SIM] Created %d joint constraints", len(sim.joint_constraints))

            pb.setGravity(0, 0, 0.0, physicsClientId=sim.client)
            motor_speed = float(data.get("motor_speed", 10.0))

            motor_ids = [i for i, part in build.parts.items() if "motor" in part.part.id]
            logger.info("[SIM] Motor instance IDs: %s", [mid[:8] for mid in motor_ids])

            driven_info = []
            for conn in build.connections:
                if conn.from_instance in motor_ids or conn.to_instance in motor_ids:
                    m_id = conn.from_instance if conn.from_instance in motor_ids else conn.to_instance
                    d_id = conn.to_instance if m_id == conn.from_instance else conn.from_instance

                    motor_port_id = conn.from_port if m_id == conn.from_instance else conn.to_port

                    m_inst = build.parts[m_id]
                    m_port = m_inst.get_port(motor_port_id)
                    logger.info(
                        "[SIM] Motor connection: motor_port=%s  mate_type=%s",
                        motor_port_id, m_port.mate_type,
                    )
                    if m_port.mate_type != "rotational_hole":
                        logger.info("[SIM]   -> SKIPPED (not rotational_hole)")
                        continue
                    from scipy.spatial.transform import Rotation as R
                    m_rot = R.from_quat(m_inst.quaternion)
                    axis_world = m_rot.apply(m_port.direction)
                    b_id = sim.part_bodies.get(d_id)
                    if b_id is not None:
                        driven_info.append((b_id, axis_world))
                        logger.info(
                            "[SIM]   -> DRIVING body %d, axis_world=%s",
                            b_id, axis_world.tolist(),
                        )
                    else:
                        logger.warning("[SIM]   -> driven body NOT FOUND for %s", d_id[:8])

            logger.info("[SIM] driven_info has %d entries, motor_speed=%.1f", len(driven_info), motor_speed)

            if not driven_info:
                logger.warning("[SIM] No driven bodies — motor will not spin anything!")

            await websocket.send_json({"type": "status", "data": "ready"})
            logger.info("[SIM] Sent 'ready', entering simulation loop")

            frame_count = 0
            while True:
                try:
                    msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                    if "motor_speed" in msg:
                        motor_speed = float(msg["motor_speed"])
                    if msg.get("action") == "stop":
                        logger.info("[SIM] Stop requested by client")
                        break
                except asyncio.TimeoutError:
                    pass
                except Exception:
                    break

                # Torque scaled to realistic K'Nex masses (~1 g parts).
                # constraint_force(100k) × arm(30mm) ≈ 3000 N·m max resistive torque,
                # so keep applied torque well below that.
                torque_scale = 50.0

                for _ in range(4):
                    for b_id, axis in driven_info:
                        torque_vec = [
                            float(axis[0] * motor_speed * torque_scale),
                            float(axis[1] * motor_speed * torque_scale),
                            float(axis[2] * motor_speed * torque_scale),
                        ]
                        pb.applyExternalTorque(b_id, -1, torque_vec, pb.WORLD_FRAME, physicsClientId=sim.client)
                    pb.stepSimulation(physicsClientId=sim.client)

                transforms: dict[str, Any] = {}
                for inst_id, body_id in sim.part_bodies.items():
                    pos, quat = pb.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
                    transforms[inst_id] = {
                        "position": list(pos),
                        "quaternion": list(quat),
                    }

                if frame_count < 3:
                    logger.info("[SIM] Frame %d transforms sample: %s",
                                frame_count,
                                {k[:8]: v for k, v in list(transforms.items())[:2]})

                await websocket.send_json({"type": "transforms", "data": transforms})
                await asyncio.sleep(1/60.0)
                frame_count += 1

    except Exception as exc:
        logger.error("[SIM] Simulation error: %s\n%s", exc, traceback.format_exc())
        await websocket.send_json({
            "type": "error",
            "data": str(exc),
        })
        try:
            await websocket.close()
        except Exception:
            pass

# --- Entrypoint for running with uvicorn ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run("src.core.api:app", host="127.0.0.1", port=8000, reload=True)
