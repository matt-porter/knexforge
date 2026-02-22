"""Pytest fixtures for K'NexForge core tests."""

import pytest

from core.parts.loader import PartLoader


@pytest.fixture(scope="function")
def clean_part_library():
    """Return a fresh PartLibrary for each test (clears cache)."""
    PartLoader.clear_cache()
    return PartLoader.load()


@pytest.fixture(scope="session")
def all_parts():
    """Session-scoped loaded library (for tests that don't modify state)."""
    PartLoader.clear_cache()
    return PartLoader.load()