// K'NEX Blue 5-Way Connector (72°)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(5, 432);
