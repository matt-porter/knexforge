# K'NexForge Troubleshooting Guide

This guide is designed to help developers and AI agents resolve common issues encountered while building and running K'NexForge.

---

## 🐍 Python Core / FastAPI Sidecar Issues

### Sidecar Fails to Start

**Symptom**: Running `python -m uvicorn src.core.api:app` crashes or immediately exits.
**Causes & Solutions**:
1. **Wrong Directory**: Make sure you are running the command from the *repository root*, not inside `src/core/`.
2. **Missing Dependencies**: Ensure you've activated your virtual environment and installed the dependencies with extras:
   ```bash
   pip install -e ".[dev,physics,meshgen,ai]"
   ```
3. **Port in Use**: If port 8000 is occupied, you might see an `Address already in use` error.
   - *Fix (Linux/macOS)*: `lsof -i :8000` to find the PID, then `kill -9 <PID>`.
   - *Fix (Windows)*: `netstat -ano | findstr :8000`, note the PID, then `taskkill /PID <PID> /F`.
   - *Alternative*: Run on a different port: `python -m uvicorn src.core.api:app --port 8001` (Note: you will need to update the frontend's expected sidecar URL).
4. **Syntax/Import Errors**: Check the console output. If there is a missing module error, verify your `PYTHONPATH` includes `src` implicitly by using `pip install -e .`.

### Physics Simulation Crashes (PyBullet)

**Symptom**: Calling the `/stability` endpoint or starting the `/ws/simulate` WebSocket causes a crash.
**Causes & Solutions**:
1. **PyBullet not installed**: Ensure you installed the `[physics]` extra.
2. **Over-constrained Loops**: Creating too many `JOINT_FIXED` connections in a closed loop can cause the PyBullet solver to explode.
   - *Fix*: The engine should gracefully degrade, but verify the connection graph in `physics/graph.py` isn't fundamentally broken.
3. **Zero Mass Parts**: All dynamic parts must have mass > 0. Check your part JSON definitions. The only exception is anchored parts (like the motor base) which are programmatically set to 0 mass to freeze them.
4. **Invalid Hinge Axes**: Revolute joints require normalized unit vectors for axes.

---

## 🖥️ Frontend (React/Three.js) Issues

### 3D Viewer is Empty or Black

**Symptom**: The app loads, but the main canvas shows nothing.
**Causes & Solutions**:
1. **Missing GLB Files**: The viewer attempts to load meshes from `parts/meshes/`. If these are missing, it cannot render parts.
   - *Fix*: Run `python tools/generate_meshes.py --force` to generate them.
2. **WebGL Errors**: Check the browser console (F12). 
   - Ensure your browser supports WebGL.
   - Check for Three.js specific errors (e.g., failed to parse GLTF).
3. **Camera Misalignment**: Try zooming out or resetting the view if the camera ended up inside a model or far away.

### Cannot Connect to Sidecar API

**Symptom**: Frontend shows "Disconnected" or console shows CORS/Connection Refused errors on port 8000.
**Causes & Solutions**:
1. **Sidecar Not Running**: Start the Python API in a separate terminal.
2. **CORS Issues**: In development, `api.py` allows all origins (`*`). If you see CORS errors, ensure `api.py`'s `CORSMiddleware` configuration hasn't been altered.
3. **Tauri Environment**: If running the Tauri desktop app (`npm run tauri dev`), remember that Tauri sidecar integration is currently a **stub**. The frontend falls back to attempting to hit `http://127.0.0.1:8000`. Ensure the Python sidecar is running independently.

### UI State Seems Stuck

**Symptom**: Clicking parts doesn't work, drag and drop is broken.
**Causes & Solutions**:
1. **Zustand Store Desync**: In development, hot-reloading can sometimes leave stores in weird states. 
   - *Fix*: Refresh the page.
2. **Check React DevTools**: Inspect the `buildStore` and `interactionStore` to see if `selectedPart` or `dragState` are stuck.

---

## 🛠️ Build & Tooling Issues

### Type Checking / Linting Fails

**Python (`ruff` / `pyright`)**:
- We use strict `pyright` settings. Ensure you aren't ignoring type warnings. Use type casting `cast()` or `type: ignore` *only* if absolutely necessary and document why.

**TypeScript (`eslint` / `tsc`)**:
- Running `npm run type-check` might fail if you've added new fields to the Python backend that haven't been mirrored in the TypeScript interfaces (e.g., `frontend/src/types/`). Ensure schema parity.

### Mesh Generation Fails

**Symptom**: `python tools/generate_meshes.py` throws errors.
**Causes & Solutions**:
1. **Missing OpenSCAD**: The script relies on OpenSCAD to convert `.scad` files. Make sure OpenSCAD is installed and accessible in your system's PATH.
2. **Missing `trimesh`**: Ensure the `[meshgen]` extra was installed via pip.

---

## 🤖 AI / Scan-to-Build Pipeline Issues

*Note: The Scan-to-Build pipeline is currently highly experimental (Phase 4).*

**Symptom**: OpenCV / YOLO errors when running `ai/scan-to-build/` scripts.
**Solutions**: Ensure you have installed the `[ai]` extras and the specific requirements listed in `ai/scan-to-build/requirements.txt` which might include heavy dependencies like `ultralytics` and `opencv-python`.

---

*Still stuck? Ask a question in your PR or open a GitHub issue. If you are an AI Agent, refer to your instructions in `AGENTS.md` on how to ask questions.*