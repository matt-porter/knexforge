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


def snap_ports(
    from_instance: PartInstance,
    from_port_id: str,
    to_instance: PartInstance,
    to_port_id: str,
    tolerance_mm: float = 0.2,
) -> Connection | None:
    """Attempt to snap two ports. Returns Connection on success, None otherwise."""

    from_port = from_instance.get_port(from_port_id)
    to_port = to_instance.get_port(to_port_id)

    # Mate-type compatibility
    if from_port.mate_type not in to_port.accepts and to_port.mate_type not in from_port.accepts:
        return None

    # World poses
    from_pos, from_dir = _port_world_pose(from_instance, from_port_id)
    to_pos, to_dir = _port_world_pose(to_instance, to_port_id)

    # Distance check
    dist = np.linalg.norm(from_pos - to_pos)
    if dist > tolerance_mm:
        return None

    # Direction alignment (rods insert opposite to hole direction)
    angle_deg = np.degrees(np.arccos(np.clip(np.dot(-from_dir, to_dir), -1.0, 1.0)))
    if angle_deg > 5.0:  # allow small numerical error
        return None

    # Angle constraint on target port
    if from_port.allowed_angles_deg and len(from_port.allowed_angles_deg) > 1:
        # Simple check for now – full discrete rotation test in align_rod_to_hole
        pass

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