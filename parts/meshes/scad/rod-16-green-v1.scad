// K'NEX Green Micro Rod – 16mm
$fn = 48;
length = 16;
rod_r = 2.5;
cap_r = 2.8;
cap_h = 1.5;

module knex_rod() {
    union() {
        // Main shaft
        cylinder(h=length - 2*cap_h, r=rod_r, center=false);
        
        // End caps (slightly wider nubs for snapping)
        translate([0, 0, -cap_h])
            cylinder(h=cap_h, r1=cap_r, r2=rod_r);
        translate([0, 0, length - cap_h])
            cylinder(h=cap_h, r1=rod_r, r2=cap_r);
    }
}

translate([0, 0, -length/2])
    knex_rod();
