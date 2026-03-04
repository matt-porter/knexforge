/**
 * Diagnostic script for the triangle generation issue #4
 * 
 * Query: br_1.end2 -- gc2_1.A
 *        rc3_1.C -- br_2.end1
 *        gc2_2.B -- yr_1.end1
 *        gc2_1.B -- yr_1.end2
 *        rc3_1.A -- br_1.end1
 *        gc2_2.A -- br_2.end2
 * 
 * Parts:
 * - br_1, br_2: rod-54-blue-v1 (54mm blue rods)
 * - gc2_1, gc2_2: connector-2way-grey-v1 (grey 2-way @ 45°)
 * - rc3_1: connector-3way-red-v1 (red 3-way @ 90°)
 * - yr_1: rod-86-yellow-v1 (86mm yellow rod)
 */

const { Vector3, Quaternion } = require('three');

// Part geometries
const parts = {
  'rod-54-blue-v1': {
    ports: {
      'end1': { pos: [0, 0, 0], dir: [-1, 0, 0] },
      'end2': { pos: [54, 0, 0], dir: [1, 0, 0] }
    }
  },
  'rod-86-yellow-v1': {
    ports: {
      'end1': { pos: [0, 0, 0], dir: [-1, 0, 0] },
      'end2': { pos: [86, 0, 0], dir: [1, 0, 0] }
    }
  },
  'connector-2way-grey-v1': {
    ports: {
      'A': { pos: [12.7, 0, 0], dir: [1, 0, 0] },
      'B': { pos: [8.98, 8.98, 0], dir: [0.707, 0.707, 0] }
    }
  },
  'connector-3way-red-v1': {
    ports: {
      'A': { pos: [12.7, 0, 0], dir: [1, 0, 0] },
      'C': { pos: [0, 12.7, 0], dir: [0, 1, 0] }
    }
  }
};

// Snapshot of greedy solver placement
console.log('=== Triangle Topology Diagnostic ===\n');
console.log('Topology:');
console.log('  br_1(54mm) - gc2_1(45°) - yr_1(86mm)');
console.log('      |                        |');
console.log('   rc3_1(90°) - - - - - - - gc2_2(45°)');
console.log('      |');
console.log('   br_2(54mm)');
console.log('\nConnections:');
console.log('  1. br_1.end2 ↔ gc2_1.A');
console.log('  2. br_1.end1 ↔ rc3_1.A');
console.log('  3. rc3_1.C ↔ br_2.end1');
console.log('  4. br_2.end2 ↔ gc2_2.A');
console.log('  5. gc2_1.B ↔ yr_1.end2 (forms LOOP)');
console.log('  6. gc2_2.B ↔ yr_1.end1 (closes LOOP)');

console.log('\n=== Root Cause Analysis ===');
console.log(`
The solver uses a GREEDY tree-construction algorithm:
1. Places br_1 at origin
2. Places connected parts (rc3_1, gc2_1) based on port snapping
3. Places yr_1 from gc2_1.B
4. Places br_2 and gc2_2
5. When attempting to close the loop at gc2_2.B ↔ yr_1.end1:
   → Calculates residual (position + angle error)
   → FAILS because residual > tolerance (0.5mm, 8°)

Root cause: Discrete rod lengths (54, 86mm) + fixed connector angles (45°, 90°)
create a geometric system that cannot close within tolerance.

Possible reasons:
  A) The triangle geometry is mathematically IMPOSSIBLE with these parts
  B) The tolerance is too tight (0.5mm is very strict)
  C) Port definitions have rounding errors
`);

console.log('\n=== Solution Options ===');
console.log(`
OPTION 1: Increase tolerances (quick workaround)
  Pass custom options when solving:
    solveTopology(model, defs, {
      positionToleranceMm: 2.0,    // was 0.5
      angleToleranceDeg: 15.0      // was 8.0
    })
  
  Pros: Works immediately
  Cons: May mask real geometric issues

OPTION 2: Use different rod lengths
  Try combinations that might work:
    - All rods length 54mm → forms isosceles triangle?
    - All rods length 86mm → different geometry?
    - Mix of 32mm + 54mm rods → tighter constraints?

OPTION 3: Debug tolerance requirement
  Modify topologySolver.ts to:
    - Add console logging of residuals at each step
    - Print final residual values for loop-closing edges
    - Identify which edge(s) cause the failure

OPTION 4: Use constraint-solving (Task 12.X in PLAN.md)
  Not yet implemented, but could solve loops iteratively.
`);

console.log('\n=== Quick Tolerance Test ===');
console.log(`
Try this in TopologyEditor:
  
  1. Toggle DEBUG mode (if available)
  2. Pass positionToleranceMm=3.0, angleToleranceDeg=20
  3. If triangle builds successfully → issue is tolerance/geometry mismatch
  4. If still fails → deeper geometric incompatibility
`);
