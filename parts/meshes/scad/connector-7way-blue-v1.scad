// K'NEX Blue 7-Way 3D Connector
// 7 planar arms + 1 interlocking slot to combine two connectors
include <lib/knex_lib.scad>
$fn = 72;

_a = 405;  // 360+45 for tab logic

translate([0, 0, -6.16/2])
rotate([0, 0, 180]) // Globally flip so the first arm points right (+X)
difference() {
    union() {
        ConnectorCenter(6.16, 1.4);

        // 7 planar arms at 45° spacing (0°, 45°, 90°, 135°, 180°, 225°, 270°)
        for (i = [1:7]) {
            rotate([0, 0, (i-1) * 45])
            translate([_arm_offset, 0, 0])
            ConnectorEnd(i, 7, _a);
        }
    }
    
    // The interlocking slot at 315° (exactly in the middle of the empty space)
    // Cut from the center outwards to allow another connector to slide in.
    // Since there is a global 180 deg rotation, to make the slot point at 315 deg,
    // the cut here must be pointed at 135 deg (315 - 180).
    rotate([0, 0, 135])
    translate([0, -6.35/2, -1])
    cube([15, 6.35, 10]);
}
