// K'Nex Parts Library — shared modules for all part SCADs
// Geometry derived from https://www.printables.com/model/143840-knex-parts-customizable
// Measurements in millimeters (digital calipers)

knexDiameter = 6.25;

// --- Rod modules ---

module RodEnd(height) {
    difference() {
        cylinder(h=height, d=knexDiameter, $fn=50);
        // Snap groove near the tip
        translate([0, 0, height - 3.1])
        scale([1, 1, 1.93])
        rotate_extrude(convexity=10, $fn=30)
        translate([3.125, 0, 0])
        scale([1, 1, 0])
        circle(r=0.905, $fn=20);
    }
}

module RodCenter(length) {
    // Cross-shaped center section (+ profile)
    intersection() {
        cylinder(h=length, d=knexDiameter, $fn=50);
        union() {
            translate([-.95, -knexDiameter/2, 0])
            cube([1.9, knexDiameter + 1, length]);
            translate([-knexDiameter/2, -.95, 0])
            cube([knexDiameter + 1, 1.9, length]);
        }
    }
}

module fullRod(endHeight, centerLength) {
    // Builds along Z: from -endHeight to centerLength+endHeight
    translate([0, 0, centerLength])
    RodEnd(endHeight);
    RodCenter(centerLength);
    mirror([0, 0, 1])
    RodEnd(endHeight);
}

module fullRod2(externalLength, internalLength) {
    // Convenience: specify overall and center-section lengths
    fullRod((externalLength - internalLength) / 2, internalLength);
}

// --- Connector modules ---

module ConnectorCenter(height, width) {
    difference() {
        cylinder(h=height, d=6.55 + width * 2, $fn=50);
        translate([0, 0, -0.5])
        cylinder(h=height + 1, d=6.55, $fn=50);
    }
}

module ConnectorEndpt(i, c, a, j) {
    union() {
        translate([0, 0, 9.4 - 1])
        cube([6.16, 9.35/2, 1]);
        cube([6.16, 1.2, 9.4]);
        translate([6.16/2, 1.23, 6.16 - 3.8/5])
        scale([1, 2.3, 3.4])
        rotate([0, 90, 0])
        cylinder(d=1, h=6.16, $fn=25, center=true);
        linear_extrude(height=6)
        difference() {
            polygon(points=[
                [0, 0], [6.16, 0], [6.16, 1.8],
                [6.16 - 1.46, 2.15], [1.46, 2.15], [0, 1.8]
            ]);
            translate([6.16/2, 9.35/2, 0])
            circle(d=6.25, $fn=90);
        }
    }
    if (i > 0) {
        if ((((i == c && j == 1) || (i == 1 && j == 2)) && c < 8) || a - 360 > 80) {
            // Straight locking tab (for end arms or wide-angle connectors)
            translate([0, 0, 9])
            cube([6.16, 1.4, 10]);
        }
        else {
            // Angled locking tab (for tight-angle connectors)
            translate([0, 0, 9.25])
            rotate([-45/2])
            cube([6.16, 1.4, 7]);
        }
    }
}

module ConnectorEnd(i=0, c=0, a=45) {
    translate([0, -9.35/2, 6.16])
    rotate([0, 90, 0])
    union() {
        ConnectorEndpt(i, c, a, 1);
        translate([0, 9.35, 0])
        mirror([0, 1, 0])
        ConnectorEndpt(i, c, a, 2);
    }
}

// Arm offset from center to ConnectorEnd origin
_arm_offset = -(23.15 - (6.5 + 1.4) / 2) + 0.5;

module Connector(c, a=45) {
    // c = number of arms, a = angle parameter (use 360+spacing for proper tab logic)
    // Effective arm spacing = a mod 360
    union() {
        ConnectorCenter(6.16, 1.4);
        for (i = [1:c]) {
            rotate([0, 0, (i-1) * a])
            translate([_arm_offset, 0, 0])
            ConnectorEnd(i, c, a);
        }
    }
}
