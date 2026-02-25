from knexforge.core.build_assistant import BuildSpec, BuildAssistant

def test_bridge_build_steps():
    spec = BuildSpec(length_units=3)
    plan = BuildAssistant().generate_build(spec)
    assert len(plan.steps) == 3
    assert all(step.part_id == "rod" for step in plan.steps)

    # Check positions are spaced 100mm apart along X axis
    xs = [step.position[0] for step in plan.steps]
    assert xs[0] == 0.0
    assert xs[1] == 100.0
    assert xs[2] == 200.0

    # Check all rotations are upright
    assert all(step.rotation == (0.0, 0.0, 0.0) for step in plan.steps)
