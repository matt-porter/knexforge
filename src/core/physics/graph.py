"""Tier 1 lightweight graph-based physics – real-time stability scoring."""

from __future__ import annotations

import numpy as np
import networkx as nx

from core.build import Build


def compute_stability(build: Build) -> float:
    """Return 0-100 stability score using graph + COM + bracing heuristic.

    - 0 if disconnected
    - Rewards: wide base, low COM, high bracing density (triangles)
    - Penalties: tall/skinny, few connections
    """
    if len(build.parts) == 0:
        return 100.0
    if not nx.is_connected(build._graph):
        return 0.0

    # 1. Center of Mass (lower = better)
    positions = np.array([p.position for p in build.parts.values()])
    com_z = np.mean(positions[:, 2])
    com_penalty = min(30.0, com_z * 0.15)   # tall COM hurts

    # 2. Base support (parts near ground)
    min_z = np.min(positions[:, 2])
    base_parts = sum(1 for p in positions if p[2] <= min_z + 5.0)
    base_score = min(30.0, (base_parts / len(build.parts)) * 60)

    # 3. Bracing density (average degree + triangle bonus)
    degrees = [d for n, d in build._graph.degree()]
    avg_degree = sum(degrees) / len(degrees)
    bracing = min(40.0, avg_degree * 8.0)   # more connections = better

    # 4. Triangle bonus (real K'Nex strength)
    triangles = sum(1 for c in nx.cycle_basis(build._graph) if len(c) == 3)
    triangle_bonus = min(20.0, triangles * 4.0)

    raw_score = 30 + base_score + bracing + triangle_bonus - com_penalty
    return max(0.0, min(100.0, raw_score))