// K'NEX White 8-Way Connector (45° spacing)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(8, 405);
