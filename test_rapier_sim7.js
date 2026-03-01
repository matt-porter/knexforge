const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');

async function run() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  
  const dummyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 0, 0);
  const dummyBody = world.createRigidBody(dummyDesc);
  
  console.log("dummy body mass without collider:", dummyBody.mass());
}
run();
