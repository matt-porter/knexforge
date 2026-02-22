"""Central Build model – holds parts, connections, and graph."""

from __future__ import annotations

import json
from typing import Dict, Optional, Set

import networkx as nx
from pydantic import BaseModel

from .parts.loader import PartLoader
from .parts.models import PartInstance, Connection
from .physics.graph import compute_stability


class Build(BaseModel):
    """The main in-memory model of a K'Nex creation."""

    parts: Dict[str, PartInstance] = {}
    connections: Set[Connection] = set()
    _graph: nx.Graph = nx.Graph()  # internal connectivity graph
    _stability_score: float = 100.0

    def add_part(self, instance: PartInstance) -> None:
        """Add a new part instance to the build."""
        if instance.instance_id in self.parts:
            raise ValueError(f"Instance ID {instance.instance_id} already exists")
        self.parts[instance.instance_id] = instance
        self._graph.add_node(instance.instance_id)

    def attempt_snap(
        self,
        from_instance_id: str,
        from_port_id: str,
        to_instance_id: str,
        to_port_id: str,
        tolerance_mm: float = 0.2,
    ) -> Connection | None:
        """Attempt to snap two existing parts. Returns Connection on success."""
        if from_instance_id not in self.parts or to_instance_id not in self.parts:
            return None

        from_inst = self.parts[from_instance_id]
        to_inst = self.parts[to_instance_id]

        from core.snapping import snap_ports

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
        return conn

    def remove_part(self, instance_id: str) -> None:
        """Remove a part and all its connections."""
        if instance_id not in self.parts:
            return
        del self.parts[instance_id]
        self._graph.remove_node(instance_id)
        self.connections = {
            c for c in self.connections
            if c.from_instance != instance_id and c.to_instance != instance_id
        }
        self._update_stability()

    def get_connected_parts(self, instance_id: str) -> set[str]:
        """Return set of instance_ids directly connected to this part."""
        return set(self._graph.neighbors(instance_id))

    def is_connected(self, id1: str, id2: str) -> bool:
        """Check if two parts are connected (directly or indirectly)."""
        return nx.has_path(self._graph, id1, id2)

    def stability_score(self) -> float:
        """Current stability (0-100). Placeholder for future physics."""
        return self._stability_score

    def _update_stability(self) -> None:
        """Update stability using the physics layer."""
        self._stability_score = compute_stability(self) if len(self.parts) < 5 else 95.0

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
            build.add_part(instance)

        for c_dict in data.get("connections", []):
            conn = Connection(**c_dict)
            build.connections.add(conn)
            build._graph.add_edge(conn.from_instance, conn.to_instance)

        build._stability_score = data.get("stability_score", 100.0)
        return build