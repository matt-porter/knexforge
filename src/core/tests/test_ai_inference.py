import pytest
from unittest.mock import patch, MagicMock
import sys

# Mock ollama before importing inference module
sys.modules['ollama'] = MagicMock()

from src.ai.inference import InferenceEngine


@patch('ollama.show')
@patch('ollama.chat')
def test_inference_engine_adds_valid_part(mock_chat, mock_show):
    """A valid add_part action should increase build.parts."""
    mock_show.return_value = True

    engine = InferenceEngine("test-model")

    mock_chat.side_effect = [
        {"message": {"content": '{"action": "add_part", "part_id": "rod-54-blue-v1", "position": [0,0,0], "rotation": [0,0,0,1]}'}},
    ]

    build = engine.generate_build("test", max_steps=1)
    assert len(build.parts) == 1


@patch('ollama.show')
@patch('ollama.chat')
def test_inference_engine_rejects_invalid_snap(mock_chat, mock_show):
    """A snap referencing missing parts should fail and count as a failure."""
    mock_show.return_value = True

    engine = InferenceEngine("test-model")

    # Three invalid snaps → hits consecutive_failures == 3, exits
    mock_chat.side_effect = [
        {"message": {"content": '{"action": "snap", "part1_id": "missing", "port1_id": "p1", "part2_id": "missing2", "port2_id": "p2"}'}},
        {"message": {"content": '{"action": "snap", "part1_id": "missing", "port1_id": "p1", "part2_id": "missing2", "port2_id": "p2"}'}},
        {"message": {"content": '{"action": "snap", "part1_id": "missing", "port1_id": "p1", "part2_id": "missing2", "port2_id": "p2"}'}},
    ]

    build = engine.generate_build("test", max_steps=5)
    assert len(build.parts) == 0


@patch('ollama.show')
@patch('ollama.chat')
def test_inference_engine_rejects_unknown_part(mock_chat, mock_show):
    """An add_part with an unknown part_id should fail."""
    mock_show.return_value = True

    engine = InferenceEngine("test-model")

    mock_chat.side_effect = [
        {"message": {"content": '{"action": "add_part", "part_id": "nonexistent-part", "position": [0,0,0], "rotation": [0,0,0,1]}'}},
        {"message": {"content": '{"action": "add_part", "part_id": "nonexistent-part", "position": [0,0,0], "rotation": [0,0,0,1]}'}},
        {"message": {"content": '{"action": "add_part", "part_id": "nonexistent-part", "position": [0,0,0], "rotation": [0,0,0,1]}'}},
    ]

    build = engine.generate_build("test", max_steps=5)
    assert len(build.parts) == 0
