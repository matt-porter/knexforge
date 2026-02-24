// K'NEX Red Rod – 128mm
include <lib/knex_lib.scad>
$fn = 48;

// Caliper: 129.9mm external, 113.5mm center section
// Centered at Z origin
translate([0, 0, -113.5/2])
fullRod2(129.9, 113.5);
