// K'NEX Purple 4-Way 3D Connector (3 planar at 90° + 1 upward)
$fn = 72;

hub_r = 7.5;
hub_h = 6.0;
arm_w = 5.3;
arm_h = 6.0;
arm_len = 12.7;
hole_r = 2.65;
slot_w = 1.2;

module arm() {
    difference() {
        hull() {
            cylinder(h=arm_h, r=arm_w/2, center=true);
            translate([arm_len - hub_r, 0, 0])
                cylinder(h=arm_h, r=arm_w/2, center=true);
        }
        translate([arm_len, 0, 0])
            cylinder(h=arm_h+2, r=hole_r, center=true);
        translate([arm_len, 0, 0]) {
            translate([0, 0, arm_h/2])
                cube([slot_w, hole_r*2+1, 2], center=true);
            translate([0, 0, -arm_h/2])
                cube([slot_w, hole_r*2+1, 2], center=true);
        }
    }
}

module connector_4way_3d() {
    difference() {
        union() {
            cylinder(h=hub_h, r=hub_r, center=true);
            
            // 3 planar arms (N, E, S — no W arm, replaced by upward)
            for (a = [0, 90, 180]) {
                rotate([0, 0, a]) arm();
            }
            
            // Upward arm (along +Z)
            rotate([90, 0, 0])
                translate([0, 0, -hub_h/2])
                    difference() {
                        hull() {
                            cylinder(h=arm_h, r=arm_w/2, center=true);
                            translate([0, arm_len - hub_r, 0])
                                cylinder(h=arm_h, r=arm_w/2, center=true);
                        }
                        translate([0, arm_len, 0])
                            cylinder(h=arm_h+2, r=hole_r, center=true);
                    }
        }
        // Center axle hole
        cylinder(h=arm_len*2+4, r=hole_r, center=true);
    }
}

connector_4way_3d();
