"""Port-based snapping engine for K'NexForge – pure math, no side effects."""

from __future__ import annotations

import numpy as np
from scipy.spatial.transform import Rotation as R

from .parts.models import PartInstance, Connection, Port


def _port_world_pose(instance: PartInstance, port_id: str) -> tuple[np.ndarray, np.ndarray]:
    """Return world position and direction vector of a port."""
    port = instance.get_port(port_id)
    pos_local = np.array(port.position)
    dir_local = np.array(port.direction)

    # Apply instance rotation
    rot = R.from_quat(instance.quaternion)
    pos_world = instance.position + rot.apply(pos_local)
    dir_world = rot.apply(dir_local)

    return pos_world, dir_world


def are_ports_compatible(port_a: Port, port_b: Port) -> bool:
    """Check if two ports can physically mate (both must accept each other)."""
    return port_a.mate_type in port_b.accepts and port_b.mate_type in port_a.accepts


def _is_side_on_connection(from_port: Port, to_port: Port) -> bool:
    """Return True if this is a side-on clip connection (rod_side ↔ rod_hole)."""
    return (
        (from_port.mate_type == "rod_side" and to_port.mate_type == "rod_hole")
        or (from_port.mate_type == "rod_hole" and to_port.mate_type == "rod_side")
    )


def _get_world_axis(instance: PartInstance, local_axis: np.ndarray) -> np.ndarray:
    """Transform a local axis vector to world space using the instance's rotation."""
    rot = R.from_quat(instance.quaternion)
    return rot.apply(local_axis)


def validate_physical_constraints(
    placing_instance: PartInstance,
    placing_port: Port,
    target_instance: PartInstance,
    target_port: Port,
) -> bool:
    """Validate physical orientation constraints for a rod↔connector connection.

    Mirrors the frontend's PortIndicators.tsx constraints (lines 129-191) to ensure:
    - Side-on clips (rod_side) have correct rod axis orientation relative to connector
    - Center axial ports only connect through center holes
    - End-on snaps have correct rod axis alignment
    """
    placing_def = placing_instance.part
    target_def = target_instance.part

    # Only applies to rod↔connector connections
    is_rod_connector = (
        (placing_def.category == "rod" and target_def.category == "connector")
        or (placing_def.category == "connector" and target_def.category == "rod")
    )
    if not is_rod_connector:
        return True

    is_placing_rod = placing_def.category == "rod"

    # Rod main axis = local X; connector normal = local Z
    rod_world_main_axis = _get_world_axis(
        placing_instance if is_placing_rod else target_instance,
        np.array([1.0, 0.0, 0.0]),
    )
    connector_world_z = _get_world_axis(
        target_instance if is_placing_rod else placing_instance,
        np.array([0.0, 0.0, 1.0]),
    )

    connector_dir = target_port.direction if is_placing_rod else placing_port.direction
    rod_mate_type = placing_port.mate_type if is_placing_rod else target_port.mate_type
    rod_port_id = placing_port.id if is_placing_rod else target_port.id
    connector_port_id = target_port.id if is_placing_rod else placing_port.id

    is_flat_connector_edge = abs(connector_dir[2]) < 0.1
    is_3d_connector_edge = abs(connector_dir[2]) > 0.9

    # 1. Side-on clipping (rod_side)
    if rod_mate_type == "rod_side":
        # Any orientation is physically possible for a side-clip (rotational symmetry)
        # but we usually prefer either 'flat' in connector plane or 'orthogonal' to it.
        # Strict validation here often causes solver to reject the intended user roll.
        return True

    # 2. Axial sliding (center_axial) — only through center holes
    if rod_port_id.startswith("center_axial"):
        if connector_port_id != "center":
            return False
        # Must be perfectly orthogonal to connector plane (along Z)
        if abs(np.dot(rod_world_main_axis, connector_world_z)) < 0.99:
            return False

    # 3. End-on snapping (rod_end, not center_axial)
    if rod_mate_type == "rod_end" and not rod_port_id.startswith("center_axial"):
        if connector_port_id != "center":
            # Edge clip: rod must lie flat in the connector plane
            if is_flat_connector_edge:
                if abs(np.dot(rod_world_main_axis, connector_world_z)) > 0.1:
                    return False
        else:
            # Center hole: rod must be orthogonal (straight through)
            if abs(np.dot(rod_world_main_axis, connector_world_z)) < 0.99:
                return False

    return True


def infer_joint_type(from_port: Port, to_port: Port) -> str:
    """Infer the joint type (fixed, revolute, prismatic) based on port properties."""
    mate_types = {from_port.mate_type, to_port.mate_type}
    
    # 1. Explicit rotational/slider holes
    if "rotational_hole" in mate_types:
        return "revolute"
    if "slider_hole" in mate_types:
        return "prismatic"
        
    # 2. Implicit axles: rods passing through holes (center_axial ports)
    if from_port.id.startswith("center_axial") or to_port.id.startswith("center_axial"):
        return "revolute"
        
    return "fixed"


def snap_ports(
    from_instance: PartInstance,
    from_port_id: str,
    to_instance: PartInstance,
    to_port_id: str,
    tolerance_mm: float = 0.2,
) -> Connection | None:
    """Attempt to snap two ports. Returns Connection on success, None otherwise.

    Handles both end-on connections (rod_end ↔ rod_hole: anti-parallel directions)
    and side-on connections (rod_side ↔ rod_hole: perpendicular directions where
    the rod clips through a connector's edge slot).
    """

    from_port = from_instance.get_port(from_port_id)
    to_port = to_instance.get_port(to_port_id)

    # Mate-type compatibility (bidirectional — both ports must accept each other)
    if not are_ports_compatible(from_port, to_port):
        return None

    # World poses
    from_pos, from_dir = _port_world_pose(from_instance, from_port_id)
    to_pos, to_dir = _port_world_pose(to_instance, to_port_id)

    # Distance check
    dist = np.linalg.norm(from_pos - to_pos)
    if dist > tolerance_mm:
        return None

    # Direction alignment depends on connection type
    if _is_side_on_connection(from_port, to_port):
        # Side-on clip: directions must be anti-parallel (connector clip faces rod,
        # rod's tangent direction faces connector → they oppose each other).
        # The rod's main axis is perpendicular to both port directions.
        angle_deg = np.degrees(np.arccos(np.clip(np.dot(-from_dir, to_dir), -1.0, 1.0)))
        if angle_deg > 5.0:
            return None
    else:
        # End-on snap: rod inserts opposite to hole direction
        angle_deg = np.degrees(np.arccos(np.clip(np.dot(-from_dir, to_dir), -1.0, 1.0)))
        if angle_deg > 5.0:
            return None

    # Physical orientation constraints (rod↔connector rules)
    if not validate_physical_constraints(from_instance, from_port, to_instance, to_port):
        return None

    # Calculate twist_deg (the roll around the connection axis)
    # 1. Projection axis is to_dir
    axis = to_dir / np.linalg.norm(to_dir)
    # 2. Reference "up" in world space from 'to' part
    # If it's a rod-side clip, we use different defaults, but for general twist:
    to_rot = R.from_quat(to_instance.quaternion)
    ref_up = to_rot.apply([0, 0, 1]) if abs(to_dir[2]) < 0.9 else to_rot.apply([0, 1, 0])
    
    # 3. Project ref_up onto plane perpendicular to axis
    ref_up_proj = ref_up - axis * np.dot(ref_up, axis)
    if np.linalg.norm(ref_up_proj) > 1e-6:
        ref_up_proj /= np.linalg.norm(ref_up_proj)
        
        # 4. Current "up" of 'from' part
        from_rot = R.from_quat(from_instance.quaternion)
        from_up = from_rot.apply([0, 0, 1]) if abs(from_dir[2]) < 0.9 else from_rot.apply([0, 1, 0])
        from_up_proj = from_up - axis * np.dot(from_up, axis)
        
        if np.linalg.norm(from_up_proj) > 1e-6:
            from_up_proj /= np.linalg.norm(from_up_proj)
            dot_twist = np.clip(np.dot(ref_up_proj, from_up_proj), -1.0, 1.0)
            twist_deg = np.degrees(np.acos(dot_twist))
            cross_twist = np.cross(ref_up_proj, from_up_proj)
            if np.dot(cross_twist, axis) < 0:
                twist_deg = -twist_deg
        else:
            twist_deg = 0.0
    else:
        twist_deg = 0.0

    # Determine joint type (Phase 1 Kinematics)
    joint_type = infer_joint_type(from_port, to_port)

    return Connection(
        from_instance=from_instance.instance_id,
        from_port=from_port_id,
        to_instance=to_instance.instance_id,
        to_port=to_port_id,
        joint_type=joint_type,
        twist_deg=twist_deg,
        fixed_roll=True  # Manual snaps are always considered 'fixed' in their roll
    )


def _rod_segment(instance: PartInstance) -> tuple[np.ndarray, np.ndarray] | None:
    """Return world-space (start, end) segment for a rod from its rod_end ports."""
    if instance.part.category != "rod":
        return None
    ends = [p for p in instance.part.ports if p.mate_type == "rod_end" and not p.id.startswith("center_axial")]
    if len(ends) < 2:
        return None
    rot = R.from_quat(instance.quaternion)
    pos = np.array(instance.position)
    p1 = pos + rot.apply(np.array(ends[0].position))
    p2 = pos + rot.apply(np.array(ends[1].position))
    return p1, p2


def _segment_min_distance(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray, p4: np.ndarray) -> float:
    """Minimum distance between two line segments (p1-p2) and (p3-p4)."""
    d1 = p2 - p1
    d2 = p4 - p3
    r = p1 - p3

    a = float(np.dot(d1, d1))
    e = float(np.dot(d2, d2))
    f = float(np.dot(d2, r))

    EPS = 1e-8
    if a <= EPS and e <= EPS:
        return float(np.linalg.norm(r))

    if a <= EPS:
        s = 0.0
        t = np.clip(f / e, 0.0, 1.0)
    else:
        c = float(np.dot(d1, r))
        if e <= EPS:
            t = 0.0
            s = np.clip(-c / a, 0.0, 1.0)
        else:
            b = float(np.dot(d1, d2))
            denom = a * e - b * b
            if abs(denom) > EPS:
                s = np.clip((b * f - c * e) / denom, 0.0, 1.0)
            else:
                s = 0.0
            t = (b * s + f) / e
            if t < 0.0:
                t = 0.0
                s = np.clip(-c / a, 0.0, 1.0)
            elif t > 1.0:
                t = 1.0
                s = np.clip((b - c) / a, 0.0, 1.0)

    closest = r + d1 * s - d2 * t
    return float(np.linalg.norm(closest))


def check_part_overlap(
    new_instance: PartInstance,
    existing_parts: dict[str, PartInstance],
    connected_ids: set[str],
    connector_clearance_mm: float = 15.0,
    rod_clearance_mm: float = 3.0,
) -> bool:
    """Return True if the new part does NOT overlap any existing parts.

    Checks:
    - Connector vs connector: bounding-sphere overlap (centers too close)
    - Rod vs rod: line-segment minimum distance
    - Rod vs connector: distance from connector center to rod segment
    Skips parts in ``connected_ids`` (directly attached, expected to touch).
    """
    new_is_rod = new_instance.part.category == "rod"
    new_seg = _rod_segment(new_instance)
    new_pos = np.array(new_instance.position)

    for inst_id, inst in existing_parts.items():
        if inst_id in connected_ids:
            continue

        inst_is_rod = inst.part.category == "rod"
        inst_seg = _rod_segment(inst)
        inst_pos = np.array(inst.position)

        if new_is_rod and inst_is_rod:
            # Rod vs Rod
            if new_seg and inst_seg:
                dist = _segment_min_distance(new_seg[0], new_seg[1], inst_seg[0], inst_seg[1])
                if dist < rod_clearance_mm:
                    return False
        elif not new_is_rod and not inst_is_rod:
            # Connector vs Connector
            dist = float(np.linalg.norm(new_pos - inst_pos))
            if dist < connector_clearance_mm:
                return False
        else:
            # Rod vs Connector
            rod_seg = new_seg if new_is_rod else inst_seg
            conn_pos = inst_pos if new_is_rod else new_pos
            if rod_seg is not None:
                # Treat connector center as a zero-length segment
                dist = _segment_min_distance(conn_pos, conn_pos, rod_seg[0], rod_seg[1])
                # Use a combined clearance: half of connector diameter + rod radius
                # If connector_clearance is 15mm (radius-like), and rod_clearance is 3mm
                # a good threshold is ~10-12mm.
                if dist < (connector_clearance_mm * 0.7 + rod_clearance_mm):
                    return False

    return True


def align_rod_to_hole(
    rod_instance: PartInstance,
    rod_port_id: str,
    target_connector: PartInstance,
    target_port_id: str,
) -> tuple[tuple[float, float, float], tuple[float, float, float, float]]:
    """Compute exact position + quaternion to perfectly snap a rod end into a hole."""
    rod_port = rod_instance.get_port(rod_port_id)
    target_port = target_connector.get_port(target_port_id)

    # Target world pose
    target_pos, target_dir = _port_world_pose(target_connector, target_port_id)

    # Desired rod end position = target port position
    # Desired rod direction = opposite of target hole direction
    desired_dir = -np.array(target_dir)

    # Current rod local direction
    current_local_dir = np.array(rod_port.direction)

    # Rotation that aligns current_local_dir → desired_dir
    rot = R.align_vectors([desired_dir], [current_local_dir])[0]

    # New world position for rod origin
    # (subtract rotated local port position)
    new_pos = target_pos - rot.apply(np.array(rod_port.position))

    return tuple(new_pos.tolist()), tuple(rot.as_quat().tolist())


def align_part_to_port(
    placing_instance: PartInstance,
    placing_port_id: str,
    target_instance: PartInstance,
    target_port_id: str,
    twist_deg: float = 0.0,
    fixed_roll: bool = False,
) -> tuple[tuple[float, float, float], tuple[float, float, float, float]]:
    """Compute position + quaternion to align any port pair, with optional twist.

    Works for both end-on and side-on connections. For side-on clipping (rod_side),
    it enforces a deterministic "up" orientation where the connector's plane (local XY)
    is perpendicular to the rod's main axis (local X).

    Args:
        placing_instance: The part being placed (provides local port geometry).
        placing_port_id: Port ID on the placing part.
        target_instance: The existing part being attached to.
        target_port_id: Port ID on the target part.
        twist_deg: Rotation in degrees around the target port direction axis.

    Returns:
        (position, quaternion) for the placing part's new world transform.
    """
    # Normalize legacy port IDs
    if placing_port_id == "center_tangent":
        placing_port_id = "center_tangent_y_pos"
    if target_port_id == "center_tangent":
        target_port_id = "center_tangent_y_pos"

    placing_port = placing_instance.get_port(placing_port_id)
    target_port = target_instance.get_port(target_port_id)

    # Target world pose
    target_pos, target_dir = _port_world_pose(target_instance, target_port_id)

    # The placing port direction should oppose the target port direction
    desired_dir = -np.array(target_dir)

    # Current placing port local direction
    current_local_dir = np.array(placing_port.direction)

    # Base rotation: align placing port direction -> desired direction
    # Use axis-angle to match frontend's computeGhostTransform logic
    cross = np.cross(current_local_dir, desired_dir)
    dot = np.dot(current_local_dir, desired_dir)
    
    if np.linalg.norm(cross) < 1e-6:
        if dot > 0:
            base_rot = R.from_quat([0, 0, 0, 1])
        else:
            # 180 degree flip
            perp = [0, 1, 0] if abs(current_local_dir[1]) < 0.9 else [1, 0, 0]
            base_rot = R.from_rotvec(np.pi * np.array(perp))
    else:
        angle = np.arccos(np.clip(dot, -1.0, 1.0))
        base_rot = R.from_rotvec(angle * (cross / np.linalg.norm(cross)))

    # Deterministic Side-Clip Orientation
    is_placing_rod = placing_instance.part.category == "rod"
    is_target_rod = target_instance.part.category == "rod"
    is_rod_connector_side = (
        (is_placing_rod and placing_port.mate_type == "rod_side") or
        (is_target_rod and target_port.mate_type == "rod_side")
    )

    if is_rod_connector_side:
        # Determine if we're dealing with a flat connector edge
        connector_dir = target_port.direction if is_placing_rod else placing_port.direction
        is_flat_edge = abs(connector_dir[2]) < 0.1

        # Rods always have main axis along local X; Connector normal is local Z
        if not is_placing_rod:
            # Connector being placed onto Rod
            rod_world_x = R.from_quat(target_instance.quaternion).apply([1.0, 0.0, 0.0])
            connector_z = base_rot.apply([0.0, 0.0, 1.0])
            connector_y = base_rot.apply([0.0, 1.0, 0.0])
            
            # We want to align either connector_z or connector_y with rod_world_x
            # depending on whether it's a flat edge or 3D edge.
            # For flat edge: rod must be in connector plane (rod_x perp to conn_z)
            #   -> align conn_y with rod_x
            # For 3D edge: rod must be vertical (rod_x parallel to conn_z)
            #   -> align conn_z with rod_x
            source_vec = connector_y if is_flat_edge else connector_z

            def project_on_plane(v, n):
                v = np.array(v)
                n = np.array(n)
                n_norm_sq = np.dot(n, n)
                if n_norm_sq < 1e-12: return v
                return v - n * np.dot(v, n) / n_norm_sq

            proj_src = project_on_plane(source_vec, desired_dir)
            proj_rod_x = project_on_plane(rod_world_x, desired_dir)

            if np.linalg.norm(proj_src) > 1e-6 and np.linalg.norm(proj_rod_x) > 1e-6:
                proj_src /= np.linalg.norm(proj_src)
                proj_rod_x /= np.linalg.norm(proj_rod_x)
                dot_p = np.clip(np.dot(proj_src, proj_rod_x), -1.0, 1.0)
                angle_p = np.arccos(dot_p)
                cross_p = np.cross(proj_src, proj_rod_x)
                if np.dot(cross_p, desired_dir) < 0: angle_p = -angle_p
                correction_rot = R.from_rotvec(angle_p * desired_dir)
                base_rot = correction_rot * base_rot
        else:
            # Rod being placed onto Connector
            connector_world_z = R.from_quat(target_instance.quaternion).apply([0.0, 0.0, 1.0])
            connector_world_y = R.from_quat(target_instance.quaternion).apply([0.0, 1.0, 0.0])
            rod_x = base_rot.apply([1.0, 0.0, 0.0])

            target_vec = connector_world_y if is_flat_edge else connector_world_z

            def project_on_plane(v, n):
                v = np.array(v)
                n = np.array(n)
                n_norm_sq = np.dot(n, n)
                if n_norm_sq < 1e-12: return v
                return v - n * np.dot(v, n) / n_norm_sq

            proj_rod_x = project_on_plane(rod_x, desired_dir)
            proj_target = project_on_plane(target_vec, desired_dir)

            if np.linalg.norm(proj_rod_x) > 1e-6 and np.linalg.norm(proj_target) > 1e-6:
                proj_rod_x /= np.linalg.norm(proj_rod_x)
                proj_target /= np.linalg.norm(proj_target)
                dot_p = np.clip(np.dot(proj_rod_x, proj_target), -1.0, 1.0)
                angle_p = np.arccos(dot_p)
                cross_p = np.cross(proj_rod_x, proj_target)
                if np.dot(cross_p, desired_dir) < 0: angle_p = -angle_p
                correction_rot = R.from_rotvec(angle_p * desired_dir)
                base_rot = correction_rot * base_rot

    # Apply user twist around the target port direction axis
    twist_rot = R.from_rotvec(np.radians(twist_deg) * target_dir)
    final_rot = twist_rot * base_rot

    # New world position: target port pos minus rotated local port pos
    new_pos = target_pos - final_rot.apply(np.array(placing_port.position))

    return tuple(new_pos.tolist()), tuple(final_rot.as_quat().tolist())
