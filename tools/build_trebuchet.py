"""Build a K'Nex trebuchet model and append to dataset.jsonl."""

import json
import sys
import uuid

sys.path.insert(0, ".")

from src.core.build import Build
from src.core.parts.loader import PartLoader
from src.core.parts.models import PartInstance
from src.core.snapping import align_part_to_port, snap_ports
from src.core.physics.graph import compute_stability


def build_trebuchet():
    library = PartLoader.load()
    build = Build()

    def get_part(part_id):
        return library.get(part_id)

    def place_first(part_id, position=(0.0, 0.0, 0.0), quaternion=(0.0, 0.0, 0.0, 1.0)):
        inst = PartInstance(
            instance_id=str(uuid.uuid4()),
            part=get_part(part_id),
            position=position,
            quaternion=quaternion,
        )
        build.add_part(inst)
        return inst

    def attach(new_part_id, new_port_id, target_inst, target_port_id, twist_deg=0):
        """Attach a new part to an existing one. Returns the new PartInstance or None."""
        new_part = get_part(new_part_id)
        temp = PartInstance(
            instance_id=str(uuid.uuid4()),
            part=new_part,
            position=(0.0, 0.0, 0.0),
            quaternion=(0.0, 0.0, 0.0, 1.0),
        )
        pos, rot = align_part_to_port(
            placing_instance=temp,
            placing_port_id=new_port_id,
            target_instance=target_inst,
            target_port_id=target_port_id,
            twist_deg=twist_deg,
        )
        inst = PartInstance(
            instance_id=temp.instance_id,
            part=new_part,
            position=pos,
            quaternion=rot,
        )

        result = snap_ports(
            target_inst, target_port_id, inst, new_port_id, tolerance_mm=0.5,
        )
        if result is None:
            print(f"  SNAP FAILED: {new_part_id}.{new_port_id} -> "
                  f"{target_inst.part.id}.{target_port_id} twist={twist_deg}")
            return None

        build.add_part(inst)
        conn = build.attempt_snap(
            from_instance_id=target_inst.instance_id,
            from_port_id=target_port_id,
            to_instance_id=inst.instance_id,
            to_port_id=new_port_id,
        )
        if conn is None:
            build.remove_part(inst.instance_id, record=False)
            print(f"  ATTEMPT_SNAP FAILED: {new_part_id}.{new_port_id} -> "
                  f"{target_inst.part.id}.{target_port_id}")
            return None

        print(f"  OK: {new_part_id}.{new_port_id} -> {target_inst.part.id}.{target_port_id} "
              f"pos={[round(x, 1) for x in pos]}")
        return inst

    def try_snap(inst_a, port_a, inst_b, port_b):
        """Try to snap two already-placed parts. Returns True on success."""
        conn = build.attempt_snap(
            from_instance_id=inst_a.instance_id,
            from_port_id=port_a,
            to_instance_id=inst_b.instance_id,
            to_port_id=port_b,
        )
        if conn:
            print(f"  CLOSED: {inst_a.part.id}.{port_a} -> {inst_b.part.id}.{port_b}")
        else:
            print(f"  CLOSE FAILED: {inst_a.part.id}.{port_a} -> {inst_b.part.id}.{port_b}")
        return conn is not None

    # ========== BUILD THE TREBUCHET ==========
    #
    # COORDINATE SYSTEM: X = left-right, Y = front-back, Z = up
    #
    # TOP VIEW (looking down):
    #
    #   base_BL ---- rod_back (190mm) ---- base_BR
    #     |                                  |
    #   side_L (86mm)                    side_R (86mm)
    #     |                                  |
    #   base_FL ---- rod_front (190mm) --- base_FR
    #
    # SIDE VIEW:
    #
    #       [top_L]----axle (190mm)----[top_R]
    #     CW←  |                          |  →Throw
    #        tower_L (128mm)        tower_R (128mm)
    #          |                          |
    #       base_FL---rod_front(190mm)---base_FR
    #
    # After mounting 5-way connectors on towers with default rotation (R_y(180°)):
    #   Port A faces -X (LEFT), Port E faces +X (RIGHT)
    #   Port C faces +Y, Ports B/D are diagonal
    #
    # So:  axle = top_L.E(+X) → top_R.A(-X)
    #      throw arm = top_R.E (+X, outward right)
    #      CW arm = top_L.A (-X, outward left)

    print("=== RECTANGULAR BASE FRAME ===")

    # Front-left corner at origin
    base_FL = place_first("connector-8way-white-v1")
    print(f"  base_FL at origin")

    # Front base rod (190mm) from base_FL.N (+X)
    rod_front = attach("rod-190-grey-v1", "end1", base_FL, "N")

    # Front-right corner (rod comes from -X → port S faces -X)
    base_FR = attach("connector-8way-white-v1", "S", rod_front, "end2")

    # Left side rod (86mm) from base_FL.E (+Y)
    side_L = attach("rod-86-yellow-v1", "end1", base_FL, "E")

    # Back-left corner (rod comes from -Y → port W faces -Y)
    base_BL = attach("connector-8way-white-v1", "W", side_L, "end2")

    # Back base rod (190mm) from base_BL.N (+X)
    rod_back = attach("rod-190-grey-v1", "end1", base_BL, "N")

    # Back-right corner (rod comes from -X → port S faces -X)
    base_BR = attach("connector-8way-white-v1", "S", rod_back, "end2")

    # Right side rod (86mm) from base_FR.E (+Y)
    side_R = attach("rod-86-yellow-v1", "end1", base_FR, "E")

    # Close rectangle: side_R.end2 → base_BR.W (faces -Y)
    if side_R and base_BR:
        try_snap(side_R, "end2", base_BR, "W")

    print("\n=== TOWERS ===")

    # Left tower (128mm) through base_FL center (up along +Z)
    tower_L = attach("rod-128-red-v1", "end1", base_FL, "center")

    # Right tower (128mm) through base_FR center (up along +Z)
    tower_R = attach("rod-128-red-v1", "end1", base_FR, "center")

    print("\n=== TOP PIVOT CONNECTORS (5-way yellow) ===")

    # Place 5-way connectors on tower tops via center port
    top_L = attach("connector-5way-yellow-v1", "center", tower_L, "end2")
    top_R = attach("connector-5way-yellow-v1", "center", tower_R, "end2")

    print("\n=== AXLE BEAM (190mm rod connecting tower tops) ===")

    # top_L.E faces +X, top_R.A faces -X → they face each other
    axle = attach("rod-190-grey-v1", "end1", top_L, "E")
    if axle and top_R:
        try_snap(axle, "end2", top_R, "A")

    print("\n=== THROWING ARM (128mm red rod extending right from top_R) ===")

    # top_R.E faces +X (outward right)
    throw_arm = attach("rod-128-red-v1", "end1", top_R, "E")
    sling_point = None
    if throw_arm:
        sling_point = attach("connector-3way-red-v1", "A", throw_arm, "end2")

    print("\n=== COUNTERWEIGHT ARM (54mm blue rod extending left from top_L) ===")

    # top_L.A faces -X (outward left)
    cw_arm = attach("rod-54-blue-v1", "end1", top_L, "A")
    cw_hub = None
    if cw_arm:
        cw_hub = attach("connector-5way-yellow-v1", "A", cw_arm, "end2")

    print("\n=== COUNTERWEIGHT DANGLERS ===")

    if cw_hub:
        for port in ["C", "D"]:
            dangle = attach("rod-16-green-v1", "end1", cw_hub, port)
            if dangle:
                attach("connector-1way-grey-v1", "A", dangle, "end2")

    print("\n=== SLING RODS ===")

    if sling_point:
        for port in ["B", "C"]:
            sling = attach("rod-32-white-v1", "end1", sling_point, port)
            if sling:
                attach("connector-1way-grey-v1", "A", sling, "end2")

    print("\n=== BASE OUTRIGGER BRACES ===")

    # Add diagonal outriggers from base corners for wider footprint
    for base_conn, port in [(base_FL, "SW"), (base_FR, "NW"),
                             (base_BL, "SE"), (base_BR, "NE")]:
        brace = attach("rod-32-white-v1", "end1", base_conn, port)
        if brace:
            attach("connector-1way-grey-v1", "A", brace, "end2")

    # ========== OUTPUT ==========
    print(f"\n=== RESULT ===")
    print(f"Parts: {len(build.parts)}")
    print(f"Connections: {len(build.connections)}")
    score = float(compute_stability(build))
    print(f"Stability: {score:.1f}")
    print(f"Is stable: {score > 50.0}")

    return build, score


if __name__ == "__main__":
    build, score = build_trebuchet()

    actions = [json.loads(line) for line in build.history.to_jsonl().splitlines()]

    data = {
        "id": "trebuchet_001",
        "caption": (
            "A K'Nex trebuchet with a rectangular base frame, two vertical tower uprights, "
            "an axle beam connecting the towers at the top, an asymmetric throwing arm with "
            "sling basket, and a counterweight arm with hanging weights. "
            f"Features {len(build.parts)} pieces."
        ),
        "stability": score,
        "is_stable": bool(score > 50.0),
        "actions": actions,
    }

    with open("dataset.jsonl", "a") as f:
        f.write(json.dumps(data) + "\n")
    print(f"\nAppended to dataset.jsonl ({len(actions)} actions)")
