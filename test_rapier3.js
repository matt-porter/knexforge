const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');
RAPIER.init().then(() => {
  const fixed = RAPIER.JointData.fixed({x:0,y:0,z:0}, {w:1,x:0,y:0,z:0}, {x:0,y:0,z:0}, {w:1,x:0,y:0,z:0});
  const raw = fixed.intoRaw();
  console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(raw)));
});
