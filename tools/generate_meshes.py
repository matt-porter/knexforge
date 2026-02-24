#!/usr/bin/env python3
"""
K'NexForge Mesh Generator
========================
Automatically renders all OpenSCAD files in parts/meshes/scad/ → STL → GLB.

Requirements (install once):
    pip install trimesh numpy

OpenSCAD must be installed and in your PATH:
    - Windows: https://openscad.org/downloads.html (add to PATH)
    - macOS: brew install openscad
    - Linux: sudo apt install openscad

Usage:
    python tools/generate_meshes.py          # normal run (skips unchanged)
    python tools/generate_meshes.py --force  # regenerate everything
    python tools/generate_meshes.py --help
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import trimesh


def main():
    parser = argparse.ArgumentParser(description="Generate GLB meshes from OpenSCAD files for K'NexForge")
    parser.add_argument("--scad-dir", default="parts/meshes/scad",
                        help="Directory containing .scad files (default: parts/meshes/scad)")
    parser.add_argument("--output-dir", default="parts/meshes",
                        help="Directory to save .glb files (default: parts/meshes)")
    parser.add_argument("--force", action="store_true",
                        help="Force regeneration of all GLBs even if they exist and are newer")
    parser.add_argument("--openscad", default="openscad",
                        help="Path to OpenSCAD executable (default: 'openscad' from PATH)")
    args = parser.parse_args()

    scad_dir = Path(args.scad_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not scad_dir.exists():
        print(f"❌ Error: SCAD directory not found: {scad_dir}")
        sys.exit(1)

    scad_files = list(scad_dir.glob("*.scad"))
    if not scad_files:
        print(f"❌ No .scad files found in {scad_dir}")
        sys.exit(1)

    print(f"🔨 Found {len(scad_files)} OpenSCAD files. Generating GLBs...\n")

    success = 0
    skipped = 0

    for scad_path in sorted(scad_files):
        # Strip version suffix to match mesh_file in part JSONs (e.g. rod-17-green.glb)
        stem = scad_path.stem
        if stem.endswith(("-v1", "-v2", "-v3")):
            stem = stem.rsplit("-", 1)[0]
        glb_name = stem + ".glb"
        glb_path = output_dir / glb_name

        # Skip if already up-to-date
        if not args.force and glb_path.exists() and glb_path.stat().st_mtime > scad_path.stat().st_mtime:
            print(f"⏭️  Skipping (up to date): {glb_name}")
            skipped += 1
            continue

        print(f"⚙️  Rendering {scad_path.name} → {glb_name}")

        # 1. Render SCAD → temporary STL
        with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp_stl:
            tmp_stl_path = Path(tmp_stl.name)

        try:
            result = subprocess.run(
                [
                    args.openscad,
                    "-o", str(tmp_stl_path),
                    str(scad_path)
                ],
                capture_output=True,
                text=True,
                timeout=30,               # safety timeout
                check=True
            )
        except subprocess.CalledProcessError as e:
            print(f"❌ OpenSCAD failed for {scad_path.name}")
            print(e.stderr)
            continue
        except FileNotFoundError:
            print("❌ OpenSCAD not found in PATH. Please install it and/or use --openscad /path/to/openscad")
            sys.exit(1)
        except subprocess.TimeoutExpired:
            print(f"❌ Timeout rendering {scad_path.name}")
            continue

        # 2. Convert STL → GLB with trimesh
        try:
            mesh = trimesh.load(str(tmp_stl_path))
            # Optional: apply default color tint if you want (uncomment to test)
            # mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=[200, 200, 200, 255])

            mesh.export(str(glb_path), file_type="glb")
            print(f"✅ Created {glb_path.name}")
            success += 1
        except Exception as e:
            print(f"❌ trimesh conversion failed for {scad_path.name}: {e}")
        finally:
            tmp_stl_path.unlink(missing_ok=True)

    print("\n🎉 Done!")
    print(f"   Generated: {success}")
    print(f"   Skipped:   {skipped}")
    print(f"   Total:     {len(scad_files)}")


if __name__ == "__main__":
    main()