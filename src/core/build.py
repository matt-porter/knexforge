"""Central Build model – holds parts, connections, and graph."""

from __future__ import annotations

from typing import TYPE_CHECKING

import networkx as nx

from .action_history import (
    ActionHistory,
    AddPartAction,
    RemovePartAction,
    SnapAction,
)
from .parts.models import Connection, PartInstance

if TYPE_CHECKING:
    from .parts.loader import PartLoader


class Build:
    """The main in-memory model of a K'Nex creation."""

    def __init__(self, library: PartLoader | None = None) -> None:
        self.parts: dict[str, PartInstance] = {}
        self.connections: set[Connection] = set()
        self.history: ActionHistory = ActionHistory()
        self._graph: nx.Graph = nx.Graph()
        self._stability_score: float = 100.0

    def add_part(self, instance: PartInstance, *, record: bool = True) -> None:
        """Add a new part instance to the build."""
        if instance.instance_id in self.parts:
            raise ValueError(f"Instance ID {instance.instance_id} already exists")
        self.parts[instance.instance_id] = instance
        self._graph.add_node(instance.instance_id)

        if record:
            self.history.record(AddPartAction(
                part_id=instance.part.id,
                instance_id=instance.instance_id,
                position=list(instance.position),
                quaternion=list(instance.quaternion),
                color=instance.color,
            ))

    def attempt_snap(
        self,
        from_instance_id: str,
        from_port_id: str,
        to_instance_id: str,
        to_port_id: str,
        tolerance_mm: float = 0.2,
        *,
        record: bool = True,
    ) -> Connection | None:
        """Attempt to snap two existing parts. Returns Connection on success."""
        if from_instance_id not in self.parts or to_instance_id not in self.parts:
            return None

        from_inst = self.parts[from_instance_id]
        to_inst = self.parts[to_instance_id]

        from .snapping import snap_ports

        conn = snap_ports(
            from_instance=from_inst,
            from_port_id=from_port_id,
            to_instance=to_inst,
            to_port_id=to_port_id,
            tolerance_mm=tolerance_mm,
        )

        if conn is not None:
            self.connections.add(conn)
            self._graph.add_edge(from_instance_id, to_instance_id)
            self._update_stability()

            if record:
                self.history.record(SnapAction(
                    from_port=f"{from_instance_id}.{from_port_id}",
                    to_port=f"{to_instance_id}.{to_port_id}",
                ))
        return conn

    def remove_part(self, instance_id: str, *, record: bool = True) -> None:
        """Remove a part and all its connections."""
        if instance_id not in self.parts:
            return

        removed_instance = self.parts[instance_id]
        removed_connections = [
            c for c in self.connections
            if c.from_instance == instance_id or c.to_instance == instance_id
        ]

        del self.parts[instance_id]
        self._graph.remove_node(instance_id)
        self.connections = {
            c for c in self.connections
            if c.from_instance != instance_id and c.to_instance != instance_id
        }
        self._update_stability()

        if record:
            self.history.record(
                RemovePartAction(instance_id=instance_id),
                snapshot={
                    "instance": removed_instance.model_dump(),
                    "connections": [c.model_dump() for c in removed_connections],
                },
            )

    def undo(self) -> bool:
        """Undo the last action. Returns True if an action was undone."""
        entry = self.history.undo()
        if entry is None:
            return False

        action = entry.action
        if isinstance(action, AddPartAction):
            self._remove_part_internal(action.instance_id)
        elif isinstance(action, SnapAction):
            self._disconnect_internal(action.from_port, action.to_port)
        elif isinstance(action, RemovePartAction) and entry.snapshot:
            self._restore_from_snapshot(entry.snapshot)

        return True

    def redo(self) -> bool:
        """Redo the last undone action. Returns True if an action was redone."""
        entry = self.history.redo()
        if entry is None:
            return False

        action = entry.action
        if isinstance(action, AddPartAction):
            self._replay_add_part(action)
        elif isinstance(action, SnapAction):
            self._replay_snap(action)
        elif isinstance(action, RemovePartAction):
            self._remove_part_internal(action.instance_id)

        return True

    def _remove_part_internal(self, instance_id: str) -> None:
        """Remove a part without recording to history."""
        if instance_id not in self.parts:
            return
        del self.parts[instance_id]
        self._graph.remove_node(instance_id)
        self.connections = {
            c for c in self.connections
            if c.from_instance != instance_id and c.to_instance != instance_id
        }
        self._update_stability()

    def _disconnect_internal(self, from_port: str, to_port: str) -> None:
        """Remove a connection by dotted port refs without recording."""
        from_inst, from_p = from_port.rsplit(".", 1)
        to_inst, to_p = to_port.rsplit(".", 1)
        self.connections = {
            c for c in self.connections
            if not (c.from_instance == from_inst and c.from_port == from_p
                    and c.to_instance == to_inst and c.to_port == to_p)
        }
        if self._graph.has_edge(from_inst, to_inst):
            self._graph.remove_edge(from_inst, to_inst)
        self._update_stability()

    def _restore_from_snapshot(self, snapshot: dict) -> None:
        """Re-add a part + connections from undo snapshot."""
        from .parts.loader import PartLoader

        inst_data = snapshot["instance"]
        library = PartLoader.load()
        part = library.get(inst_data["part"]["id"])
        instance = PartInstance(
            instance_id=inst_data["instance_id"],
            part=part,
            position=tuple(inst_data["position"]),
            quaternion=tuple(inst_data["quaternion"]),
            color=inst_data.get("color"),
        )
        self.parts[instance.instance_id] = instance
        self._graph.add_node(instance.instance_id)

        for c_dict in snapshot["connections"]:
            conn = Connection(**c_dict)
            self.connections.add(conn)
            self._graph.add_edge(conn.from_instance, conn.to_instance)
        self._update_stability()

    def _replay_add_part(self, action: AddPartAction) -> None:
        """Re-apply an AddPartAction during redo."""
        from .parts.loader import PartLoader

        library = PartLoader.load()
        part = library.get(action.part_id)
        instance = PartInstance(
            instance_id=action.instance_id,
            part=part,
            position=tuple(action.position),
            quaternion=tuple(action.quaternion),
            color=action.color,
        )
        self.parts[instance.instance_id] = instance
        self._graph.add_node(instance.instance_id)

    def _replay_snap(self, action: SnapAction) -> None:
        """Re-apply a SnapAction during redo."""
        from_inst, from_p = action.from_port.rsplit(".", 1)
        to_inst, to_p = action.to_port.rsplit(".", 1)
        conn = Connection(
            from_instance=from_inst,
            from_port=from_p,
            to_instance=to_inst,
            to_port=to_p,
        )
        self.connections.add(conn)
        self._graph.add_edge(from_inst, to_inst)
        self._update_stability()

    def get_connected_parts(self, instance_id: str) -> set[str]:
        """Return set of instance_ids directly connected to this part."""
        return set(self._graph.neighbors(instance_id))

    def is_connected(self, id1: str, id2: str) -> bool:
        """Check if two parts are connected (directly or indirectly)."""
        return nx.has_path(self._graph, id1, id2)

    def stability_score(self) -> float:
        """Current stability (0-100)."""
        return self._stability_score

    def _update_stability(self) -> None:
        """Update stability using the physics layer."""
        from .physics.graph import compute_stability

        self._stability_score = compute_stability(self)

    def to_dict(self) -> dict:
        """Serialize for .knx file or AI."""
        return {
            "parts": [p.model_dump() for p in self.parts.values()],
            "connections": [c.model_dump() for c in self.connections],
            "stability_score": self._stability_score,
        }

    @classmethod
    def from_dict(cls, data: dict, library: PartLoader) -> Build:
        """Reconstruct Build from serialized dict."""
        build = cls()
        for p_dict in data["parts"]:
            part = library.get(p_dict["part"]["id"])
            instance = PartInstance(
                instance_id=p_dict["instance_id"],
                part=part,
                position=tuple(p_dict["position"]),
                quaternion=tuple(p_dict["quaternion"]),
                color=p_dict.get("color"),
            )
            build.add_part(instance, record=False)

        for c_dict in data.get("connections", []):
            conn = Connection(**c_dict)
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance)

        build._stability_score = data.get("stability_score", 100.0)
        return build
