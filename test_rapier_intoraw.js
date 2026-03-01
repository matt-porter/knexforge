const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');
RAPIER.init().then(() => {
  const p = RAPIER.JointData.revolute({x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:1,z:0});
  console.log(p.intoRaw.toString());
});
