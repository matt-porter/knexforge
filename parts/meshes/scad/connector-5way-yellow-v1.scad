// K'NEX Yellow 5-Way Connector (5 arms at 45° spacing, 180° total)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(5, 405);
