// K'NEX Green 4-Way Connector (4 arms at 45° spacing, 135° total)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(4, 405);
