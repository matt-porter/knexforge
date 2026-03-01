const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');

async function run() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const rodDesc1 = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0);
  const rodBody1 = world.createRigidBody(rodDesc1);
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,1,1).setDensity(1.0), rodBody1);

  const rodDesc2 = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const rodBody2 = world.createRigidBody(rodDesc2);
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,1,1).setDensity(1.0), rodBody2);

  const dummyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const dummyBody = world.createRigidBody(dummyDesc);
  // No collider for dummy!

  const fixedParams = RAPIER.JointData.fixed(
    {x: 5, y:0, z:0}, {w:1, x:0, y:0, z:0},
    {x: -5, y:0, z:0}, {w:1, x:0, y:0, z:0}
  );
  world.createImpulseJoint(fixedParams, rodBody1, dummyBody, true);

  const revoluteParams = RAPIER.JointData.revolute(
    {x: -5, y:0, z:0}, {x: -5, y:0, z:0}, {x: 0, y:1, z:0}
  );
  const revJoint = world.createImpulseJoint(revoluteParams, dummyBody, rodBody2, true);

  for (let i = 0; i < 60; i++) {
    world.step();
  }
  console.log("rod1 y:", rodBody1.translation().y);
  console.log("rod2 y:", rodBody2.translation().y);
}
run();
