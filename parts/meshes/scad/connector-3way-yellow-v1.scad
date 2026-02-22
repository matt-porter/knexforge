$fn = 72;  // smooth curves

thickness = 6.2;
hub_r = 7.8;
arm_r = 4.25;
port_dist = 12.5;
hole_r = 2.65;  // 5.3 mm hole

module connector_3way() {
  difference() {
    union() {
      cylinder(h=thickness, r=hub_r, center=true);  // central hub
      
      // three arms at 120°
      for (a = [0, 120, 240]) {
        rotate([0,0,a])
          translate([port_dist/2, 0, 0])
            cylinder(h=thickness, r=arm_r, center=true);
      }
    }
    
    // rod holes
    for (a = [0, 120, 240]) {
      rotate([0,0,a])
        translate([port_dist, 0, 0])
          cylinder(h=thickness+2, r=hole_r, center=true);
    }
    
    // light central relief
    cylinder(h=thickness+2, r=2.5, center=true);
  }
}

connector_3way();