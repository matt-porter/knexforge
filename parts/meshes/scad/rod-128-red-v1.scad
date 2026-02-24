// K'NEX Red Rod – 128mm
$fn = 48;
length = 128;
rod_r = 2.5;
cap_r = 2.8;
cap_h = 1.5;

module knex_rod() {
    union() {
        cylinder(h=length - 2*cap_h, r=rod_r, center=false);
        translate([0, 0, -cap_h])
            cylinder(h=cap_h, r1=cap_r, r2=rod_r);
        translate([0, 0, length - cap_h])
            cylinder(h=cap_h, r1=rod_r, r2=cap_r);
    }
}

translate([0, 0, -length/2])
    knex_rod();
