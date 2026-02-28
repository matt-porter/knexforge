# K'NexForge Build Export Format

## Overview

The `.knx` file format is a portable, versioned JSON-based format for saving and loading K'Nex builds. It consists of two main components:

1. **Manifest** - Metadata about the build (title, author, piece count, etc.)
2. **Model** - The actual build data (parts positions/rotations, connections)

## File Structure

A `.knx` file is a ZIP archive containing:

```
build.knx (ZIP)
├── manifest.json    # Build metadata
├── model.json       # Parts and connections data
└── action_history.jsonl  # Optional: build history (JSONL format)
```

## Manifest Schema

```json
{
  "format_version": "1.0",
  "app_version": "0.1.0",
  "created_at": "2026-02-28T22:00:00Z",
  "author": "",
  "title": "",
  "description": "",
  "ai_prompt": null,
  "piece_count": 15,
  "stability_score": 95.3
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `format_version` | string | Schema version (currently "1.0") |
| `app_version` | string | K'NexForge app version that created the file |
| `created_at` | ISO 8601 datetime | When the build was saved |
| `author` | string | Optional author name |
| `title` | string | Optional build title |
| `description` | string | Optional description |
| `ai_prompt` | string \| null | Optional AI prompt used to generate |
| `piece_count` | integer | Number of parts in the build |
| `stability_score` | float | Physics stability score (0-100) |

## Model Schema

```json
{
  "parts": [
    {
      "instance_id": "c1",
      "part_id": "connector-4way-green-v1",
      "position": [0.0, 0.0, 0.0],
      "quaternion": [0.0, 0.0, 0.0, 1.0],
      "color": "#FF0000"
    },
    {
      "instance_id": "r1",
      "part_id": "rod-128-red-v1",
      "position": [0.0, 64.0, 0.0],
      "quaternion": [0.0, 0.0, 0.707, 0.707]
    }
  ],
  "connections": [
    {
      "from": "r1.end1",
      "to": "c1.A",
      "joint_type": "fixed"
    }
  ]
}
```

### Parts Array

Each part entry contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instance_id` | string | Yes | Unique identifier for this instance |
| `part_id` | string | Yes | Reference to part definition in library |
| `position` | [x, y, z] | Yes | 3D position in millimeters |
| `quaternion` | [x, y, z, w] | Yes | Rotation as quaternion (normalized) |
| `color` | string | No | Optional hex color override (#RRGGBB) |

### Connections Array

Each connection entry contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Source port in format `{instance_id}.{port_name}` |
| `to` | string | Yes | Target port in format `{instance_id}.{port_name}` |
| `joint_type` | string | No | Connection type: "fixed", "revolute", etc. (default: "fixed") |

## Version History

### v1.0 (Current)

- Initial release of portable build format
- Supports all part types and connection types
- Includes optional action history for undo/redo persistence

## Migration Guide

### From Legacy Formats

If you have builds from older formats, use the following migration steps:

1. Parse legacy JSON structure
2. Convert positions to millimeters (if in different units)
3. Normalize quaternions
4. Map old connection types to current joint_type values
5. Generate new manifest with `format_version: "1.0"`

## Validation Rules

When loading a `.knx` file, the following validations are performed:

1. **Structure validation**: Must have both `manifest` and `model` keys
2. **Part ID validation**: All `part_id` values must exist in the part library
3. **Position validation**: Positions must be 3-element arrays of numbers
4. **Quaternion validation**: Quaternions must be 4-element arrays, normalized
5. **Connection validation**: Both `from` and `to` ports must reference existing parts

## Example: Complete .knx File

```json
{
  "manifest": {
    "format_version": "1.0",
    "app_version": "0.1.0",
    "created_at": "2026-02-28T22:30:00Z",
    "author": "Alice Builder",
    "title": "Simple Tower",
    "description": "A 5-part tower structure",
    "piece_count": 5,
    "stability_score": 92.5
  },
  "model": {
    "parts": [
      {"instance_id": "c1", "part_id": "connector-4way-green-v1", "position": [0, 0, 0], "quaternion": [0, 0, 0, 1]},
      {"instance_id": "r1", "part_id": "rod-64-blue-v1", "position": [0, 32, 0], "quaternion": [0, 0, 0, 1]},
      {"instance_id": "c2", "part_id": "connector-4way-green-v1", "position": [0, 64, 0], "quaternion": [0, 0, 0, 1]},
      {"instance_id": "r2", "part_id": "rod-64-blue-v1", "position": [32, 96, 0], "quaternion": [0.707, 0, 0, 0.707]},
      {"instance_id": "c3", "part_id": "connector-4way-green-v1", "position": [64, 96, 0], "quaternion": [0, 0, 0, 1]}
    ],
    "connections": [
      {"from": "r1.end1", "to": "c1.A", "joint_type": "fixed"},
      {"from": "r1.end2", "to": "c2.A", "joint_type": "fixed"},
      {"from": "r2.end1", "to": "c2.B", "joint_type": "fixed"},
      {"from": "r2.end2", "to": "c3.A", "joint_type": "fixed"}
    ]
  }
}
```

## API Usage

### Export (Python)

```python
from core.file_io import export_build, save_knx
from core.build import Build

# Export to dict
exported = export_build(build)

# Save to .knx file
save_knx(build, Path("my-build.knx"))
```

### Import (Python)

```python
from core.file_io import load_knx

build, manifest = load_knx(Path("my-build.knx"))
print(f"Loaded {manifest.piece_count} pieces")
```

### Export (Frontend TypeScript)

```typescript
import { sidecarBridge } from './services/sidecarBridge'

const result = await sidecarBridge.exportBuild(partsList, connections)
if (result.success && result.data) {
  await sidecarBridge.saveKnxFile(result.data, 'my-build.knx')
}
```

### Import (Frontend TypeScript)

```typescript
import { sidecarBridge } from './services/sidecarBridge'

const fileResult = await sidecarBridge.loadKnxFile(file)
if (fileResult.success && fileResult.data) {
  const loadResult = await sidecarBridge.loadBuild(fileResult.data)
  if (loadResult) {
    // Update build store with imported data
    useBuildStore.getState().loadBuild(parts, connections)
  }
}
```
