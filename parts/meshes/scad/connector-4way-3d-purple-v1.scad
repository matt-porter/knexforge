// K'NEX Purple 4-Way 3D Connector (3 planar at 0°/90°/180° + 1 upward)
include <lib/knex_lib.scad>
$fn = 72;

_a = 450;  // 360+90 for tab logic

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
union() {
    ConnectorCenter(6.16, 1.4);

    // 3 planar arms at 0°, 90°, 180° (after 180° outer rotation)
    for (i = [1:3]) {
        rotate([0, 0, (i-1) * _a])
        translate([_arm_offset, 0, 0])
        ConnectorEnd(i, 3, _a);
    }

    // Upward arm along +Z: rotate so -X maps to +Z
    rotate([0, 90, 0])
    translate([_arm_offset, 0, 0])
    ConnectorEnd(0, 3, _a);
}
