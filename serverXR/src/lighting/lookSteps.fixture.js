'use strict';
// Shared by lookSteps.test.js and its golden-frame generator: a throwaway rig of N RGB
// pixels (no network, no output) and a look running on it through the real Engine.
const { Engine, makeFixture } = require('./engine');
const { sanitizeLook, sanitizeLayer } = require('./looks');

function rig(n = 33) {
  return Array.from({ length: n }, (_, i) => {
    const f = makeFixture({ profile: 'rgb', address: 1 + i * 4, universe: 0, values: { r: 0, g: 0, b: 0, dimmer: 255 } });
    f.id = 'px' + i;
    f.x = i / Math.max(1, n - 1) * 1.0;
    f.y = 0.5;
    return f;
  });
}

// A deterministic look: `steps` steps, step i lights roles r/g/b from a fixed formula.
function makeLook(steps, extra = {}) {
  const list = [];
  for (let i = 0; i < steps; i++) {
    list.push({
      values: { '*': { r: (i * 37) % 256, g: (i * 91 + 20) % 256, b: (i * 13 + 200) % 256, dimmer: 255 } },
      width: 1 + (i % 3) * 0.5,
      transition: [1, 0.6, 0.25, 0][i % 4],
    });
  }
  return sanitizeLook({ id: 'lk', name: 'Golden', steps: list, measure: 4, phase: 360, ...extra });
}

// The shape a real pixel look has: every step carries a value for EVERY pixel (a 318-position
// ping-pong on 33 fixtures is 318 x 33 cells), which is what makes one look megabytes of JSON.
function makeHeavyLook(steps, n = 33, extra = {}) {
  const list = [];
  for (let i = 0; i < steps; i++) {
    const values = {};
    for (let p = 0; p < n; p++) {
      const on = (i % n) === p;
      values['px' + p] = { r: on ? 255 : 0, g: on ? (i * 7) % 256 : 0, b: on ? 255 - ((i * 5) % 256) : 0, dimmer: 255 };
    }
    list.push({ values, width: 1, transition: 1 });
  }
  return sanitizeLook({ id: 'heavy', name: 'Heavy', steps: list, measure: 16, ...extra });
}

function engineFor(look, n = 33) {
  const state = {
    master: 255, blackout: false, fixtures: rig(n), raw: {}, scenes: [], activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 },
    fx: { bpm: 120, epoch: 0 },
    looks: [look],
    layers: [sanitizeLayer({ id: 'l1', lookId: look.id, level: 1, on: true })],
  };
  return { engine: new Engine(state), state };
}

const frame = (engine, state, now) => Array.from(engine.render(state, now).get(0));

module.exports = { rig, makeLook, makeHeavyLook, engineFor, frame };
