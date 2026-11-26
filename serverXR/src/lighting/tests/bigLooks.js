'use strict';
// Synthetic big looks for measuring and testing the state reply. The live desk's looks are show data and never
// committed; this makes the same SHAPE: n looks, each `steps` steps (64 is the desk's cap), each step setting
// `fixtures` lights. 80 looks x 64 steps x 205 lights is ~670 kB a look, as measured on the live desk (median 673 kB).
function makeBigLooks(n = 80, { steps = 64, fixtures = 205, tag = 'big' } = {}) {
  const ids = Array.from({ length: fixtures }, (_, i) => 'fx' + (i + 1).toString(36).padStart(8, '0') + i);
  const looks = [];
  for (let k = 0; k < n; k++) {
    const st = [];
    for (let s = 0; s < steps; s++) {
      const values = {};
      for (let f = 0; f < fixtures; f++) values[ids[f]] = { dimmer: (k + s + f) % 256, r: (s * 7 + f) % 256, g: (k * 3 + f) % 256, b: (s + k) % 256 };
      st.push({ values, width: 1, transition: 0.5 });
    }
    looks.push({ id: `${tag}-${k}`, name: `${tag} look ${k}`, kind: 'all', fixtures: ids.slice(), steps: st });
  }
  return looks;
}
module.exports = { makeBigLooks };
