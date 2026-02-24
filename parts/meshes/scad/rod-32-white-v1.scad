// K'NEX White Rod – 32mm
include <lib/knex_lib.scad>
$fn = 48;

// Caliper: 7mm end caps, 19mm center section (total ~33mm)
// Centered at Z origin
translate([0, 0, -19/2])
fullRod(7, 19);
