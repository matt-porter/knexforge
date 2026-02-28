# K'NexForge Quick Reference Card

**For AI Agents**: One-page cheat sheet for common operations. Keep this open while working on the project.

---

## 🎯 File Locations (Quick Lookup)

| I Need To... | Go Here |
|--------------|---------|
| Find Python implementation | `src/core/` |
| Find React components | `frontend/src/components/` |
| Add a new part definition | `parts/<name>-v1.json` + `parts/meshes/` |
| Write unit tests (Python) | `src/core/tests/test_<module>.py` |
| Write unit tests (TS) | `frontend/src/<path>.test.ts` |
| Generate meshes from SCAD | `tools/generate_meshes.py` |
| Run AI inference | `src/ai/inference.py` |
| Check part schema | `schema/knex-part.json` |
| Learn how to contribute | `CONTRIBUTING.md` |
| Troubleshoot an issue | `docs/TROUBLESHOOTING.md` |

---

## ⚡ Common Commands

**Prerequisites**: Activate Python venv first:
```bash
python -m venv .venv
source .venv/bin/activate     # Linux/macOS
.venv\Scripts\activate         # Windows
pip install -e ".[dev,physics,meshgen]"
```

### Setup & Development
```bash
# Frontend dependencies
cd frontend && npm install

# Run Python tests (from repo root with venv activated)
.venv\Scripts\python.exe -m pytest src/core/tests/ --cov  # Windows
.venv/bin/python -m pytest src/core/tests/ --cov          # Linux/macOS

# Run frontend tests
cd frontend && npm test

# Start sidecar API (port 8000)
.venv\Scripts\python.exe -m uvicorn "src.core.api:app" --host 127.0.0.1 --port 8000 --reload

# Frontend web dev mode
cd frontend && npm run dev

# Frontend Tauri desktop (note: sidecar integration is a stub)
cd frontend && npm run tauri dev

# Generate meshes from OpenSCAD
python tools/generate_meshes.py --force
python tools/generate_meshes.py --part <part_id>

# Type checking
ruff check src/ && pyright src/               # Python
cd frontend && npm run type-check             # TypeScript
```

---

## 🧩 Adding a New Part (Step-by-Step)

1. **Create JSON** in `parts/`:
   ```json
   {
     "format_version": "1.1",
     "id": "my-part-v1",
     "name": "My Custom Part",
     "category": "connector|rod|wheel|plate|special",
     "mesh_file": "meshes/my-part.glb",
     "default_color": "#RRGGBB",
     "mass_grams": 2.5,
     "ports": [
       {
         "id": "A",
         "position": [0, 0, 0],
         "direction": [1, 0, 0],
         "mate_type": "rod_hole",
         "accepts": ["rod_end"],
         "allowed_angles_deg": [0, 90, 180, 270]
       }
     ]
   }
   ```

2. **Generate GLB** (if using OpenSCAD):
   ```bash
   python tools/generate_meshes.py --part my-part-v1
   ```

3. **Test it**:
   ```python
   from src.core.parts.loader import load_part
   part = load_part("my-part-v1")
   assert part is not None
   ```

---

## 🔌 FastAPI Endpoints (`src/core/api.py`)

| Endpoint | Method | Purpose | Request Body |
|----------|--------|---------|--------------|
| `/build` | POST | Create new build | `{parts: [], connections: []}` |
| `/snap` | POST | Check if two ports can connect | `{build_id, port_a, port_b}` |
| `/stability` | POST | Calculate stability score | `{build_id \| parts, connections}` |
| `/export` | POST | Export to .knx or other format | `{build_id, format: "knx"\|"gltf"}` |
| `/load` | POST | Load from .knx file | `multipart/form-data: file` |

**WebSocket endpoints**:
- `/ws/stability` - Real-time stability updates
- `/ws/simulate` - Live PyBullet simulation stream

---

## 📊 Zustand Stores (`frontend/src/stores/`)

| Store | Purpose | Key Actions |
|-------|---------|-------------|
| `buildStore.ts` | Current build state | `addPart()`, `removePart()`, `connectPorts()` |
| `interactionStore.ts` | User input handling | `setSelected()`, `startDrag()`, `endDrag()` |
| `visualStore.ts` | Rendering mode | `setMode("realistic"\|"stress"\|"exploded")` |
| `datasetStore.ts` | AI dataset cache | `loadDataset()`, `filterByPrompt()` |

**Access pattern**:
```typescript
import { useBuildStore } from '@/stores/buildStore'
const parts = useBuildStore(state => state.parts)
const addPart = useBuildStore(state => state.addPart)
```

---

## 🧪 Writing Tests

### Python (pytest)
```python
from src.core.build import Build
from src.core.snapping import snap_ports

def test_snap_ports_compatible():
    port_a = Port(id="A", position=[0,0,0], direction=[1,0,0], mate_type="rod_hole")
    port_b = Port(id="end1", position=[0,0,0], direction=[-1,0,0], mate_type="rod_end")
    
    result = snap_ports(port_a, port_b)
    assert result.success == True
    assert result.connection is not None

def test_snap_ports_incompatible():
    # Test rejection of mismatched mate_types
    ...
```

### TypeScript (Vitest)
```typescript
import { describe, it, expect } from 'vitest'
import { buildStore } from '@/stores/buildStore'

describe('buildStore', () => {
  it('adds part to build', () => {
    const store = buildStore()
    store.addPart({ part_id: 'rod-86-red-v1', position: [0,0,0] })
    expect(store.parts.length).toBe(1)
  })
})
```

---

## 🧠 Core Data Structures

### PartInstance (build.py)
```python
@dataclass
class PartInstance:
    instance_id: str          # Unique ID like "c1", "r2"
    part_id: str              # Reference to parts/*.json
    position: tuple[float, float, float]  # World space XYZ
    quaternion: tuple[float, float, float, float]  # W,X,Y,Z
    color: str | None         # Optional override
```

### Connection (snapping.py)
```python
@dataclass
class Connection:
    from_instance: str        # e.g., "c1.A"
    to_instance: str          # e.g., "r1.end1"
    joint_type: JointType     # FIXED | REVOLUTE | PRISMATIC
```

### Action (action_history.py)
```python
@dataclass
class BuildAction:
    step: int
    action: str               # "add_part" | "add_rod" | "remove_part"
    part_id: str | None
    instance_id: str | None
    position: list[float] | None
    quaternion: list[float] | None
    from_port: str | None     # For rods: "c1.A"
    to_port: str | None       # For rods: "new" or "r2.end2"
```

---

## 🎨 Rendering Modes (`frontend/src/stores/visualStore.ts`)

| Mode | Use Case | Visual Style |
|------|----------|--------------|
| `realistic` | Normal editing | PBR plastic materials, shadows |
| `instruction` | PDF generation | Black outlines, faded steps |
| `exploded` | Understanding structure | Parts separated along axes |
| `xray` | Debugging internals | Semi-transparent, see inside |
| `stress` | Physics debugging | Heatmap: blue (low) → red (high tension) |

---

## 🔍 Debugging Checklist

### Python Sidecar Not Starting?
- [ ] Check port 8000 not in use: `lsof -i :8000`
- [ ] Verify dependencies installed: `pip list | grep pybullet`
- [ ] Check logs: `python -m uvicorn src.core.api:app --reload 2>&1 | tee api.log`

### Frontend Can't Connect to Sidecar?
- [ ] Is sidecar running on http://127.0.0.1:8000?
- [ ] Check CORS in `api.py`: `allow_origins=["*"]` (dev only)
- [ ] Verify `sidecarBridge.ts` uses correct URL

### 3D Viewer Shows Nothing?
- [ ] Are GLB files present in `parts/meshes/`?
- [ ] Check browser console for Three.js errors
- [ ] Try switching visual modes with the toggle button
- [ ] Verify part library loaded: open Zustand DevTools

### Physics Simulation Crashes?
- [ ] All parts have mass > 0?
- [ ] Hinge axes are normalized unit vectors?
- [ ] No over-constrained loops (check `physics/graph.py`)?
- [ ] PyBullet initialized correctly in `pybullet.py`?

---

## 📖 Key Files to Read First

| If You Want To Understand... | Read This File |
|------------------------------|----------------|
| How builds work internally | `src/core/build.py` |
| Port snapping logic | `src/core/snapping.py` |
| FastAPI endpoint structure | `src/core/api.py` |
| Part loading & caching | `src/core/parts/loader.py` |
| Graph-based stability | `src/core/physics/graph.py` |
| PyBullet integration | `src/core/physics/pybullet.py` |
| Frontend viewer setup | `frontend/src/components/Viewer/KnexViewer.tsx` |
| State management patterns | `frontend/src/stores/buildStore.ts` |

---

## 🚦 Code Review Checklist for Agents

Before committing changes:

- [ ] All new code has type hints (Python) / types (TypeScript)
- [ ] Public functions have Google-style docstrings
- [ ] Unit tests added with ≥90% coverage on new code
- [ ] No `print()` statements in production code (use `structlog`)
- [ ] No hardcoded values (use part JSON or constants)
- [ ] Separation of concerns maintained (no Three.js in Python, no PyBullet in React)
- [ ] Updated relevant documentation if API changed
- [ ] Commit message follows Conventional Commits format

**Commit format**: `type(scope): description`  
Examples:
- `feat(core): add revolute joint support for motor axles`
- `fix(frontend): correct ghost preview offset on drag`
- `docs(AGENT-ONBOARDING.md): add quick reference card`

---

## 🆘 Emergency Contacts (When Stuck)

1. **Read existing tests** - They show correct API usage patterns
2. **Check docstrings** - All public functions are documented
3. **Search codebase**: `rg "function_name" src/` or `grep -r "pattern" frontend/src/`
4. **Ask in PR comment**: `"AGENT QUESTION: [question] — reference AGENTS.md section X"`

---

**Last updated**: 2026-02-28  
**Keep this file concise** - it's your quick lookup, not a tutorial.
