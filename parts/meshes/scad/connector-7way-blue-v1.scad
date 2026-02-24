// K'NEX Blue 7-Way 3D Connector (6 planar at 60° + 1 upward)
include <lib/knex_lib.scad>
$fn = 72;

_a = 420;  // 360+60 for tab logic

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
union() {
    ConnectorCenter(6.16, 1.4);

    // 6 planar arms at 60° spacing (after 180° outer rotation)
    for (i = [1:6]) {
        rotate([0, 0, (i-1) * _a])
        translate([_arm_offset, 0, 0])
        ConnectorEnd(i, 6, _a);
    }

    // Upward arm along +Z: rotate so -X maps to +Z
    rotate([0, 90, 0])
    translate([_arm_offset, 0, 0])
    ConnectorEnd(0, 6, _a);
}
