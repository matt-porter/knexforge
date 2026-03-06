"""Procedural K'Nex build generator for AI training datasets."""

import argparse
import json
import logging
import random
import uuid
from pathlib import Path

from src.core.build import Build
from src.core.parts.models import PartLibrary, PartInstance
from src.core.parts.loader import PartLoader
from src.core.snapping import align_part_to_port, are_ports_compatible, check_part_overlap, snap_ports
from src.core.physics.graph import compute_stability

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _choose_valid_twist_deg(placing_port, target_port):
    """Choose a twist angle from intersection of allowed_angles, or fallback to target's allowed."""
    angle_set_1 = set(placing_port.allowed_angles_deg)
    angle_set_2 = set(target_port.allowed_angles_deg)
    intersection = angle_set_1 & angle_set_2
    if intersection:
        return random.choice(sorted(list(intersection)))
    else:
        # Fallback to just the target's allowed angles
        return random.choice(sorted(list(angle_set_2)))


def generate_procedural_build(library: PartLibrary, max_parts: int = 20) -> Build:
    """Generate a random but valid K'Nex build, with validated orientation."""
    build = Build()

    part_types = [pid for pid, p in library.parts.items() if p.category != "wheel"]
    if not part_types:
        return build

    # Start with a random part
    first_type = random.choice(part_types)
    first_part = library.parts[first_type]
    first_instance = PartInstance(
        instance_id=str(uuid.uuid4()),
        part=first_part,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )
    build.add_part(first_instance)

    attempts = 0
    while len(build.parts) < max_parts and attempts < max_parts * 5:
        attempts += 1

        # Pick a random existing part to attach to
        target_instance_id = random.choice(list(build.parts.keys()))
        target_instance = build.parts[target_instance_id]
        target_part_def = target_instance.part

        # Find open ports on the target that are not used
        used_ports: set[str] = set()
        for conn in build.connections:
            if conn.from_instance == target_instance_id:
                used_ports.add(conn.from_port)
            elif conn.to_instance == target_instance_id:
                used_ports.add(conn.to_port)

        available_ports = [p for p in target_part_def.ports if p.id not in used_ports]
        if not available_ports:
            continue

        target_port = random.choice(available_ports)

        # Pick a random new part type
        new_type = random.choice(part_types)
        new_part_def = library.parts[new_type]

        # Find a compatible port on the new part (using the accepts field)
        compatible_ports = []
        for port in new_part_def.ports:
            if are_ports_compatible(port, target_port):
                compatible_ports.append(port)

        if not compatible_ports:
            continue

        new_port = random.choice(compatible_ports)

        # --- CRUCIAL DIFF: Valid twist angle selection ---
        twist_deg = _choose_valid_twist_deg(new_port, target_port)

        # Create a temporary instance at origin to pass to align_part_to_port
        temp_instance = PartInstance(
            instance_id=str(uuid.uuid4()),
            part=new_part_def,
            position=(0.0, 0.0, 0.0),
            quaternion=(0.0, 0.0, 0.0, 1.0),
        )

        pos, rot = align_part_to_port(
            placing_instance=temp_instance,
            placing_port_id=new_port.id,
            target_instance=target_instance,
            target_port_id=target_port.id,
            twist_deg=twist_deg,
        )

        new_instance = PartInstance(
            instance_id=temp_instance.instance_id,
            part=new_part_def,
            position=pos,
            quaternion=rot,
        )

        # --- SNAP VALIDATION: Ensure proposed connection is physically valid ---
        result = snap_ports(
            target_instance, target_port.id,
            new_instance, new_port.id,
            tolerance_mm=0.2,
        )
        if result is None:
            continue  # Bad connection; skip and retry

        # --- Collision detection: ensure no part overlap ---
        connected_ids = {target_instance_id}
        if not check_part_overlap(new_instance, build.parts, connected_ids):
            continue  # Would overlap existing parts; skip

        build.add_part(new_instance)

        conn = build.attempt_snap(
            from_instance_id=target_instance_id,
            from_port_id=target_port.id,
            to_instance_id=new_instance.instance_id,
            to_port_id=new_port.id,
        )

        # If snap failed after add, roll back the part
        if conn is None:
            build.remove_part(new_instance.instance_id, record=False)

    return build


def test_mechanism_functional(build: Build) -> bool:
    """Run PyBullet and check if the motor actually moves another part."""
    try:
        from src.core.physics.pybullet import PyBulletSimulator
        import pybullet as p
    except ImportError:
        return False
        
    with PyBulletSimulator(build) as sim:
        for inst_id, part_inst in build.parts.items():
            sim.part_bodies[inst_id] = sim.load_part_mesh(part_inst)
        sim.create_joints()
        
        # Disable gravity for pure mechanism test
        p.setGravity(0, 0, 0)
        
        motor_ids = [i for i, part in build.parts.items() if "motor" in part.part.id]
        if not motor_ids:
            return False
            
        driven_ids = []
        for c in build.connections:
            if c.from_instance in motor_ids:
                driven_ids.append(c.to_instance)
            elif c.to_instance in motor_ids:
                driven_ids.append(c.from_instance)
        
        for _ in range(240):
            for did in driven_ids:
                b_id = sim.part_bodies.get(did)
                if b_id is not None:
                    p.applyExternalTorque(b_id, -1, [50.0, 50.0, 50.0], p.WORLD_FRAME)
            p.stepSimulation()
            
        moving_parts = 0
        for inst_id, body_id in sim.part_bodies.items():
            if inst_id in motor_ids:
                continue
            lin_vel, ang_vel = p.getBaseVelocity(body_id)
            speed = sum(v**2 for v in ang_vel)**0.5
            if speed > 0.5:
                moving_parts += 1
                
        return moving_parts > 0


def generate_motorized_spinner(library: PartLibrary) -> Build:
    """Generate a simple motorized spinner mechanism."""
    build = Build()
    
    motor_def = library.parts.get("motor-v1")
    if not motor_def:
        return build
        
    m_id = str(uuid.uuid4())
    m_inst = PartInstance(instance_id=m_id, part=motor_def, position=(0.0, 0.0, 50.0))
    build.add_part(m_inst)
    
    rod_def = library.parts.get("rod-128-red-v1")
    if not rod_def:
        return build
    
    r_id = str(uuid.uuid4())
    temp_r = PartInstance(instance_id=r_id, part=rod_def)
    pos, rot = align_part_to_port(temp_r, "center_tangent_y_pos", m_inst, "drive_axle", twist_deg=0)
    
    rod_inst = PartInstance(instance_id=r_id, part=rod_def, position=pos, quaternion=rot)
    build.add_part(rod_inst)
    
    conn = build.attempt_snap(m_id, "drive_axle", r_id, "center_tangent_y_pos")
    if not conn:
        return build
        
    conn_def = library.parts.get("connector-4way-green-v1")
    if not conn_def:
        return build
        
    c_id = str(uuid.uuid4())
    temp_c = PartInstance(instance_id=c_id, part=conn_def)
    
    pos, rot = align_part_to_port(temp_c, "center", rod_inst, "end1", twist_deg=0)
    conn_inst = PartInstance(instance_id=c_id, part=conn_def, position=pos, quaternion=rot)
    build.add_part(conn_inst)
    
    build.attempt_snap(r_id, "end1", c_id, "center")
    
    return build


def generate_dataset(output_file: str, count: int, dry_run: bool = False) -> None:
    """Generate generic structural shapes and functioning mechanisms to JSONL format."""
    library = PartLoader.load()

    generated = 0
    stable_builds = 0
    functional_mechanisms = 0

    f = None
    try:
        if not dry_run:
            f = open(output_file, "w")

        for i in range(count):
            logger.info(f"Generating model {i+1}/{count}...")
            
            is_mechanism = (i % 2 == 1)
            if is_mechanism:
                build = generate_motorized_spinner(library)
                caption = "Generate a K'NEX motorized spinner mechanism."
                score = 100.0
                is_stable = True
                
                is_functional = test_mechanism_functional(build)
                if not is_functional:
                    logger.warning(f"Mechanism {i+1} failed functional test, skipping.")
                    continue
                functional_mechanisms += 1
                stable_builds += 1
            else:
                build = generate_procedural_build(library, max_parts=random.randint(5, 25))
                if len(build.parts) < 2:
                    continue

                score = float(compute_stability(build))

                # Skip disconnected builds (stability 0 means disconnected graph)
                if score == 0.0:
                    logger.warning(f"Model {i+1} is disconnected, skipping.")
                    continue

                is_stable = score > 50.0
                if is_stable:
                    stable_builds += 1

                caption = f"A random K'Nex structure with {len(build.parts)} pieces."

            data = {
                "id": f"proc_{i:04d}",
                "caption": caption,
                "stability": score,
                "is_stable": is_stable,
                "is_mechanism": is_mechanism,
                "actions": [
                    json.loads(line) for line in build.history.to_jsonl().splitlines()
                ],
            }

            if not dry_run and f is not None:
                f.write(json.dumps(data) + "\n")

            generated += 1
    finally:
        if f is not None:
            f.close()

    logger.info(f"Generated {generated} models. {stable_builds} were stable, {functional_mechanisms} mechanisms functional.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate synthetic K'Nex structures for AI training"
    )
    parser.add_argument("--count", type=int, default=10, help="Number of models to generate")
    parser.add_argument("--out", type=str, default="dataset.jsonl", help="Output JSONL file")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving to disk")
    args = parser.parse_args()

    generate_dataset(args.out, args.count, args.dry_run)
