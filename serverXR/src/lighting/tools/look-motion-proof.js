'use strict';
// LOOK MOTION PROOF - the wire's dimmer of one wash over 2 s, BEFORE (the look's one static step, what the desk played
// until 2026-10-17) and AFTER (the look's `motion` played by the desk, lookMotion.js), for three modes. Plain node, no
// server, no clock: the engine is rendered at exact milliseconds on the 40 Hz grid, so these are the frames the wire
// carries. Rises are counted over 128 (a flash), so the strobe line shows the cap (fx.js MAX_STROBE_HZ = 3).
//
//   node serverXR/src/lighting/tools/look-motion-proof.js [frames.json]
//
// One line per mode (distinct values, min..max, flashes a second) and, with a path, every frame as JSON.

const fs = require('fs');
const { Engine, makeFixture } = require('../engine');
const { sanitizeLook, sanitizeLayer } = require('../looks');

const FRAME_MS = 25;
const SECONDS = 2;
const FIRED = 1000;
const MODES = [
  { mode: 'breathe', bpm: 66, depth: 200 },
  { mode: 'strobe', bpm: 120, depth: 255 },
  { mode: 'pulse', bpm: 124, depth: 255 },
];

function wire(motion) {
  const f = makeFixture({ id: 'w1', profile: 'drgb', address: 1, universe: 0, values: { dimmer: 255, r: 255, g: 255, b: 255 } });
  const look = sanitizeLook({
    id: 'L', name: 'proof', steps: [{ values: { w1: { dimmer: 255 } } }], fixtures: ['w1'],
    ...(motion ? { motion: { ...motion, spatial: 'patch', kinds: ['wash'], still: 0, units: [{ id: 'w1', x: 0.5, y: 0.5 }] } } : {}),
  });
  const layer = sanitizeLayer({ id: 'c', lookId: 'L', level: 1, merge: 'ltp' });
  layer.firedAt = FIRED;
  const e = new Engine({
    master: 255, blackout: false, fixtures: [f], raw: {}, scenes: [], activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 }, looks: [look], layers: [layer],
    fx: { mode: 'none', enabled: false, bpm: 120, depth: 255, spatial: 'patch', exclude: [], epoch: 0 },
  });
  const frames = [];
  for (let ms = 0; ms <= SECONDS * 1000; ms += FRAME_MS) frames.push(e.render(e.state, FIRED + ms).get(0)[0]);
  return frames;
}

const rises = (v) => v.reduce((n, x, i) => n + (i > 0 && x > 128 && v[i - 1] <= 128 ? 1 : 0), 0);
const summary = (v) => `${String(new Set(v).size).padStart(2)} distinct, ${String(Math.min(...v)).padStart(3)}..${String(Math.max(...v)).padStart(3)}, ${(rises(v) / SECONDS).toFixed(1)} flashes/s`;

const out = {
  generated: new Date().toISOString(),
  fixture: 'w1, profile drgb at 0:1, the dimmer channel; look dimmer 255; layer fired at frame 0; master 255',
  frameMs: FRAME_MS, seconds: SECONDS, modes: {},
};
for (const m of MODES) {
  const before = wire(null);
  const after = wire(m);
  out.modes[m.mode] = { motion: m, before, after };
  console.log(`${m.mode.padEnd(8)} ${String(m.bpm).padStart(3)} bpm depth ${m.depth}   before: ${summary(before)}   after: ${summary(after)}`);
  console.log(`         after, one frame in four (every 100 ms): ${after.filter((_, i) => i % 4 === 0).join(' ')}`);
}
if (process.argv[2]) {
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`frames: ${process.argv[2]}`);
}
