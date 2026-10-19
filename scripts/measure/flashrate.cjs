// Worst flash rate per lamp of every fx.js mode (the desk's own engine, read-only), WCAG 2.x 'flash' = a pair of opposing
// changes >= 10 % of full; counted with 0.1 hysteresis on each lamp's multiplier, max over every 1 s window, 12 lamps.
// Usage: node scripts/measure/flashrate.cjs <fx.js>      (the desk's own engine, serverXR/src/lighting/fx.js: exports fxLevel(cfg, lamp, i, n, tMs) and FX_MODES)
// Venue-to-show skill: the palette step (flash safety). Moved from the MOXIR scenes-50 job (2026-10-15, ledger N811.2). Output: worst/mean flash pairs per second.
if (!process.argv[2] || process.argv[2] === '-h' || process.argv[2] === '--help') { console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(0, 4).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(process.argv[2] ? 0 : 2) }
const fx = require(require('path').resolve(process.argv[2]));
const N = 12, STEP = 25, T = 120000;
const lamps = Array.from({ length: N }, (_, i) => ({ x: -1 + 3 * i / (N - 1), y: 0.5 + 0.1 * (i % 3) }));
function worst(mode, bpm, depth, spatial) {
  const cfg = { mode, bpm, depth, spatial, enabled: true, epoch: 0 };
  let worst1 = 0, total = 0;
  for (let i = 0; i < N; i++) {
    let hi = null, lo = null, dir = 0; const tr = [];
    for (let t = 0; t < T; t += STEP) {
      const v = fx.fxLevel(cfg, lamps[i], i, N, t) / 255;
      if (hi === null) { hi = lo = v; continue; }
      hi = Math.max(hi, v); lo = Math.min(lo, v);
      if (dir !== -1 && hi - v >= 0.1) { tr.push(t); dir = -1; lo = v; }
      else if (dir !== 1 && v - lo >= 0.1) { tr.push(t); dir = 1; hi = v; }
    }
    total += tr.length;
    let a = 0; for (let b = 0; b < tr.length; b++) { while (tr[b] - tr[a] >= 1000) a++; worst1 = Math.max(worst1, b - a + 1); }
  }
  return { worst: Math.floor(worst1 / 2), mean: +(total / 2 / N / (T / 1000)).toFixed(2) };
}
const modes = fx.FX_MODES.filter((m) => m !== 'none');
const bpms = [20, 33, 66, 100, 132, 140];
console.log('mode      ' + bpms.map((b) => String(b).padStart(9)).join(''));
for (const m of modes) console.log(m.padEnd(10) + bpms.map((b) => { const r = worst(m, b, 255, 'x'); return `${r.worst}/${r.mean}`.padStart(9); }).join(''));
console.log('depth 128 (half swing):');
for (const m of ['sparkle', 'glitch', 'pump', 'bars', 'strobe']) console.log(m.padEnd(10) + bpms.map((b) => { const r = worst(m, b, 128, 'x'); return `${r.worst}/${r.mean}`.padStart(9); }).join(''));
