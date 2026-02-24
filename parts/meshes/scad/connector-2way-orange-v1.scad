// K'NEX Orange 2-Way Straight Connector (180°)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(2, 540);
