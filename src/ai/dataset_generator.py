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
from src.core.snapping import align_part_to_port
from src.core.physics.graph import compute_stability

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def generate_procedural_build(library: PartLibrary, max_parts: int = 20) -> Build:
    """Generate a random but valid K'Nex build."""
    build = Build()

    part_types = list(library.parts.keys())
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

        # Find open ports on the target
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

        # Find a compatible port on the new part
        compatible_ports = []
        for port in new_part_def.ports:
            if target_port.mate_type == "rod_hole" and port.mate_type in ("rod_end", "rod_side"):
                compatible_ports.append(port)
            elif target_port.mate_type in ("rod_end", "rod_side") and port.mate_type == "rod_hole":
                compatible_ports.append(port)

        if not compatible_ports:
            continue

        new_port = random.choice(compatible_ports)

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
        )

        new_instance = PartInstance(
            instance_id=temp_instance.instance_id,
            part=new_part_def,
            position=pos,
            quaternion=rot,
        )
        build.add_part(new_instance)

        build.attempt_snap(
            from_instance_id=target_instance_id,
            from_port_id=target_port.id,
            to_instance_id=new_instance.instance_id,
            to_port_id=new_port.id,
        )

    return build


def generate_dataset(output_file: str, count: int, dry_run: bool = False) -> None:
    """Generate generic structural shapes to JSONL format."""
    library = PartLoader.load()

    generated = 0
    stable_builds = 0

    f = None
    try:
        if not dry_run:
            f = open(output_file, "w")

        for i in range(count):
            logger.info(f"Generating model {i+1}/{count}...")
            build = generate_procedural_build(library, max_parts=random.randint(5, 25))

            if not build.parts:
                continue

            score = float(compute_stability(build))
            is_stable = score > 50.0

            if is_stable:
                stable_builds += 1

            caption = f"A random K'Nex structure with {len(build.parts)} pieces."

            data = {
                "id": f"proc_{i:04d}",
                "caption": caption,
                "stability": score,
                "is_stable": is_stable,
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

    logger.info(f"Generated {generated} models. {stable_builds} were stable.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate synthetic K'Nex structures for AI training"
    )
    parser.add_argument("--count", type=int, default=10, help="Number of models to generate")
    parser.add_argument("--out", type=str, default="dataset.jsonl", help="Output JSONL file")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving to disk")
    args = parser.parse_args()

    generate_dataset(args.out, args.count, args.dry_run)
