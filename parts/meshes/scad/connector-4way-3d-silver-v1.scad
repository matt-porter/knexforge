$fn = 72;

thickness = 6.2;
hub_r = 7.8;
arm_r = 4.25;
port_dist = 12.5;
hole_r = 2.65;

module connector_4way_3d() {
  difference() {
    union() {
      cylinder(h=thickness, r=hub_r, center=true);
      
      // four planar arms
      for (a = [0,90,180,270]) {
        rotate([0,0,a])
          translate([port_dist/2, 0, 0])
            cylinder(h=thickness, r=arm_r, center=true);
      }
      
      // upward arm (3D)
      translate([0, 0, port_dist/2])
        rotate([90,0,0])
          cylinder(h=thickness, r=arm_r, center=true);
    }
    
    // holes
    for (a = [0,90,180,270]) {
      rotate([0,0,a])
        translate([port_dist, 0, 0])
          cylinder(h=thickness+2, r=hole_r, center=true);
    }
    translate([0, 0, port_dist])
      rotate([90,0,0])
        cylinder(h=thickness+2, r=hole_r, center=true);
  }
}

connector_4way_3d();