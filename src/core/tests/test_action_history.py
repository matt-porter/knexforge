"""Tests for the action history system — recording, undo/redo, JSONL serialization."""

import json

import pytest

from core.action_history import (
    ActionHistory,
    AddPartAction,
    RemovePartAction,
    SnapAction,
    parse_action,
)
from core.build import Build
from core.file_io import load_knx, save_knx
from core.parts.models import PartInstance
from core.snapping import align_rod_to_hole


@pytest.fixture
def library(clean_part_library):
    return clean_part_library


def _make_build_with_snap(library):
    """Helper: build with c1 + r1 snapped at port A."""
    build = Build()
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-green-v1"))
    rod_part = library.get("rod-128-red-v1")
    temp = PartInstance(instance_id="r1", part=rod_part)
    pos, quat = align_rod_to_hole(temp, "end1", c1, "A")
    r1 = PartInstance(instance_id="r1", part=rod_part, position=pos, quaternion=quat)
    build.add_part(c1)
    build.add_part(r1)
    build.attempt_snap("r1", "end1", "c1", "A")
    return build


# --- ActionHistory unit tests ---

def test_empty_history():
    h = ActionHistory()
    assert len(h) == 0
    assert not h.can_undo
    assert not h.can_redo
    assert h.to_jsonl() == ""


def test_record_increments_step():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(SnapAction(from_port="r1.end1", to_port="c1.A"))

    assert len(h) == 2
    assert h.committed_actions[0].step == 1
    assert h.committed_actions[1].step == 2


def test_undo_redo_cursor():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(AddPartAction(part_id="p2", instance_id="c2", position=[1, 0, 0], quaternion=[0, 0, 0, 1]))

    assert len(h) == 2
    assert h.can_undo

    entry = h.undo()
    assert entry is not None
    assert entry.action.instance_id == "c2"
    assert len(h) == 1
    assert h.can_redo

    entry = h.redo()
    assert entry is not None
    assert entry.action.instance_id == "c2"
    assert len(h) == 2
    assert not h.can_redo


def test_new_action_discards_redo_history():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(AddPartAction(part_id="p2", instance_id="c2", position=[1, 0, 0], quaternion=[0, 0, 0, 1]))

    h.undo()  # cursor at 1
    h.record(AddPartAction(part_id="p3", instance_id="c3", position=[2, 0, 0], quaternion=[0, 0, 0, 1]))

    assert len(h) == 2  # c1 + c3 (c2 discarded)
    assert not h.can_redo
    assert h.committed_actions[1].instance_id == "c3"


def test_undo_past_beginning_returns_none():
    h = ActionHistory()
    assert h.undo() is None


def test_redo_past_end_returns_none():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    assert h.redo() is None


# --- JSONL serialization ---

def test_to_jsonl_format():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(SnapAction(from_port="r1.end1", to_port="c1.A"))

    jsonl = h.to_jsonl()
    lines = jsonl.strip().split("\n")
    assert len(lines) == 2

    first = json.loads(lines[0])
    assert first["action"] == "add_part"
    assert first["step"] == 1

    second = json.loads(lines[1])
    assert second["action"] == "snap"
    assert second["from_port"] == "r1.end1"


def test_to_jsonl_excludes_undone_actions():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(AddPartAction(part_id="p2", instance_id="c2", position=[1, 0, 0], quaternion=[0, 0, 0, 1]))
    h.undo()

    jsonl = h.to_jsonl()
    lines = jsonl.strip().split("\n")
    assert len(lines) == 1


def test_from_jsonl_roundtrip():
    h = ActionHistory()
    h.record(AddPartAction(part_id="p1", instance_id="c1", position=[0, 0, 0], quaternion=[0, 0, 0, 1]))
    h.record(SnapAction(from_port="r1.end1", to_port="c1.A"))
    h.record(RemovePartAction(instance_id="c1"))

    jsonl = h.to_jsonl()
    restored = ActionHistory.from_jsonl(jsonl)

    assert len(restored) == 3
    assert restored.committed_actions[0].action == "add_part"
    assert restored.committed_actions[1].action == "snap"
    assert restored.committed_actions[2].action == "remove_part"


def test_parse_action_all_types():
    add = parse_action('{"step":1,"action":"add_part","part_id":"p","instance_id":"c1","position":[0,0,0],"quaternion":[0,0,0,1]}')
    assert isinstance(add, AddPartAction)

    snap = parse_action('{"step":2,"action":"snap","from_port":"r1.end1","to_port":"c1.A"}')
    assert isinstance(snap, SnapAction)

    remove = parse_action('{"step":3,"action":"remove_part","instance_id":"c1"}')
    assert isinstance(remove, RemovePartAction)


def test_parse_action_unknown_raises():
    with pytest.raises(ValueError, match="Unknown action type"):
        parse_action('{"action":"fly"}')


# --- Build integration ---

def test_build_records_add_part(library):
    build = Build()
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-green-v1"))
    build.add_part(c1)

    assert len(build.history) == 1
    action = build.history.committed_actions[0]
    assert isinstance(action, AddPartAction)
    assert action.part_id == "connector-3way-green-v1"
    assert action.instance_id == "c1"


def test_build_records_snap(library):
    build = _make_build_with_snap(library)

    # 2 add_part + 1 snap = 3 actions
    assert len(build.history) == 3
    snap = build.history.committed_actions[2]
    assert isinstance(snap, SnapAction)
    assert "r1.end1" == snap.from_port
    assert "c1.A" == snap.to_port


def test_build_records_remove_part(library):
    build = _make_build_with_snap(library)
    build.remove_part("r1")

    assert len(build.history) == 4
    action = build.history.committed_actions[3]
    assert isinstance(action, RemovePartAction)
    assert action.instance_id == "r1"


def test_build_undo_add_part(library):
    build = Build()
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-green-v1"))
    build.add_part(c1)
    assert len(build.parts) == 1

    assert build.undo()
    assert len(build.parts) == 0
    assert not build.history.can_undo


def test_build_undo_snap(library):
    build = _make_build_with_snap(library)
    assert len(build.connections) == 1

    assert build.undo()  # undo snap
    assert len(build.connections) == 0
    assert len(build.parts) == 2  # parts still there


def test_build_undo_remove_part(library):
    build = _make_build_with_snap(library)
    build.remove_part("r1")
    assert "r1" not in build.parts

    assert build.undo()  # undo remove
    assert "r1" in build.parts
    assert len(build.connections) == 1  # connection restored


def test_build_redo_after_undo(library):
    build = Build()
    c1 = PartInstance(instance_id="c1", part=library.get("connector-3way-green-v1"))
    build.add_part(c1)
    build.undo()
    assert len(build.parts) == 0

    assert build.redo()
    assert len(build.parts) == 1
    assert "c1" in build.parts


def test_build_undo_redo_full_cycle(library):
    build = _make_build_with_snap(library)
    original_parts = len(build.parts)
    original_conns = len(build.connections)

    # Undo all 3 actions (snap, add r1, add c1)
    assert build.undo()  # undo snap
    assert build.undo()  # undo add r1
    assert build.undo()  # undo add c1
    assert len(build.parts) == 0
    assert len(build.connections) == 0

    # Redo all 3
    assert build.redo()  # redo add c1
    assert build.redo()  # redo add r1
    assert build.redo()  # redo snap
    assert len(build.parts) == original_parts
    assert len(build.connections) == original_conns


# --- .knx integration ---

def test_knx_saves_and_loads_action_history(library, tmp_path):
    build = _make_build_with_snap(library)
    out = tmp_path / "history.knx"
    save_knx(build, out)

    loaded_build, _ = load_knx(out, library)
    assert len(loaded_build.history) == 3
    assert loaded_build.history.committed_actions[0].action == "add_part"
    assert loaded_build.history.committed_actions[2].action == "snap"
