import pytest
from core.shorthand_parser import parse_compact_topology, stringify_compact_topology, TopologyModel, ParseError

def test_parse_happy_path():
    text = """
    # My build
    part r1 rod-128-red-v1
    part c1 connector-4way-green-v1
    
    r1.end1 -- c1.A
    """
    model = parse_compact_topology(text)
    assert len(model.parts) == 2
    assert len(model.connections) == 1
    assert model.connections[0].from_ref == "r1.end1"
    assert model.connections[0].joint_type == "fixed"

def test_parse_with_twist():
    text = "part r1 rr\npart c1 gc4\nr1.center_tangent_y_pos -- c1.A @ 90"
    model = parse_compact_topology(text)
    assert model.connections[0].twist_deg == 90.0
    
    # Round trip
    output = stringify_compact_topology(model)
    assert "@ 90" in output
    assert "r1.center_tangent_y_pos -- c1.A @ 90" in output

def test_alias_inference():
    text = "rc3_1.A -- br_1.center_tangent_y_pos"
    model = parse_compact_topology(text)
    parts_map = {p.instance_id: p.part_id for p in model.parts}
    assert parts_map["rc3_1"] == "connector-3way-red-v1"
    assert parts_map["br_1"] == "rod-54-blue-v1"

def test_parse_errors():
    with pytest.raises(ParseError) as exc:
        parse_compact_topology("r1.end1 -> c1.A")
    assert "Invalid compact syntax" in str(exc.value)
    
    with pytest.raises(ValueError) as exc:
        parse_compact_topology("unknown_1.A -- rc3_1.B")
    assert "Cannot infer part_id" in str(exc.value)

def test_stringify_deterministic():
    model = TopologyModel(
        parts=[
            {"instance_id": "r1", "part_id": "rr"},
            {"instance_id": "c1", "part_id": "gc4"},
        ],
        connections=[
            {"from": "r1.end1", "to": "c1.A", "joint_type": "fixed", "twist_deg": 45.0}
        ]
    )
    text = stringify_compact_topology(model)
    # Parts should be sorted
    assert text.index("part c1") < text.index("part r1")
    assert "c1.A -- r1.end1" not in text # We don't swap in stringify currently
    assert "r1.end1 -- c1.A @ 45" in text
