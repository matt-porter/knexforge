"""Action history — JSONL-serializable build log with undo/redo support."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field


class AddPartAction(BaseModel):
    """Record of placing a new part."""

    step: int = 0
    action: Literal["add_part"] = "add_part"
    part_id: str
    instance_id: str
    position: list[float] = Field(min_length=3, max_length=3)
    quaternion: list[float] = Field(min_length=4, max_length=4)
    color: Optional[str] = None


class SnapAction(BaseModel):
    """Record of connecting two ports."""

    step: int = 0
    action: Literal["snap"] = "snap"
    from_port: str  # dotted: "r1.end1"
    to_port: str    # dotted: "c1.A"


class RemovePartAction(BaseModel):
    """Record of removing a part."""

    step: int = 0
    action: Literal["remove_part"] = "remove_part"
    instance_id: str


BuildAction = Annotated[
    AddPartAction | SnapAction | RemovePartAction,
    Field(discriminator="action"),
]


def parse_action(line: str) -> BuildAction:
    """Parse a single JSONL line into the correct action type."""
    raw = json.loads(line)
    action_type = raw.get("action")
    if action_type == "add_part":
        return AddPartAction.model_validate(raw)
    if action_type == "snap":
        return SnapAction.model_validate(raw)
    if action_type == "remove_part":
        return RemovePartAction.model_validate(raw)
    raise ValueError(f"Unknown action type: {action_type}")


@dataclass
class _UndoEntry:
    """Pairs a forward action with data needed to reverse it."""

    action: AddPartAction | SnapAction | RemovePartAction
    # Stored only for remove_part undo (re-add the part + connections)
    snapshot: Optional[dict] = None


class ActionHistory:
    """Append-only action log with undo/redo cursor.

    The JSONL serialization only includes committed (non-undone) actions.
    """

    def __init__(self) -> None:
        self._entries: list[_UndoEntry] = []
        self._cursor: int = 0

    def record(
        self,
        action: AddPartAction | SnapAction | RemovePartAction,
        snapshot: dict | None = None,
    ) -> None:
        """Record a new action, discarding any redo history."""
        self._entries = self._entries[: self._cursor]
        action.step = self._cursor + 1
        self._entries.append(_UndoEntry(action=action, snapshot=snapshot))
        self._cursor += 1

    def undo(self) -> _UndoEntry | None:
        """Move cursor back one step. Returns the entry to reverse, or None."""
        if self._cursor == 0:
            return None
        self._cursor -= 1
        return self._entries[self._cursor]

    def redo(self) -> _UndoEntry | None:
        """Move cursor forward one step. Returns the entry to re-apply, or None."""
        if self._cursor >= len(self._entries):
            return None
        entry = self._entries[self._cursor]
        self._cursor += 1
        return entry

    @property
    def can_undo(self) -> bool:
        return self._cursor > 0

    @property
    def can_redo(self) -> bool:
        return self._cursor < len(self._entries)

    @property
    def committed_actions(self) -> list[AddPartAction | SnapAction | RemovePartAction]:
        """Actions up to the current cursor (excludes undone actions)."""
        return [e.action for e in self._entries[: self._cursor]]

    def __len__(self) -> int:
        return self._cursor

    def to_jsonl(self) -> str:
        """Serialize committed actions as JSONL (one JSON object per line)."""
        lines = [a.model_dump_json() for a in self.committed_actions]
        return "\n".join(lines)

    @classmethod
    def from_jsonl(cls, text: str) -> ActionHistory:
        """Reconstruct history from JSONL text. Redo history is empty."""
        history = cls()
        for line in text.strip().splitlines():
            if line.strip():
                action = parse_action(line)
                history._entries.append(_UndoEntry(action=action))
                history._cursor += 1
        return history
