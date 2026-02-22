# File Formats Specification

## Primary Format: `.knx` (zipped package)
A standard ZIP file renamed to `.knx`. Double-click opens in K'NexForge (Tauri association).

Internal structure:

my-ferris-wheel.knx/
├── manifest.json
├── model.json
├── action_history.jsonl     # full AI or edit sequence
├── meshes/                  # all required GLB files
│   ├── connector-3way-yellow.glb
│   └── rod-150-red.glb
├── thumbnails/
│   └── preview-512.png
└── parts/                   # any custom parts (optional)


### manifest.json
```json
{
  "format_version": "1.0",
  "app_version": "0.1.0",
  "created_at": "2026-03-15T10:00:00Z",
  "author": "Alex",
  "title": "Red & Yellow Ferris Wheel",
  "description": "AI-generated, 1248 pieces",
  "ai_prompt": "tall Ferris wheel with red accents",
  "piece_count": 1248,
  "stability_score": 98
}

model.json

{
  "parts": [
    {
      "instance_id": "c1",
      "part_id": "connector-3way-yellow-v1",
      "position": [0, 0, 0],
      "quaternion": [0, 0, 0, 1],
      "color": null
    },
    ...
  ],
  "connections": [
    { "from": "c1.A", "to": "r1.end1" },
    ...
  ]
}

action_history.jsonl
One JSON action per line (exactly the format the LLM outputs). Enables perfect undo, replay, and “continue this build” feature.
Part Definition Format
See schema/knex-part.schema.json (already created)
Why This Design?

Tiny file size (connections are references, meshes are shared)
Fully Git-diffable when unzipped
Supports both embedded meshes and “use latest from library” references
Future-proof: add new fields without breaking old files
Easy import/export to Blender, STEP, or 3D printing

Fallback Formats

Export as .ldr (LDraw compatible for existing tools)
Export as folder of GLTF + JSON for collaboration

This format is the single source of truth for the entire application.
