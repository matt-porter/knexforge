// K'NEX Blue Rod – 54mm
include <lib/knex_lib.scad>
$fn = 48;

// Caliper: 8.15mm end caps, 38.3mm center section (total ~54.6mm)
// Centered at Z origin
translate([0, 0, -38.3/2])
fullRod(8.15, 38.3);
