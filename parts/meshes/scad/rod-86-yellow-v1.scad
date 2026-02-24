// K'NEX Yellow Rod – 86mm
include <lib/knex_lib.scad>
$fn = 48;

// Caliper: 85.5mm external, 69.2mm center section
// Centered at Z origin
translate([0, 0, -69.2/2])
fullRod2(85.5, 69.2);
