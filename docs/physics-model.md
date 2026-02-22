
### 2. `docs/PHYSICS_MODEL.md`

```markdown
# Physics & Stability Model for K'NexForge

## Design Goals
- Real-time feedback while building (no lag on 5,000-piece models)
- AI generation always produces buildable results
- Optional “stress test” and collapse simulation for fun/education

## Tiered Physics System

### Tier 1 – Graph-Based (real-time, <15 ms)
- **NetworkX** directed graph: connectors = nodes, rods = weighted edges  
- Each rod modeled as a spring (rest length = exact rod length, stiffness tunable)  
- Simple iterative relaxation solver (10–20 iterations)  
- Outputs:
  - Overall stability score (0–100)
  - Weakest connection highlights
  - Center-of-mass projection vs. support base
  - “Wobble factor”

### Tier 2 – Full Rigid-Body (PyBullet, ~150–400 ms)
- Triggered on: AI finish, “Test Stability” button, export  
- Every part → rigid body with convex-hull collision mesh (auto-generated from GLB)  
- Joints created automatically at every validated port (fixed or limited-angle hinge)  
- 9.81 m/s² gravity + optional ground plane  
- Simulate 3–5 seconds; check for any part moving >2 mm or rotating >5°

### Tier 3 – Future Extensions
- MuJoCo or Genesis for deformable rods  
- Wind/external force testing  
- Robotic assembly simulation

## Connection Mechanics
- Port-to-port snaps are **rigid constraints** once connected  
- Tolerance: 0.2 mm (configurable per part)  
- Over-constraining allowed but reduces stability score  
- Diagonal rods get automatic bracing bonus

## Implementation
- `core/physics/graph.py` – Tier 1  
- `core/physics/pybullet.py` – Tier 2 wrapper  
- `core/build.py` exposes `build.stability_score()` and `build.simulate_collapse()`

## UI Integration
- Live corner gauge: green → yellow → red  
- Click “Stress Test” → animated collapse if unstable  
- AI generation progress bar shows “validating physics…”

This hybrid approach matches LegoGPT’s success (98.8% stable builds) while staying lightweight for desktop use.