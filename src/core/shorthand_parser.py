"""
Core Python shorthand parser for K'Nex structures.
Parses Graphviz-style shorthand into topology-v1 data.
Example:
    part r1 rod-128-red-v1
    part c1 connector-4way-green-v1
    r1.end1 -- c1.A @ 90
"""

import re
from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field

# --- Models ---

class TopologyPart(BaseModel):
    instance_id: str
    part_id: str
    color: Optional[str] = None

class TopologyConnection(BaseModel):
    from_ref: str = Field(alias="from")
    to_ref: str = Field(alias="to")
    joint_type: Literal["fixed", "revolute", "prismatic"] = "fixed"
    twist_deg: float = 0.0
    fixed_roll: bool = False
    slide_offset: float = 0.0

class TopologyModel(BaseModel):
    format_version: Literal["topology-v1"] = "topology-v1"
    parts: list[TopologyPart]
    connections: list[TopologyConnection]
    metadata: Optional[Dict[str, Any]] = None

class ParseError(Exception):
    """Raised when shorthand syntax is invalid."""
    def __init__(self, message: str, line_number: int, raw_line: str):
        super().__init__(f"Line {line_number}: {message} ('{raw_line}')")
        self.message = message
        self.line_number = line_number
        self.raw_line = raw_line

# --- Constants & Helpers ---

JOINT_OPERATOR_TO_TYPE = {
    "--": "fixed",
    "~~": "revolute",
    "=>": "prismatic",
}

JOINT_TYPE_TO_OPERATOR = {
    "fixed": "--",
    "revolute": "~~",
    "prismatic": "=>",
}

ALIAS_TO_PART_ID = {
    "gc1": "connector-1way-grey-v1",
    "gc2": "connector-2way-grey-v1",
    "oc2": "connector-2way-orange-v1",
    "rc3": "connector-3way-red-v1",
    "gc4": "connector-4way-green-v1",
    "pc4": "connector-4way-3d-purple-v1",
    "yc5": "connector-5way-yellow-v1",
    "bc7": "connector-7way-blue-v1",
    "wc8": "connector-8way-white-v1",
    "gr": "rod-190-grey-v1",
    "rr": "rod-128-red-v1",
    "wr": "rod-32-white-v1",
    "br": "rod-54-blue-v1",
    "yr": "rod-86-yellow-v1",
    "gsr": "rod-16-green-v1",
    "motor": "motor-v1",
}

def try_infer_part_from_instance(instance_id: str) -> Optional[str]:
    """Mirror frontend alias inference logic."""
    direct = ALIAS_TO_PART_ID.get(instance_id.lower())
    if direct:
        return direct

    underscore_idx = instance_id.rfind("_")
    if underscore_idx > 0:
        prefix = instance_id[:underscore_idx].lower()
        return ALIAS_TO_PART_ID.get(prefix)

    return None

def parse_compact_topology(text: str) -> TopologyModel:
    """Parse shorthand text into a TopologyModel."""
    explicit_parts = {}  # instance_id -> part_id
    discovered_instances = set()
    connections = []

    lines = text.splitlines()
    for i, raw in enumerate(lines):
        line_num = i + 1
        # Strip comments and whitespace
        line = raw.split("#")[0].strip()
        if not line:
            continue

        # 1. Part declaration: part <id> <part_id>
        part_match = re.match(r"^part\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9._-]+)$", line, re.I)
        if part_match:
            instance_id, part_id = part_match.groups()
            explicit_parts[instance_id] = part_id
            discovered_instances.add(instance_id)
            continue

        # 2. Alias part declaration: <id> : <part_id>
        alias_match = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*([A-Za-z0-9._-]+)$", line)
        if alias_match:
            instance_id, part_id = alias_match.groups()
            explicit_parts[instance_id] = part_id
            discovered_instances.add(instance_id)
            continue

        # 3. Connection: <inst>.<port> <op> <inst>.<port> [@ <twist>[!] [slide=<offset>]]
        edge_match = re.match(
            r"^([A-Za-z0-9_.-]+)\s*(--|~~|=>)\s*([A-Za-z0-9_.-]+)"
            r"(?:\s*@\s*(-?\d+(?:\.\d+)?)(!)?(?:\s+slide=([+-]?\d+(?:\.\d+)?))?)?$",
            line
        )
        if not edge_match:
            raise ParseError("Invalid compact syntax", line_num, raw.strip())

        from_ref, operator, to_ref, twist_str, fixed_roll_mark, slide_str = edge_match.groups()
        
        # Verify ref format
        if "." not in from_ref or "." not in to_ref:
            raise ParseError("Invalid endpoint format. Expected instance.port", line_num, raw.strip())

        from_inst = from_ref.split(".")[0]
        to_inst = to_ref.split(".")[0]
        discovered_instances.add(from_inst)
        discovered_instances.add(to_inst)

        connections.append(TopologyConnection(
            **{
                "from": from_ref,
                "to": to_ref,
                "joint_type": JOINT_OPERATOR_TO_TYPE[operator],
                "twist_deg": float(twist_str) if twist_str else 0.0,
                "fixed_roll": fixed_roll_mark == "!",
                "slide_offset": float(slide_str) if slide_str else 0.0,
            }
        ))

    # Build parts list from discovered instances
    parts = []
    for inst_id in sorted(list(discovered_instances)):
        part_id = explicit_parts.get(inst_id)
        if not part_id:
            part_id = try_infer_part_from_instance(inst_id)
            if not part_id:
                # Find the line where this instance first appeared for error reporting
                # (Simple fallback: just report instance name)
                raise ValueError(f"Cannot infer part_id for instance '{inst_id}'. Add an explicit part declaration.")
        
        parts.append(TopologyPart(instance_id=inst_id, part_id=part_id))

    return TopologyModel(parts=parts, connections=connections)

def stringify_compact_topology(model: TopologyModel) -> str:
    """Serialize a TopologyModel back to shorthand text."""
    lines = ["# compact topology format", "# part <instance_id> <part_id>", ""]
    
    # Sort parts by instance_id for deterministic output
    sorted_parts = sorted(model.parts, key=lambda p: p.instance_id)
    for part in sorted_parts:
        lines.append(f"part {part.instance_id} {part.part_id}")
    
    if model.connections:
        lines.append("")
        
    # Sort connections by from_ref, to_ref for deterministic output
    # (Note: we don't swap from/to here to stay close to input, but canonicalization would)
    sorted_conns = sorted(model.connections, key=lambda c: (c.from_ref, c.to_ref))
    for conn in sorted_conns:
        op = JOINT_TYPE_TO_OPERATOR.get(conn.joint_type, "--")
        line = f"{conn.from_ref} {op} {conn.to_ref}"
        
        slide_val = getattr(conn, 'slide_offset', 0.0) or 0.0
        if slide_val != 0.0:
            twist_val = f"{conn.twist_deg:g}"
            slide_fmt = f"+{slide_val:g}" if slide_val > 0 else f"{slide_val:g}"
            line += f" @ {twist_val}{'!' if conn.fixed_roll else ''} slide={slide_fmt}"
        elif conn.twist_deg != 0 or conn.fixed_roll:
            twist_val = f"{conn.twist_deg:g}"
            line += f" @ {twist_val}{'!' if conn.fixed_roll else ''}"
            
        lines.append(line)
        
    return "\n".join(lines)
