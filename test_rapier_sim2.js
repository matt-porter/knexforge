const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');

async function run() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });

  const motorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const motorBody = world.createRigidBody(motorDesc);

  const rodDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const rodBody = world.createRigidBody(rodDesc);

  const dummyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const dummyBody = world.createRigidBody(dummyDesc);
  // Give them good mass
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.1,0.1,0.1).setDensity(100.0), dummyBody);
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,1,1).setDensity(1.0), rodBody);

  const fixedParams = RAPIER.JointData.fixed(
    {x: 5, y:0, z:0}, {w:1, x:0, y:0, z:0},
    {x: -5, y:0, z:0}, {w:1, x:0, y:0, z:0}
  );
  world.createImpulseJoint(fixedParams, motorBody, dummyBody, true);

  const revoluteParams = RAPIER.JointData.revolute(
    {x: -5, y:0, z:0}, {x: -5, y:0, z:0}, {x: 0, y:1, z:0}
  );
  const revJoint = world.createImpulseJoint(revoluteParams, dummyBody, rodBody, true);
  revJoint.configureMotorVelocity(10.0, 0.5);

  for (let i = 0; i < 60; i++) {
    world.step();
  }
  console.log("rod rotation after 60 steps:", rodBody.rotation());
}
run();
