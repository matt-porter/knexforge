const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');

async function run() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });

  const motorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const motorBody = world.createRigidBody(motorDesc);

  const rodDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const rodBody = world.createRigidBody(rodDesc);

  const dummyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0);
  const dummyBody = world.createRigidBody(dummyDesc);
  
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 0.1, 0.1).setDensity(187.5), dummyBody);
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,1,1).setDensity(0.0375), rodBody);

  // fixed: rodBody -> dummyBody
  const fixedParams = RAPIER.JointData.fixed(
    {x: -10, y:0, z:0}, {w:1, x:0, y:0, z:0},
    {x: 0, y:0, z:0}, {w:1, x:0, y:0, z:0}
  );
  world.createImpulseJoint(fixedParams, rodBody, dummyBody, true);

  // revolute: dummyBody -> motorBody
  const revoluteParams = RAPIER.JointData.revolute(
    {x: 0, y:0, z:0}, {x: 0, y:0, z:0}, {x: 0, y:1, z:0}
  );
  const revJoint = world.createImpulseJoint(revoluteParams, dummyBody, motorBody, true);
  
  revJoint.configureMotorVelocity(10.0, 1e6);

  for (let i = 0; i < 60; i++) {
    world.step();
  }
  console.log("rod rotation after 60 steps with factor 1e6:", rodBody.rotation());
}
run();