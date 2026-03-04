// K'NEX Grey 2-Way 45° Connector
// Two arms at 0° and 45° (45° arm spacing)
include <lib/knex_lib.scad>
$fn = 72;

translate([0, 0, -6.16/2])
rotate([0, 0, 180])
Connector(2, 405);
