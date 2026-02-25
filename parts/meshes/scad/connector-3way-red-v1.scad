// K'NEX Red 3-Way 90° Connector
// Three arms at 0°, 45°, and 90° (45° arm spacing)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(3, 405);
