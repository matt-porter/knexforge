$fn = 72;

thickness = 6.2;
hub_r = 7.8;
arm_r = 4.25;
port_dist = 12.5;
hole_r = 2.65;

module connector_5way() {
  difference() {
    union() {
      cylinder(h=thickness, r=hub_r, center=true);
      for (a = [0, 72, 144, 216, 288]) {
        rotate([0,0,a])
          translate([port_dist/2, 0, 0])
            cylinder(h=thickness, r=arm_r, center=true);
      }
    }
    for (a = [0, 72, 144, 216, 288]) {
      rotate([0,0,a])
        translate([port_dist, 0, 0])
          cylinder(h=thickness+2, r=hole_r, center=true);
    }
  }
}

connector_5way();