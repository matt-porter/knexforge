$fn = 72;

wheel_r = 25;      // medium wheel radius ~50 mm diameter
thickness = 8;
hub_r = 4.5;
axle_hole_r = 2.65;

difference() {
  union() {
    // tire
    cylinder(h=thickness, r=wheel_r, center=true);
    // hub
    cylinder(h=thickness+2, r=hub_r, center=true);
  }
  // axle hole
  cylinder(h=thickness+4, r=axle_hole_r, center=true);
}
