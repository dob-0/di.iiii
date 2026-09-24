'use strict';
// Colour effects (studio, 2026-09-24). Until now every effect only moved BRIGHTNESS; with
// eight RGB lights the colour is what should move. Three modes, each travelling along
// Follow (which steps evenly through her arrangement — fx.js fxFindSlots):
//
//   hue    the look's colours turn round the colour wheel over `beats`, each light a little
//          further round than the one before it along Follow (`spread` of the wheel across
//          the rig)
//   chase  two colours, half the rig each, the boundary stepping along Follow every `beats`
//          (defaults to her pair red ↔ cyan; the page offers her four pairs)
//   swap   each light flips between its look colour and that colour's complement, on the
//          beat, neighbours in turn
//
// NO GREEN — her rule. The wheel here skips the green band: hue rotation travels the other
// 256° of it (cyan → blue → purple → pink → red → orange → yellow), and a complement that
// would land in green is moved to the nearest edge — which is how blue ↔ amber, purple ↔
// gold, red ↔ cyan and pink ↔ ice come out of it: her complementary pairs.
//
// Order in the engine (engine.js render): the look (+ LFOs) → the video blend (pixelmap.js)
// → colour effects (here) → brightness effects, objects and audio (level multipliers) →
// master and blackout. So a colour effect recolours whatever the look or the video put on a
// light, the brightness effects and objects still shape it, and Blackout still wins.
// Exempt, like the brightness effects: profiles in fx.exclude (the studio's DJ-place
// marker), lights held still with their own effect "none" (RGB 6/7 in the harsh scenes),
// and anything without red, green and blue.

const { fxPhase, fxBounds, fxOrder } = require('./fx');

const COLORFX_MODES = ['none', 'hue', 'chase', 'swap'];
const DEFAULT_COLORFX = { mode: 'none', beats: 4, spread: 0.5, amount: 255, a: '#ff0000', b: '#00d2ff' };

// The green band the wheel skips, in degrees: [GREEN_LO, GREEN_HI).
const GREEN_LO = 68, GREEN_HI = 172;
const ARC_LEN = 360 - (GREEN_HI - GREEN_LO);   // 256°: GREEN_HI round to GREEN_LO

const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);
function hex(v, d) {
  if (typeof v !== 'string') return d;
  const m = v.trim().toLowerCase().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (!m) return d;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return '#' + h;
}
function sanitizeColorFx(cur, patch) {
  const c = { ...DEFAULT_COLORFX, ...(cur || {}) };
  const p = patch || {};
  return {
    mode: COLORFX_MODES.includes(p.mode) ? p.mode : (COLORFX_MODES.includes(c.mode) ? c.mode : 'none'),
    beats: Math.round(num(p.beats, 1, 64, num(c.beats, 1, 64, 4))),
    spread: num(p.spread, 0, 1, num(c.spread, 0, 1, 0.5)),
    amount: Math.round(num(p.amount, 0, 255, num(c.amount, 0, 255, 255))),
    a: hex(p.a, hex(c.a, DEFAULT_COLORFX.a)),
    b: hex(p.b, hex(c.b, DEFAULT_COLORFX.b)),
  };
}
const colorFxActive = (c) => !!(c && c.mode && c.mode !== 'none' && (c.amount ?? 255) > 0);

// ---- colour maths ------------------------------------------------------------------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
const inGreen = (h) => h >= GREEN_LO && h < GREEN_HI;
// A hue's place on the green-free arc, 0..1 (a hue inside the band snaps to its nearer edge).
function arcPos(h) {
  if (inGreen(h)) return h - GREEN_LO < GREEN_HI - h ? 1 : 0;
  return (((h - GREEN_HI) % 360) + 360) % 360 / ARC_LEN;
}
const arcHue = (a) => (GREEN_HI + ARC_LEN * (((a % 1) + 1) % 1)) % 360;
// The complement, kept out of the green: land in the band and it goes to the nearer edge
// colour — amber below it, cyan above it.
function complementHue(h) {
  const c = (h + 180) % 360;
  if (!inGreen(c)) return c;
  return c - GREEN_LO < GREEN_HI - c ? 45 : 185;
}
const mix = (x, y, t) => x + (y - x) * t;
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

// ---- per frame ---------------------------------------------------------------------
const hasRgb = (profile) => profile.channels.includes('r') && profile.channels.includes('g') && profile.channels.includes('b');

// Once a frame: who the colour effect runs on, their order along Follow, and the clock.
// null when no colour effect is on — then nothing in the render changes at all.
function colorFxFrame(state, now, excluded, ownFx, profileOf) {
  const c = state.colorFx;
  if (!colorFxActive(c)) return null;
  const list = state.fixtures.filter((f) => hasRgb(profileOf(f)) && !excluded.has(f.profile) && ownFx(f) !== 'none');
  if (!list.length) return null;
  const bpm = Math.max(20, Math.min(300, ((state.fx && state.fx.bpm) | 0) || 120));
  const fxcfg = { spatial: (state.fx && state.fx.spatial) || 'patch' };
  const bounds = fxBounds(list);
  const order = fxOrder(list);
  const n = list.length;
  const raw = fxcfg.spatial, mode = raw.endsWith('-') ? raw.slice(0, -1) : raw;
  const slots = mode !== 'patch' && bounds && bounds.slots && bounds.slots[mode];
  const count = slots && slots.centres.length >= 2 ? slots.centres.length : n;
  // Each light's slot k (0..count-1) along Follow — the same evenly stepped order the
  // brightness effects use.
  const pos = new Map();
  for (const f of list) {
    const i = order.get(f.id) ?? 0;
    const p = fxPhase(fxcfg, f, i, n, bounds);
    pos.set(f.id, slots && slots.centres.length >= 2 ? Math.round(p * count) % count : Math.round(p * (n - 1)));
  }
  return { c, now, beatMs: 60000 / bpm, count, pos, a: hexRgb(c.a), b: hexRgb(c.b) };
}

// The colour a light shows under the effect, from the colour it would show without it.
function colorFxRgb(fr, id, rgb) {
  const k = fr.pos.get(id);
  if (k == null) return null;
  const { c, now, beatMs, count } = fr;
  const [r, g, bl] = rgb;
  if (c.mode === 'hue') {
    const [h, s, v] = rgbToHsv(r, g, bl);
    if (s < 0.04 || v <= 0) return rgb;                   // white and black have no hue to turn
    const cycle = c.beats * beatMs;
    const turn = now / cycle + (count > 1 ? (k / count) * c.spread : 0);
    return hsvToRgb(arcHue(arcPos(h) + turn), s, v);
  }
  if (c.mode === 'chase') {
    // Half the rig in each colour, the boundary stepping one slot per `beats`, with a short
    // blend at each step so it glides rather than jumps. The look's brightness is kept: a
    // dim ambient look chases dimly, a dark light stays dark.
    const v = Math.max(r, g, bl) / 255;
    const s = now / (c.beats * beatMs);
    const seg = Math.floor(s);
    const inA = (step) => ((((k - step) % count) + count) % count) < count / 2;
    const at = (step) => (inA(step) ? fr.a : fr.b);
    const w = smooth(0.8, 1, frac(s));
    const x = at(seg), y = at(seg + 1);
    return [0, 1, 2].map((i) => mix(x[i], y[i], w) * v);
  }
  if (c.mode === 'swap') {
    const [h, s, v] = rgbToHsv(r, g, bl);
    if (s < 0.04 || v <= 0) return rgb;
    const comp = hsvToRgb(complementHue(h), s, v);
    const t = now / (c.beats * beatMs) + (k % 2) * 0.5;   // neighbours take turns
    const w = smooth(0, 0.15, frac(t)) * (1 - smooth(0.5, 0.65, frac(t)));
    return [0, 1, 2].map((i) => mix(rgb[i], comp[i], w));
  }
  return rgb;
}

// The render hook: wraps the fixture's value reader so r, g and b come out coloured.
// Returns `val` itself when nothing applies, so an untouched light costs nothing.
function colorFxVal(fr, f, val) {
  if (!fr || !fr.pos.has(f.id)) return val;
  const look = [val('r') ?? 0, val('g') ?? 0, val('b') ?? 0];
  const out = colorFxRgb(fr, f.id, look);
  if (!out) return val;
  const amt = fr.c.amount / 255;
  const rgb = out.map((x, i) => mix(look[i], x, amt));
  return (role) => (role === 'r' ? rgb[0] : role === 'g' ? rgb[1] : role === 'b' ? rgb[2] : val(role));
}

// POST /api/colorfx — the live colour effect (merged over the current one, like /api/fx).
function colorFxRoutes({ state, save, pushFrame, json }) {
  return {
    'POST /api/colorfx': (req, res, body) => {
      state.colorFx = sanitizeColorFx(state.colorFx, body);
      state.activeScene = null;
      save(); pushFrame();
      json(res, { ok: true, colorFx: state.colorFx });
    },
  };
}

module.exports = {
  COLORFX_MODES, DEFAULT_COLORFX, sanitizeColorFx, colorFxActive,
  colorFxFrame, colorFxRgb, colorFxVal, colorFxRoutes,
  rgbToHsv, hsvToRgb, arcPos, arcHue, complementHue, inGreen, GREEN_LO, GREEN_HI,
};
