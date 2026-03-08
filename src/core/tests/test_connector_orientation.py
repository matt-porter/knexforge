"""
Tests for the connector-flip bug: when a connector is clipped side-on or
end-on to a rod and the user presses simulate, the connector flips 90° in
the first frame.

These tests create rod+connector builds, step PyBullet with zero gravity,
and assert that orientations are preserved (no phantom 90° flip).
"""

import importlib
import pytest
import numpy as np
from scipy.spatial.transform import Rotation as R

pybullet_mod = importlib.util.find_spec("pybullet")
pytestmark = pytest.mark.skipif(pybullet_mod is None, reason="pybullet not installed")

try:
    from src.core.build import Build
    from src.core.parts.loader import PartLoader
    from src.core.physics.pybullet import PyBulletSimulator, CollapseResult
    from src.core.parts.models import PartInstance, Connection
    from src.core.snapping import align_part_to_port
except ImportError:
    Build = None
    PartLoader = None
    PyBulletSimulator = None
    CollapseResult = None
    PartInstance = None
    Connection = None
    align_part_to_port = None

FLIP_THRESHOLD_DEG = 45.0


def quat_angle_deg(q1, q2):
    """Compute angle in degrees between two quaternions."""
    r1 = R.from_quat(q1)
    r2 = R.from_quat(q2)
    delta = r2 * r1.inv()
    return np.degrees(delta.magnitude())


def euler_delta_deg(q1, q2):
    """Compute per-axis Euler angle delta (degrees) between two quaternions."""
    r1 = R.from_quat(q1)
    r2 = R.from_quat(q2)
    delta = r2 * r1.inv()
    return delta.as_euler("xyz", degrees=True)


def _run_zero_gravity_sim(build: Build, steps: int = 10):
    """Run a PyBullet simulation with zero gravity and return per-part state dicts.

    Returns:
        dict mapping instance_id -> {
            "initial_position", "initial_quaternion",
            "after_position", "after_quaternion",
        }
    """
    import pybullet as p

    results = {}
    with PyBulletSimulator(build) as sim:
        for inst_id, part_inst in build.parts.items():
            body_id = sim.load_part_mesh(part_inst)
            sim.part_bodies[inst_id] = body_id

        sim.create_joints()

        p.setGravity(0, 0, 0, physicsClientId=sim.client)

        initial = {}
        for inst_id, body_id in sim.part_bodies.items():
            pos, quat = p.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
            initial[inst_id] = (list(pos), list(quat))

        for _ in range(steps):
            p.stepSimulation(physicsClientId=sim.client)

        for inst_id, body_id in sim.part_bodies.items():
            pos, quat = p.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
            results[inst_id] = {
                "initial_position": initial[inst_id][0],
                "initial_quaternion": initial[inst_id][1],
                "after_position": list(pos),
                "after_quaternion": list(quat),
            }

    return results


def _make_side_clip_build(rod_side_port_id: str = "center_tangent"):
    """Create a connector + rod with side-on clip (rod side port → connector A)."""
    library = PartLoader.load()
    conn_def = library.get("connector-2way-orange-v1")
    rod_def = library.get("rod-54-blue-v1")

    conn_inst = PartInstance(
        instance_id="conn1",
        part=conn_def,
        position=(0.0, 0.0, 50.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )

    # Place rod so the selected rod-side port aligns to the connector's port A
    rod_placeholder = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )

    new_pos, new_quat = align_part_to_port(
        rod_placeholder, rod_side_port_id,
        conn_inst, "A",
    )

    rod_inst = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=new_pos,
        quaternion=new_quat,
    )

    build = Build()
    build.add_part(conn_inst, record=False)
    build.add_part(rod_inst, record=False)
    build.connections.add(Connection(
        from_instance="rod1", from_port=rod_side_port_id,
        to_instance="conn1", to_port="A",
        joint_type="fixed",
    ))
    build._graph.add_edge("rod1", "conn1", joint_type="fixed")

    return build


def _make_end_on_build():
    """Create a connector + rod with end-on clip (end1 → port A)."""
    library = PartLoader.load()
    conn_def = library.get("connector-2way-orange-v1")
    rod_def = library.get("rod-54-blue-v1")

    conn_inst = PartInstance(
        instance_id="conn1",
        part=conn_def,
        position=(0.0, 0.0, 50.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )

    rod_placeholder = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )

    new_pos, new_quat = align_part_to_port(
        rod_placeholder, "end1",
        conn_inst, "A",
    )

    rod_inst = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=new_pos,
        quaternion=new_quat,
    )

    build = Build()
    build.add_part(conn_inst, record=False)
    build.add_part(rod_inst, record=False)
    build.connections.add(Connection(
        from_instance="rod1", from_port="end1",
        to_instance="conn1", to_port="A",
        joint_type="fixed",
    ))
    build._graph.add_edge("rod1", "conn1", joint_type="fixed")

    return build


# --------------------------------------------------------------------------
# a) Side-on clip orientation preserved
# --------------------------------------------------------------------------
@pytest.mark.skipif(Build is None, reason="Cannot import core modules.")
@pytest.mark.parametrize(
    "rod_side_port_id",
    [
        "center_tangent",
        "center_tangent_y_pos",
        "center_tangent_y_neg",
        "center_tangent_z_pos",
        "center_tangent_z_neg",
    ],
)
def test_side_clip_orientation_preserved(rod_side_port_id):
    build = _make_side_clip_build(rod_side_port_id)
    results = _run_zero_gravity_sim(build, steps=10)

    conn_data = results["conn1"]
    delta = quat_angle_deg(conn_data["initial_quaternion"], conn_data["after_quaternion"])

    assert delta < FLIP_THRESHOLD_DEG, (
        f"Connector flipped {delta:.1f}° after side-on clip simulation ({rod_side_port_id}) "
        f"(threshold {FLIP_THRESHOLD_DEG}°)"
    )

    rod_data = results["rod1"]
    rod_delta = quat_angle_deg(rod_data["initial_quaternion"], rod_data["after_quaternion"])
    assert rod_delta < FLIP_THRESHOLD_DEG, (
        f"Rod flipped {rod_delta:.1f}° after side-on clip simulation ({rod_side_port_id})"
    )


# --------------------------------------------------------------------------
# b) End-on clip orientation preserved
# --------------------------------------------------------------------------
@pytest.mark.skipif(Build is None, reason="Cannot import core modules.")
def test_end_on_orientation_preserved():
    build = _make_end_on_build()
    results = _run_zero_gravity_sim(build, steps=10)

    conn_data = results["conn1"]
    delta = quat_angle_deg(conn_data["initial_quaternion"], conn_data["after_quaternion"])

    assert delta < FLIP_THRESHOLD_DEG, (
        f"Connector flipped {delta:.1f}° after end-on clip simulation "
        f"(threshold {FLIP_THRESHOLD_DEG}°)"
    )

    rod_data = results["rod1"]
    rod_delta = quat_angle_deg(rod_data["initial_quaternion"], rod_data["after_quaternion"])
    assert rod_delta < FLIP_THRESHOLD_DEG, (
        f"Rod flipped {rod_delta:.1f}° after end-on clip simulation"
    )


# --------------------------------------------------------------------------
# c) Motor-driven connector orientation (no first-frame flip)
# --------------------------------------------------------------------------
@pytest.mark.skipif(Build is None, reason="Cannot import core modules.")
def test_motor_driven_connector_orientation():
    import pybullet as p

    library = PartLoader.load()
    motor_def = library.get("motor-v1")
    rod_def = library.get("rod-54-blue-v1")
    conn_def = library.get("connector-2way-orange-v1")

    # Motor at origin, anchored (mass=0)
    motor_inst = PartInstance(
        instance_id="motor1",
        part=motor_def,
        position=(0.0, 0.0, 50.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )

    # Align rod end1 → motor drive_axle (revolute)
    rod_placeholder = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )
    rod_pos, rod_quat = align_part_to_port(
        rod_placeholder, "end1",
        motor_inst, "drive_axle",
    )
    rod_inst = PartInstance(
        instance_id="rod1",
        part=rod_def,
        position=rod_pos,
        quaternion=rod_quat,
    )

    # Align connector port A → rod end2 (fixed)
    conn_placeholder = PartInstance(
        instance_id="conn1",
        part=conn_def,
        position=(0.0, 0.0, 0.0),
        quaternion=(0.0, 0.0, 0.0, 1.0),
    )
    conn_pos, conn_quat = align_part_to_port(
        conn_placeholder, "A",
        rod_inst, "end2",
    )
    conn_inst = PartInstance(
        instance_id="conn1",
        part=conn_def,
        position=conn_pos,
        quaternion=conn_quat,
    )

    build = Build()
    build.add_part(motor_inst, record=False)
    build.add_part(rod_inst, record=False)
    build.add_part(conn_inst, record=False)

    # motor → rod (revolute via drive_axle)
    build.connections.add(Connection(
        from_instance="motor1", from_port="drive_axle",
        to_instance="rod1", to_port="end1",
        joint_type="revolute",
    ))
    build._graph.add_edge("motor1", "rod1", joint_type="revolute")

    # rod → connector (fixed via end2/A)
    build.connections.add(Connection(
        from_instance="rod1", from_port="end2",
        to_instance="conn1", to_port="A",
        joint_type="fixed",
    ))
    build._graph.add_edge("rod1", "conn1", joint_type="fixed")

    with PyBulletSimulator(build) as sim:
        for inst_id, part_inst in build.parts.items():
            body_id = sim.load_part_mesh(part_inst)
            sim.part_bodies[inst_id] = body_id

        # Anchor the motor
        p.changeDynamics(
            sim.part_bodies["motor1"], -1, mass=0.0,
            physicsClientId=sim.client,
        )

        sim.create_joints()
        p.setGravity(0, 0, 0, physicsClientId=sim.client)

        # Capture initial connector orientation
        _, conn_q0 = p.getBasePositionAndOrientation(
            sim.part_bodies["conn1"], physicsClientId=sim.client,
        )
        _, rod_q0 = p.getBasePositionAndOrientation(
            sim.part_bodies["rod1"], physicsClientId=sim.client,
        )

        # Apply motor torque and step 1 frame (4 sub-steps like the API)
        motor_body = sim.part_bodies["motor1"]
        motor_port = motor_inst.get_port("drive_axle")
        motor_rot = R.from_quat(motor_inst.quaternion)
        axis_world = motor_rot.apply(np.array(motor_port.direction, dtype=float))

        for _ in range(4):
            torque = (axis_world * 5000.0).tolist()
            p.applyExternalTorque(
                sim.part_bodies["rod1"], -1, torque,
                p.WORLD_FRAME, physicsClientId=sim.client,
            )
            p.stepSimulation(physicsClientId=sim.client)

        _, conn_q1 = p.getBasePositionAndOrientation(
            sim.part_bodies["conn1"], physicsClientId=sim.client,
        )
        _, rod_q1 = p.getBasePositionAndOrientation(
            sim.part_bodies["rod1"], physicsClientId=sim.client,
        )

        # Rod and connector should have rotated by the same amount (fixed joint)
        rod_delta = quat_angle_deg(rod_q0, rod_q1)
        conn_delta = quat_angle_deg(conn_q0, conn_q1)

        # First-frame flip would show conn_delta >> rod_delta
        # They should be roughly equal (both rotate together)
        if rod_delta > 1.0:
            ratio = conn_delta / rod_delta
            assert 0.5 < ratio < 2.0, (
                f"Connector rotation ({conn_delta:.1f}°) diverged from rod "
                f"({rod_delta:.1f}°) — ratio={ratio:.2f}, possible flip"
            )

        # Neither should have flipped
        assert conn_delta < FLIP_THRESHOLD_DEG or rod_delta > 5.0, (
            f"Connector flipped {conn_delta:.1f}° in first frame of motor sim"
        )


# --------------------------------------------------------------------------
# d) Orientation delta diagnostic (prints detailed info)
# --------------------------------------------------------------------------
@pytest.mark.skipif(Build is None, reason="Cannot import core modules.")
def test_orientation_delta_diagnostic(capsys):
    configs = {
        "side-on": _make_side_clip_build,
        "end-on": _make_end_on_build,
    }

    any_flipped = False

    for label, build_fn in configs.items():
        build = build_fn()

        import pybullet as pb

        with PyBulletSimulator(build) as sim:
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id

            sim.create_joints()
            pb.setGravity(0, 0, 0, physicsClientId=sim.client)

            initial = {}
            for inst_id, body_id in sim.part_bodies.items():
                pos, quat = pb.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
                initial[inst_id] = (list(pos), list(quat))

            # Single frame (4 sub-steps)
            for _ in range(4):
                pb.stepSimulation(physicsClientId=sim.client)

            print(f"\n{'='*60}")
            print(f"DIAGNOSTIC: {label} connection")
            print(f"{'='*60}")

            for inst_id, body_id in sim.part_bodies.items():
                pos, quat = pb.getBasePositionAndOrientation(body_id, physicsClientId=sim.client)
                i_pos, i_quat = initial[inst_id]

                angle = quat_angle_deg(i_quat, list(quat))
                euler = euler_delta_deg(i_quat, list(quat))
                flipped = angle > FLIP_THRESHOLD_DEG

                print(f"\n  Part: {inst_id} ({build.parts[inst_id].part.id})")
                print(f"    Initial pos:  [{i_pos[0]:.2f}, {i_pos[1]:.2f}, {i_pos[2]:.2f}]")
                print(f"    Initial quat: [{i_quat[0]:.4f}, {i_quat[1]:.4f}, "
                      f"{i_quat[2]:.4f}, {i_quat[3]:.4f}]")
                print(f"    After pos:    [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]")
                print(f"    After quat:   [{quat[0]:.4f}, {quat[1]:.4f}, "
                      f"{quat[2]:.4f}, {quat[3]:.4f}]")
                print(f"    Rotation delta: {angle:.2f}°")
                print(f"    Euler delta:    [rx={euler[0]:.2f}°, ry={euler[1]:.2f}°, "
                      f"rz={euler[2]:.2f}°]")
                print(f"    FLIPPED: {'YES ⚠️' if flipped else 'no'}")

                if flipped:
                    any_flipped = True

    captured = capsys.readouterr()
    # Print diagnostics regardless (use -s flag to see them)
    print(captured.out)

    if any_flipped:
        pytest.fail(
            "One or more parts flipped > 45° in the first frame. "
            "See diagnostic output above (run with -s)."
        )


# --------------------------------------------------------------------------
# e) Constraint anchors diagnostic
# --------------------------------------------------------------------------
@pytest.mark.skipif(Build is None, reason="Cannot import core modules.")
def test_constraint_anchors_diagnostic(capsys):
    import pybullet as pb

    configs = {
        "side-on": _make_side_clip_build,
        "end-on": _make_end_on_build,
    }

    for label, build_fn in configs.items():
        build = build_fn()

        with PyBulletSimulator(build) as sim:
            for inst_id, part_inst in build.parts.items():
                body_id = sim.load_part_mesh(part_inst)
                sim.part_bodies[inst_id] = body_id

            sim.create_joints()
            pb.setGravity(0, 0, 0, physicsClientId=sim.client)

            print(f"\n{'='*60}")
            print(f"CONSTRAINT ANCHORS: {label} connection")
            print(f"{'='*60}")
            print(f"  Total constraints: {len(sim.joint_constraints)}")

            # Reverse-map body_id -> instance_id
            body_to_inst = {v: k for k, v in sim.part_bodies.items()}

            for i, jc in enumerate(sim.joint_constraints):
                c_id = jc["id"]
                info = pb.getConstraintInfo(c_id, physicsClientId=sim.client)
                # getConstraintInfo returns a tuple:
                # (parentBodyIndex, parentJointIndex, childBodyIndex, childJointIndex,
                #  jointType, jointAxis, parentFramePos, childFramePos,
                #  parentFrameOrn, childFrameOrn, maxForce)
                parent_body = info[0]
                child_body = info[2]
                joint_type_id = info[4]
                parent_anchor = info[6]
                child_anchor = info[7]

                parent_inst = body_to_inst.get(parent_body, f"body-{parent_body}")
                child_inst = body_to_inst.get(child_body, f"body-{child_body}")

                joint_type_name = {
                    pb.JOINT_POINT2POINT: "P2P",
                    pb.JOINT_FIXED: "FIXED",
                    pb.JOINT_REVOLUTE: "REVOLUTE",
                    pb.JOINT_PRISMATIC: "PRISMATIC",
                }.get(joint_type_id, f"UNKNOWN({joint_type_id})")

                print(f"\n  Constraint {i} (id={c_id}):")
                print(f"    Type: {joint_type_name}")
                print(f"    Parent: {parent_inst} (body {parent_body})")
                print(f"    Child:  {child_inst} (body {child_body})")
                print(f"    Parent anchor (local): "
                      f"[{parent_anchor[0]:.2f}, {parent_anchor[1]:.2f}, "
                      f"{parent_anchor[2]:.2f}]")
                print(f"    Child anchor (local):  "
                      f"[{child_anchor[0]:.2f}, {child_anchor[1]:.2f}, "
                      f"{child_anchor[2]:.2f}]")

                # Compute world-space anchor positions for verification
                parent_pos, parent_orn = pb.getBasePositionAndOrientation(
                    parent_body, physicsClientId=sim.client,
                )
                child_pos, child_orn = pb.getBasePositionAndOrientation(
                    child_body, physicsClientId=sim.client,
                )
                parent_rot = R.from_quat(parent_orn)
                child_rot = R.from_quat(child_orn)

                parent_world = np.array(parent_pos) + parent_rot.apply(
                    np.array(parent_anchor)
                )
                child_world = np.array(child_pos) + child_rot.apply(
                    np.array(child_anchor)
                )
                anchor_gap = np.linalg.norm(parent_world - child_world)

                print(f"    Parent anchor (world): "
                      f"[{parent_world[0]:.2f}, {parent_world[1]:.2f}, "
                      f"{parent_world[2]:.2f}]")
                print(f"    Child anchor (world):  "
                      f"[{child_world[0]:.2f}, {child_world[1]:.2f}, "
                      f"{child_world[2]:.2f}]")
                print(f"    Anchor gap: {anchor_gap:.4f} mm")

    captured = capsys.readouterr()
    print(captured.out)
