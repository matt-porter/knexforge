// K'NEX Blue 7-Way 3D Connector (6 planar at 60° + 1 upward)
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

module connector_7way_3d() {
    difference() {
        union() {
            // Central hub (slightly taller to accommodate upward arm)
            cylinder(h=hub_h, r=hub_r, center=true);
            
            // 6 planar arms at 60° spacing
            for (a = [0, 60, 120, 180, 240, 300]) {
                rotate([0, 0, a]) arm();
            }
            
            // Upward arm
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
        // Center axle hole (through full height including upward arm)
        cylinder(h=arm_len*2+4, r=hole_r, center=true);
    }
}

connector_7way_3d();
