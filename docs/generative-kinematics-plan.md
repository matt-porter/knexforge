# Generative Kinematics & Mechanism Synthesis

## Overview
While standard structural AI (like LegoGPT) focuses on static stability (e.g., "Will this bridge collapse?"), K'NEX's unique value lies in its mechanical nature—axles spinning inside connectors, gears, motors, and kinetic linkages. 

**Generative Kinematics** is a radical expansion of the K'NexForge AI and Physics pipeline. It upgrades the system from a "static CAD builder" into a "Text-to-Mechanism" engine. The AI will learn to synthesize functioning mechanical systems (gearboxes, walking linkages, drive trains), validate their physical operation in PyBullet, and render them fully animated and interactive in the UI.

This document breaks down the implementation into four actionable, sequential feature tracks.

---

## Phase 1: Kinematic Port & Mate System Upgrade
*Goal: Teach the core engine the difference between a rigid structural connection and a free-moving mechanical joint.*

Currently, the engine snaps parts together rigidly. We must introduce degrees of freedom (DoF) to specific port connections.

### Tasks
1. **Extend `MateType` Definitions:**
   - **Context:** `src/core/parts/models.py` and `frontend/src/types/parts.ts`
   - **Action:** Add `rotational_hole` and `slider_hole` (if not already handled by existing types). 
   - **Logic:** When a `rod_side` passes through a `rotational_hole` (like the center hole of a connector), the system must flag this connection as a **Hinge Joint** (1 DoF, rotation around the rod's axis) rather than a rigid weld.
2. **Joint Graph Abstraction:**
   - **Context:** `src/core/physics/graph.py`
   - **Action:** Update the Tier 1 physics graph. Edges representing connections must carry a `joint_type` property (`fixed`, `revolute`, `prismatic`).
   - **Validation:** Write unit tests ensuring that a rod snapped into the outer clip of a connector yields a `fixed` joint, while a rod passed through the center hole yields a `revolute` joint.

---

## Phase 2: PyBullet Dynamic Simulation Integration
*Goal: Bring the mechanical joints to life using Tier 2 physics, allowing parts to spin, slide, and drive each other.*

### Tasks
1. **Dynamic Joint Mapping:**
   - **Context:** `src/core/physics/pybullet.py`
   - **Action:** When translating the build graph into PyBullet constraints, map `revolute` edges to `pybullet.createConstraint(..., jointType=pybullet.JOINT_HINGE, ...)`. Ensure the hinge axis perfectly aligns with the rod's local direction vector.
2. **The "Motor" Part:**
   - **Context:** `parts/motor-v1.json` (New Part) and `src/core/physics/pybullet.py`
   - **Action:** Model a basic K'NEX motor block. Give it a special `drive_axle` port. In PyBullet, apply `pybullet.setJointMotorControl2(..., controlMode=pybullet.VELOCITY_CONTROL, targetVelocity=...)` to any rod inserted into this port.
3. **Collision & Gear Meshing (Advanced):**
   - **Context:** `src/core/physics/pybullet.py`
   - **Action:** Ensure convex hull collision meshes for gears are highly accurate so teeth physically push each other in simulation. Alternatively, detect meshing gears mathematically via distance and apply a generic gear constraint (`pybullet.createConstraint(..., jointType=pybullet.JOINT_GEAR)`) for much faster simulation.

---

## Phase 3: Mechanism Synthesis Dataset Generation
*Goal: Generate the training data required to teach the LLM how to build working machines, not just static shapes.*

This modifies the `StableText2K'Nex` pipeline defined in `docs/ai-training-plan.md`.

### Tasks
1. **Functional Fitness Functions:**
   - **Context:** `src/ai/dataset_generator.py`
   - **Action:** Instead of only checking `core.is_stable()`, introduce functional tests. 
   - **Example Implementation:**
     ```python
     def test_gearbox_ratio(build, target_ratio=3.0):
         motor_rpm = start_motor(build)
         output_rpm = measure_output_rpm(build)
         return isclose(motor_rpm / output_rpm, target_ratio)
     ```
2. **Procedural Mechanism Generation (The Oracle):**
   - **Context:** `src/ai/dataset_generator.py`
   - **Action:** Write procedural scripts to generate valid mechanical primitive datasets:
     - Simple gear trains (1:1, 3:1, etc.)
     - Crank-slider mechanisms
     - Differential drives
   - Run these through the PyBullet functional tests. Only append to `dataset.jsonl` if the mechanism turns freely without binding or exploding.
3. **Kinematic Prompting:**
   - **Context:** Training Prompts
   - **Action:** Map successful mechanical graphs to rich prompts (e.g., `[USER] Generate a K'NEX gearbox that reduces speed by a factor of 3.`).

---

## Phase 4: UI & Interactive Play
*Goal: Allow the user to turn on the machine in the browser and watch it run.*

### Tasks
1. **Interactive Simulation Mode:**
   - **Context:** `frontend/src/stores/interactionStore.ts` & `frontend/src/components/Viewer/`
   - **Action:** Add a "Play / Simulate" button. When clicked, lock the build state and establish a WebSocket/Sidecar stream to the Python PyBullet backend.
2. **Live Transform Streaming:**
   - **Context:** `src/core/api.py` and `frontend/src/services/sidecarBridge.ts`
   - **Action:** While simulating, the backend runs `pybullet.stepSimulation()` at 60Hz. It streams an array of `[instance_id, pos_x, pos_y, pos_z, quat_x, quat_y, quat_z, quat_w]` back to the frontend.
3. **Frontend Rendering:**
   - **Context:** `frontend/src/components/Viewer/InstancedParts.tsx`
   - **Action:** Use React Three Fiber's `useFrame` to interpolate the incoming position/rotation data, updating the instanced meshes directly via `InstanceMatrix`. The user will see gears spinning and rods sliding in real-time.
4. **Motor Controls:**
   - **Context:** UI Overlay
   - **Action:** If a motor part is present in the build, render a UI slider to control its RPM and direction, sending those commands back to the PyBullet simulation.