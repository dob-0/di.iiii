// GENERATED from serverXR/src/lighting/waves.js by scripts/laser/waves-twin.mjs — edit the source, then run it.
// THE WAVES — one cycle of every LFO shape di draws, shared by the light desk (lfo.js) and the
// Nodes Oscillator (src/project/nodes/signal.lfo). One source: the browser runs a GENERATED
// ESM twin of this file (src/shared/waves.js, by scripts/laser/waves-twin.mjs), never a copy.
//
// It lives inside lighting/ rather than in the repo's shared/ because this directory runs on
// its own on the club machine (standalone.js) and must not reach outside itself; so this file
// requires nothing at all.
//
// Nothing here reads the clock. A wave is a function of `total`, the number of cycles since the
// wave's start (a fraction is how far into the current one), so a value can be asserted at an
// exact millisecond in a test.

const TAU = Math.PI * 2;

// sine · tri · saw · square are the desk's four smooth/edged shapes. random holds one value per
// cycle (the desk's 'random', and what a synth calls sample & hold of noise); 'hold' is its
// other name. glide walks from one cycle's random value to the next. pulse is high for the
// first tenth of a cycle.
const WAVES = ['sine', 'tri', 'saw', 'square', 'pulse', 'random', 'hold', 'glide'];
// The Oscillator's words for the same shapes (TouchDesigner's LFO CHOP says triangle and ramp).
const WAVE_ALIASES = { triangle: 'tri', ramp: 'saw' };
const PULSE_WIDTH = 0.1;

// The firmware's 32-bit mixer, kept rather than Math.random because a random-looking wave has
// to be reproducible: the same millisecond gives the same value every time, which is the only
// reason it can be tested at all. `>>> 0` after every step keeps it 32-bit; without it
// Math.imul's sign leaks into the next shift.
function waveHash(x) {
  let h = x >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// Deterministic per-wave seed so two random waves at the same tempo do not flicker in
// lockstep, and the same wave gives the same flicker at the same millisecond every time.
function seedOf(id) {
  let h = 0x9dc5;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// One random value 0..1 per whole cycle number.
function slotValue(slot, seed) {
  return (waveHash(((slot >>> 0) ^ (seed >>> 0)) >>> 0) & 0xff) / 255;
}

// Bias -1..1 leans the cycle: the half-way point (a sine's top, a triangle's peak, a square's
// falling edge) moves from 0.5 to (1 + bias) / 2. -1 and 1 turn a triangle into a falling and a
// rising ramp; on a square it is the duty. 0 returns p untouched, so an unbiased wave is the
// unbiased wave to the last bit.
function biasCycle(p, bias) {
  const b = +bias;
  if (!b || !Number.isFinite(b)) return p;
  const d = (1 + Math.max(-1, Math.min(1, b))) / 2;
  if (d <= 0) return 0.5 + p / 2;
  if (d >= 1) return p / 2;
  return p < d ? (p / d) / 2 : 0.5 + ((p - d) / (1 - d)) / 2;
}

// The wave's value 0..1 at `total` cycles. Unknown names draw a sine (the desk's rule).
function waveUnit(wave, total, seed, bias) {
  const name = WAVE_ALIASES[wave] || wave;
  if (name === 'random' || name === 'hold') return slotValue(Math.floor(total), seed);
  const raw = total - Math.floor(total);
  if (name === 'glide') {
    const slot = Math.floor(total);
    const a = slotValue(slot, seed);
    return a + (slotValue(slot + 1, seed) - a) * raw;
  }
  const p = biasCycle(raw, bias);
  if (name === 'square') return p < 0.5 ? 1 : 0;
  if (name === 'pulse') return p < PULSE_WIDTH ? 1 : 0;
  if (name === 'tri') return p < 0.5 ? p * 2 : 2 - p * 2;
  if (name === 'saw') return p;
  // sine starts at 0.5: a bipolar pan/tilt LFO switched on mid-show departs FROM the
  // scene position instead of snapping a full depth sideways on the first frame.
  return (Math.sin(TAU * p) + 1) / 2;
}

export {
  WAVES, WAVE_ALIASES, PULSE_WIDTH,
  waveHash, seedOf, biasCycle, waveUnit,
};
