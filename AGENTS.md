# K'NexForge – AI Coding Agent Guide

**Version**: 1.0 (Feb 2026)  
**Target agents**: Claude 3.5/4, Grok 4, Cursor, Codex, Windsurf, Aider, Continue.dev, etc.

This file is the **single source of truth** for any AI coding agent working on the project. Follow it strictly — deviations will be rejected in review.

---

## 1. Core Principles (Never Violate)

1. **Strict Separation of Concerns** (the #1 rule)
   - Python `core/` = pure domain logic, no UI, no rendering, no FastAPI routes
   - Frontend = only React/Three.js UI and Tauri glue
   - AI layer = only LLM orchestration + calls to core as oracle
   - Never import Three.js or Tauri code in Python, never import PyBullet in React

2. **Everything is Data-Driven**
   - New parts → only add JSON + GLB (never hard-code)
   - All behavior (snapping, physics, instructions) driven by the part schema

3. **Testability First**
   - Every new function/class must have unit tests (pytest)
   - Core must remain headless-testable (`pytest core/tests/`)

4. **Agent-Friendly Design**
   - All public APIs are documented with type hints + Google-style docstrings
   - Use `pydantic` models for any data crossing boundaries
   - Prefer explicit JSON action streams over magic strings

---

## 2. Project Structure (Only Edit These Folders)

```
Repository Root/
├── src/                          ← ACTUAL PYTHON CODE LOCATION
│   ├── core/                     ← All Python domain logic
│   │   ├── build.py              ← Build, PartInstance, ConnectionGraph
│   │   ├── snapping.py           ← Port-to-port alignment + tolerance
│   │   ├── file_io.py            ← .knx load/save
│   │   ├── api.py                ← FastAPI sidecar endpoints
│   │   ├── action_history.py     ← JSONL action tracking
│   │   ├── parts/                ← Part loader + models
│   │   ├── physics/              ← Graph stability + PyBullet
│   │   ├── instructions/         ← PDF generation
│   │   └── tests/                ← pytest suite
│   └── ai/                       ← Dataset generator + inference
├── knexforge/core/               ← STUB (minimal, mostly empty)
├── frontend/src/                 ← React + TypeScript app
│   ├── components/Viewer/        ← 3D rendering components
│   ├── stores/                   ← Zustand state management
│   ├── services/sidecarBridge.ts ← Python API client
│   └── hooks/                    ← Custom React hooks
├── ai/scan-to-build/             ← Computer vision pipeline
├── parts/                        ← Part JSON definitions + meshes/
├── schema/                       ← JSON Schema for parts
├── tools/                        ← Mesh generation scripts
├── docs/                         ← Documentation (YOU ARE HERE)
└── README.md
```

**⚠️ CRITICAL**: AGENTS.md and other docs may reference `knexforge/core/` but the **actual implementation is in `src/core/`**. Always check `src/core/` first for Python code.

**Forbidden**:
- Adding files to root
- Creating new top-level folders without team approval
- Putting business logic in frontend/

---

## 3. Coding Standards

### Python (`src/core/`)
- Python 3.12+
- `ruff` + `pyright` (strict)
- Black line length 100
- Use `pydantic v2` for all models
- All public classes/functions must have full type hints
- Prefer `dataclass` or `pydantic.BaseModel` over plain dicts
- Logging: `structlog` (structured)
- Never use `print()` in library code

**Example docstring**:
```python
def snap_ports(
    port_a: Port,
    port_b: Port,
    tolerance_mm: float = 0.2
) -> Optional[Connection]:
    """Attempt to snap two ports. Returns Connection if successful."""
```

### TypeScript / React (`frontend/src/`)
- TypeScript 5.5+ strict mode
- eslint + prettier (config already in repo)
- Functional components + hooks only (no class components)
- Zustand for state, Immer for mutations
- React-Three-Fiber best practices: use `useFrame`, `useThree`, instanced meshes


4. How to Add / Change Features (Agent Workflow)

New Part
Add JSON to parts/
Add .scad to parts/meshes/scad/ (if generating from OpenSCAD)
Run python tools/generate_meshes.py --force
Add test in src/core/tests/test_parts.py

New Core Feature
Implement in src/core/
Add corresponding pydantic model if data crosses to frontend/AI
Write tests first (TDD)
Expose via src/core/api.py (FastAPI router for Tauri)

AI Changes
Only edit inside src/ai/ or ai/scan-to-build/
Dataset generator must output exact JSONL format from README
Always test generation loop with --dry-run flag

Frontend Changes
Never touch Three.js math directly — use helpers from core/ via Tauri commands
All 3D objects must be driven by Build state from Python

5. Testing Requirements (Mandatory)

src/core/tests/ must pass before any PR
Coverage ≥ 90% on new code
Snapshot tests for instruction PDF output (optional but encouraged)
AI generation tests must assert ≥ 95% valid builds on a 50-example smoke set

Run:

pytest src/core/tests/ --cov

6. Commit & PR Rules
Commit message format (Conventional Commits):
textfeat(core): add port snapping tolerance parameter
fix(ai): increase rollback temperature on physics failure
docs: update AGENTS.md for new mesh generator
PR Checklist (agent must verify):

 All tests pass
 New code is typed
 Follows separation of concerns
 Updated relevant docs (AGENTS.md, README, etc.)
 No print(), console.log() left in production paths
 PLAN.md updated to reflect completed tasks before committing
 Changes committed with a descriptive Conventional Commits message

**Important**: After completing any task, **always** update PLAN.md to mark it done and commit your changes before moving on to the next task. Do not leave completed work uncommitted.


7. Common Pitfalls (Avoid These!)

Hard-coding rod lengths or connector angles anywhere except part JSON
Putting physics code in the renderer
Using global variables in src/core/
Generating GLBs manually — always use the Python script
Changing the JSON schema without bumping format_version and updating loader
Importing trimesh or openscad in production code (only in tools/)

**⚠️ Critical**: Always check `src/core/` for Python implementation, not `knexforge/core/`.


8. How to Collaborate with Other Agents / Humans

When stuck: ask for clarification in PR comment using this exact phrase:"AGENT QUESTION: [your question] — reference AGENTS.md section X"
Prefer small, focused PRs (≤ 400 lines)
If you need to touch multiple layers (core + frontend + ai), split into 3 PRs


9. Tooling & Commands You Can Use

# Mesh generation
python tools/generate_meshes.py --force

# Type checking + lint
ruff check src/ && pyright src/
cd frontend && npm run type-check && npm run lint

# Run tests
pytest src/core/tests/ --cov

# Start sidecar API (port 8000)
python -m uvicorn src.core.api:app --reload

# Run desktop app
cd frontend && npm run tauri dev

You are now fully authorized to make changes.
Welcome to the team!
Follow this guide and we will ship the best open-source K'Nex builder in the world.
Last updated: 2026-02-22
Made for Claude, Grok, Codex and friends ❤️