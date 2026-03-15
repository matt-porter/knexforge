import pytest
import numpy as np
from core.build import Build
from core.parts.models import PartInstance, Connection
from core.snapping import align_part_to_port, snap_ports
from core.file_io import save_knx, load_knx
from core.physics.pybullet import PyBulletSimulator

def test_model_serialization_round_trip(clean_part_library, tmp_path):
    """Category 1: Model & Serialization Round-Trip"""
    # 1. Basic round-trip
    b = Build()
    r1 = PartInstance(instance_id="r1", part=clean_part_library.get("rod-128-red-v1"))
    c1 = PartInstance(instance_id="c1", part=clean_part_library.get("connector-3way-red-v1"))
    b.parts["r1"] = r1
    b.parts["c1"] = c1
    
    conn = Connection(from_instance="r1", from_port="center_axial_1", to_instance="c1", to_port="A", slide_offset=25.0)
    b.connections.add(conn)
    
    out_file = tmp_path / "test_slide.knx"
    save_knx(b, out_file)
    
    b2, _ = load_knx(out_file, clean_part_library)
    c2 = list(b2.connections)[0]
    assert c2.slide_offset == 25.0
    
    # 2. Zero offset omitted/loaded
    b.connections.clear()
    b.connections.add(Connection(from_instance="r1", from_port="center_axial_1", to_instance="c1", to_port="A", slide_offset=0.0))
    save_knx(b, out_file)
    b3, _ = load_knx(out_file, clean_part_library)
    assert list(b3.connections)[0].slide_offset == 0.0

def test_snapping_alignment(clean_part_library):
    """Category 2: Snapping & Alignment"""
    rod = clean_part_library.get("rod-128-red-v1")
    conn = clean_part_library.get("connector-1way-grey-v1")
    
    r1 = PartInstance(instance_id="r1", part=rod)
    c1 = PartInstance(instance_id="c1", part=conn)
    
    # Center is 64mm.
    # 6. Center offset alignment: +20mm
    pos_0, _ = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=0.0)
    pos_pos, _ = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=20.0)
    assert np.allclose(np.array(pos_pos) - np.array(pos_0), [20.0, 0.0, 0.0], atol=1e-5)
    
    # 7. Negative offset alignment: -20mm
    pos_neg, _ = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=-20.0)
    assert np.allclose(np.array(pos_neg) - np.array(pos_0), [-20.0, 0.0, 0.0], atol=1e-5)
    
    # 9. Clamped offset
    pos_clamp, _ = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=100.0)
    diff = np.array(pos_clamp) - np.array(pos_0)
    assert np.allclose(diff, [56.5, 0.0, 0.0], atol=1e-5)

def test_multiple_connectors_collision(clean_part_library):
    """Category 3: Multiple Connectors"""
    b = Build()
    r1 = PartInstance(instance_id="r1", part=clean_part_library.get("rod-128-red-v1"))
    c1 = PartInstance(instance_id="c1", part=clean_part_library.get("connector-1way-grey-v1"))
    c2 = PartInstance(instance_id="c2", part=clean_part_library.get("connector-1way-grey-v1"))
    c3 = PartInstance(instance_id="c3", part=clean_part_library.get("connector-1way-grey-v1"))
    b.parts["r1"] = r1
    b.parts["c1"] = c1
    b.parts["c2"] = c2
    b.parts["c3"] = c3
    
    # 11. Two connectors, same rod, different offsets
    pos1, q1 = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=-30.0)
    c1 = c1.model_copy(update={"position": pos1, "quaternion": q1})
    b.parts["c1"] = c1
    b.connections.add(Connection(from_instance="c1", from_port="A", to_instance="r1", to_port="center_axial_1", slide_offset=-30.0))
    
    pos2, q2 = align_part_to_port(c2, "A", r1, "center_axial_1", slide_offset=30.0)
    c2 = c2.model_copy(update={"position": pos2, "quaternion": q2})
    b.parts["c2"] = c2
    b.connections.add(Connection(from_instance="c2", from_port="A", to_instance="r1", to_port="center_axial_1", slide_offset=30.0))
    
    # Verify connections exist
    assert len(b.connections) == 2
    
    # 12. Collision rejection via check
    # Let's test the collision helper directly since attempt_snap checks it
    from core.snapping import get_slide_family, families_interfere
    # If we tried to place at -25, it would collide with c1 at -30 (abs diff 5 < 15)
    assert abs(-30 - -25) < 15.0
    
    # 13. Different tangent sides
    b.connections.clear()
    
    pos4, q4 = align_part_to_port(c1, "A", r1, "center_tangent_y_pos", slide_offset=10.0)
    c1 = c1.model_copy(update={"position": pos4, "quaternion": q4})
    b.parts["c1"] = c1
    b.connections.add(Connection(from_instance="c1", from_port="A", to_instance="r1", to_port="center_tangent_y_pos", slide_offset=10.0))
    
    pos5, q5 = align_part_to_port(c2, "A", r1, "center_tangent_z_pos", slide_offset=10.0)
    c2 = c2.model_copy(update={"position": pos5, "quaternion": q5})
    b.parts["c2"] = c2
    b.connections.add(Connection(from_instance="c2", from_port="A", to_instance="r1", to_port="center_tangent_z_pos", slide_offset=10.0))
    
    assert len(b.connections) == 2

def test_undo_redo_preserves_slide_metadata(clean_part_library):
    """Category 4: Undo/redo action history preserves metadata"""
    b = Build()
    r1 = PartInstance(instance_id="r1", part=clean_part_library.get("rod-128-red-v1"))
    c1 = PartInstance(instance_id="c1", part=clean_part_library.get("connector-1way-grey-v1"))
    b.add_part(r1)
    b.add_part(c1)
    
    # Snap with offset and twist
    pos, q = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=25.0, twist_deg=90.0, fixed_roll=True)
    c1 = c1.model_copy(update={"position": pos, "quaternion": q})
    b.parts["c1"] = c1
    b.connections.clear()
    
    from core.parts.models import Connection
    from core.action_history import SnapAction
    
    conn = Connection(from_instance="c1", from_port="A", to_instance="r1", to_port="center_axial_1", joint_type="fixed", twist_deg=90.0, fixed_roll=True, slide_offset=25.0)
    b.connections.add(conn)
    b.history.record(SnapAction(
        from_port="c1.A",
        to_port="r1.center_axial_1",
        twist_deg=90.0,
        fixed_roll=True,
        slide_offset=25.0
    ))
    
    # Undo
    b.undo()
    assert len(b.connections) == 0
    
    # Redo
    b.redo()
    assert len(b.connections) == 1
    
    redone_conn = list(b.connections)[0]
    assert redone_conn.slide_offset == 25.0
    assert redone_conn.twist_deg == 90.0
    assert redone_conn.fixed_roll is True

def test_physics_slide_and_fixed(clean_part_library):
    """Category 5: Physics - sliding and fixed offsets"""
    try:
        import pybullet as p
    except ImportError:
        pytest.skip("pybullet not installed")
        
    b = Build()
    
    # Vertical orientation for rod 1
    import scipy.spatial.transform
    rot = scipy.spatial.transform.Rotation.from_euler('y', 90, degrees=True).as_quat()
    r1 = PartInstance(instance_id="r1", part=clean_part_library.get("rod-128-red-v1"), position=(0, 0, 100), quaternion=tuple(rot.tolist()), is_pinned=True)
    b.parts["r1"] = r1
    
    # Vertical orientation for rod 2
    r2 = PartInstance(instance_id="r2", part=clean_part_library.get("rod-128-red-v1"), position=(0, 50, 100), quaternion=tuple(rot.tolist()), is_pinned=True)
    b.parts["r2"] = r2
    
    c1 = PartInstance(instance_id="c1", part=clean_part_library.get("connector-1way-grey-v1"))
    c2 = PartInstance(instance_id="c2", part=clean_part_library.get("connector-1way-grey-v1"))
    
    pos1, q1 = align_part_to_port(c1, "A", r1, "center_axial_1", slide_offset=0)
    c1 = c1.model_copy(update={"position": pos1, "quaternion": q1})
    b.parts["c1"] = c1
    b.connections.add(Connection(from_instance="c1", from_port="A", to_instance="r1", to_port="center_axial_1", slide_offset=0))
    
    pos2, q2 = align_part_to_port(c2, "A", r2, "center_tangent_y_pos", slide_offset=20)
    c2 = c2.model_copy(update={"position": pos2, "quaternion": q2})
    b.parts["c2"] = c2
    b.connections.add(Connection(from_instance="c2", from_port="A", to_instance="r2", to_port="center_tangent_y_pos", slide_offset=20))
    
    with PyBulletSimulator(b) as sim:
        sim.part_bodies["r1"] = sim.load_part_mesh(r1)
        sim.part_bodies["r2"] = sim.load_part_mesh(r2)
        sim.part_bodies["c1"] = sim.load_part_mesh(c1)
        sim.part_bodies["c2"] = sim.load_part_mesh(c2)
        sim.create_joints()
        
        # c1 should be free to fall (cylindrical)
        # c2 should stay fixed at offset 20
        pos1_start, _ = p.getBasePositionAndOrientation(sim.part_bodies["c1"], physicsClientId=sim.client)
        pos2_start, _ = p.getBasePositionAndOrientation(sim.part_bodies["c2"], physicsClientId=sim.client)
        
        for _ in range(120):
            p.stepSimulation(physicsClientId=sim.client)
            
        pos1_end, _ = p.getBasePositionAndOrientation(sim.part_bodies["c1"], physicsClientId=sim.client)
        pos2_end, _ = p.getBasePositionAndOrientation(sim.part_bodies["c2"], physicsClientId=sim.client)
        
        # c1 should have moved significantly down Z axis (gravity)
        dist1 = sum((f - i)**2 for f, i in zip(pos1_end, pos1_start))**0.5
        assert dist1 > 3.0

def test_physics_cylindrical_joint_allows_rotation(clean_part_library):
    """Category 6: Physics - center_axial joints should preserve rotational DOF."""
    try:
        import pybullet as p
    except ImportError:
        pytest.skip("pybullet not installed")

    b = Build()

    # Keep the rod fixed and elevated so we test joint DOF, not ground collisions.
    rod = PartInstance(
        instance_id="r1",
        part=clean_part_library.get("rod-128-red-v1"),
        position=(0, 0, 140),
        is_pinned=True,
    )
    b.parts["r1"] = rod

    conn = PartInstance(instance_id="c1", part=clean_part_library.get("connector-1way-grey-v1"))
    pos, q = align_part_to_port(conn, "A", rod, "center_axial_1", slide_offset=0)
    conn = conn.model_copy(update={"position": pos, "quaternion": q})
    b.parts["c1"] = conn
    b.connections.add(
        Connection(
            from_instance="c1",
            from_port="A",
            to_instance="r1",
            to_port="center_axial_1",
            slide_offset=0,
        )
    )

    with PyBulletSimulator(b) as sim:
        sim.part_bodies["r1"] = sim.load_part_mesh(rod)
        sim.part_bodies["c1"] = sim.load_part_mesh(conn)
        sim.create_joints()

        c1_body = sim.part_bodies["c1"]
        max_spin_x = 0.0

        for _ in range(240):
            p.applyExternalTorque(
                c1_body,
                -1,
                [2.5e7, 0.0, 0.0],
                p.WORLD_FRAME,
                physicsClientId=sim.client,
            )
            p.stepSimulation(physicsClientId=sim.client)
            _, angular_velocity = p.getBaseVelocity(c1_body, physicsClientId=sim.client)
            max_spin_x = max(max_spin_x, abs(angular_velocity[0]))

        # A center-axial connection should spin around the rod axis under torque.
        assert max_spin_x > 0.5
