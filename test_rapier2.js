const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');
RAPIER.init().then(() => {
  const g = RAPIER.JointData.generic({x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:1,z:0}, 1);
  console.log('generic:', Object.keys(g));
  console.log(g);
});
