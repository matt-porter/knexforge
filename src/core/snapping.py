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


def _is_side_on_connection(from_port: Port, to_port: Port) -> bool:
    """Return True if this is a side-on clip connection (rod_side ↔ rod_hole)."""
    return (
        (from_port.mate_type == "rod_side" and to_port.mate_type == "rod_hole")
        or (from_port.mate_type == "rod_hole" and to_port.mate_type == "rod_side")
    )


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

    # Mate-type compatibility (bidirectional check)
    if from_port.mate_type not in to_port.accepts and to_port.mate_type not in from_port.accepts:
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

    return Connection(
        from_instance=from_instance.instance_id,
        from_port=from_port_id,
        to_instance=to_instance.instance_id,
        to_port=to_port_id,
    )


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
) -> tuple[tuple[float, float, float], tuple[float, float, float, float]]:
    """Compute position + quaternion to align any port pair, with optional twist.

    Works for both end-on and side-on connections. The twist angle rotates the
    placing part around the target port's direction axis, allowing the caller
    to select among the discrete ``allowed_angles_deg`` positions.

    Args:
        placing_instance: The part being placed (provides local port geometry).
        placing_port_id: Port ID on the placing part.
        target_instance: The existing part being attached to.
        target_port_id: Port ID on the target part.
        twist_deg: Rotation in degrees around the target port direction axis.

    Returns:
        (position, quaternion) for the placing part's new world transform.
    """
    placing_port = placing_instance.get_port(placing_port_id)

    # Target world pose
    target_pos, target_dir = _port_world_pose(target_instance, target_port_id)

    # The placing port direction should oppose the target port direction
    desired_dir = -np.array(target_dir)

    # Current placing port local direction
    current_local_dir = np.array(placing_port.direction)

    # Base rotation: align placing port direction → desired direction
    base_rot = R.align_vectors([desired_dir], [current_local_dir])[0]

    # Apply twist around the target port direction axis
    twist_rot = R.from_rotvec(np.radians(twist_deg) * np.array(target_dir))
    final_rot = twist_rot * base_rot

    # New world position: target port pos minus rotated local port pos
    new_pos = target_pos - final_rot.apply(np.array(placing_port.position))

    return tuple(new_pos.tolist()), tuple(final_rot.as_quat().tolist())
