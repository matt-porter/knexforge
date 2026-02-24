// K'NEX Red 2-Way 90° Connector
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

module connector_2way_90() {
    difference() {
        union() {
            cylinder(h=hub_h, r=hub_r, center=true);
            arm();
            rotate([0, 0, 90]) arm();
        }
        cylinder(h=hub_h+2, r=hole_r, center=true);
    }
}

connector_2way_90();
