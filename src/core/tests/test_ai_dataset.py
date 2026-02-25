import pytest
from src.ai.dataset_generator import generate_dataset
import os

def test_dataset_generator_dry_run():
    # Run the generator with dry_run = True to ensure no errors
    # during procedural build generation
    try:
        generate_dataset("dummy.jsonl", count=2, dry_run=True)
    except Exception as e:
        pytest.fail(f"Dataset generator dry run failed: {e}")

def test_dataset_generator_file_creation(tmpdir):
    # Test that it writes a valid file with lines
    out_file = os.path.join(tmpdir, "out.jsonl")
    generate_dataset(out_file, count=1, dry_run=False)
    
    assert os.path.exists(out_file)
    with open(out_file, "r") as f:
        lines = f.readlines()
        assert len(lines) == 1
        assert "is_stable" in lines[0]
