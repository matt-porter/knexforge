const RAPIER = require('./frontend/node_modules/@dimforge/rapier3d-compat');
RAPIER.init().then(() => {
  console.log(Object.keys(RAPIER.JointData));
});
