# K'Nex Compact Topology Format

The compact format (`.knx`) is used to describe the parts and connections of a K'Nex model.

## Syntax

### Part Declaration
`part <instance_id> <part_id>`
Example: `part base_mount connector-2way-orange-v1`

### Connection (Fixed)
`<instance1>.<port1> -- <instance2>.<port2>`
Example: `r1.end1 -- base_mount.center`

### Connection (Revolute/Spinning)
`<instance1>.<port1> ~~ <instance2>.<port2>`
Example: `motor.drive_axle ~~ r1.end1`

### Rotation/Orientation
`orient <roll> <pitch> <yaw>`
Example: `orient 0 90 0`

## Common Parts

### Rods
- `rod-16-green-v1` (Tiny)
- `rod-32-white-v1` (Small)
- `rod-54-blue-v1` (Medium)
- `rod-86-yellow-v1` (Large)
- `rod-128-red-v1` (Extra Large)
- `rod-190-grey-v1` (Jumbo)

### Connectors
- `connector-2way-orange-v1`
- `connector-3way-red-v1`
- `connector-5way-yellow-v1`
- `connector-8way-white-v1`
- `connector-4way-3d-purple-v1`

### Specialty
- `motor-v1` (Has `drive_axle`, `mount_1`, `mount_2`, `mount_3`, `mount_4`)
- `wheel-medium-black-v1`
