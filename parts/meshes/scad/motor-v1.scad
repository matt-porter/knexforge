// K'NEX Electric Motor Block
include <lib/knex_lib.scad>
$fn = 72;

module MotorBlock() {
    difference() {
        union() {
            // Main rectangular body
            color("#333333")
            translate([-20, -10, -15])
            cube([40, 20, 30]);
            
            // Mounting wings
            color("#222222") {
                translate([10, -10, -15]) cube([15, 20, 30]);
                translate([-25, -10, -15]) cube([15, 20, 30]);
            }
        }
        
        // Drive axle hole (rotational center)
        translate([0, 0, -20])
        cylinder(d=6.5, h=50);
        
        // Mounting holes (standard 12.7mm grid)
        translate([12.7, 0, -20])
        cylinder(d=6.25, h=50);
        
        translate([-12.7, 0, -20])
        cylinder(d=6.25, h=50);
    }
}

MotorBlock();
