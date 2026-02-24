// K'NEX Grey Rod – 190mm
include <lib/knex_lib.scad>
$fn = 48;

// Caliper: 8.15mm end caps, 192mm center section (total ~208mm)
// Centered at Z origin
translate([0, 0, -192/2])
fullRod(8.15, 192);
