'use strict';
// Video pixel-mapping (from the studio desk, viz.di.formal branch studio, 2026-09-24 — her
// ask: "put the video signal in the preview, and whatever fixture is on that part lights as
// pixels, how it is in Resolume"). Ported to di.iiii's light desk 2026-11-06.
//
// The browser owns the video — an NDI source through di.iiii's own receiver (/ndi/in.mjpg,
// serverXR/src/ndi — or NDI Tools' "NDI Webcam" where no runtime is installed), a Resolume
// window captured with getDisplayMedia, a camera or a file — because that is where the
// capture APIs are, and it keeps this desk free of native dependencies. The page samples
// the picture under each light and posts the colours here ~30 times a second. This file
// holds the two halves the server owns:
//
//   state.video   where the picture sits on the stage and how strongly it wins over the
//                 look — saved in show.json like any other setting.
//   state.pixels  the latest colours, LIVE ONLY: non-enumerable on `state`, exactly like
//                 the audio levels, so they never reach show.json or a scene.
//
// The colours are freshness-gated like audio: when the page stops sending for more than a
// second (tab closed, source ended, laptop asleep) the layer is simply off and every light
// is back on its look. Nothing latches.

const { animRaw } = require('./ui/objcore');   // [anim] one cycle maths with the stage objects

const STALE_MS = 1000;
// Where the picture may sit: anywhere a fixture may (desk.js WORLD).
const WORLD = 1000;

// x, y, w, h are stage-world units, the same space as fixture x/y. w = 0 means "never
// placed" — the page fits the picture over the rig the first time a source starts.
// mix is 0..255 (0 = the look, 255 = the video). sample is the side of the square each
// light averages, as a percent of the picture's width.
// [anim] (2026-09-24, her ask: "more control on the objects and videos")
//   anim   the box travels from A (x, y) to B (bx, by — the top-left of the box at B) and
//          scales to bscale on the way; the same cycle as the stage objects (objcore.js):
//          timing beats|secs, dir, ease, phase, loop, paused/hold, t0
//   lfo    the mix breathes: down by `depth` and back, once every cycle
//   bright, contrast   applied by the page to the sampled colours
//   speed, loopIn, loopOut   file playback, applied by the page
const DIRS = ['forward', 'reverse', 'pingpong'];
const EASES = ['linear', 'smooth', 'bounce'];
const TIMINGS = ['beats', 'secs'];
const DEFAULT_ANIM = { on: false, bx: 0, by: 0, bscale: 1, timing: 'beats', beats: 8, secs: 4, dir: 'pingpong', ease: 'smooth', phase: 0, loop: true, paused: false, hold: 0, t0: 0 };
const DEFAULT_LFO = { on: false, timing: 'beats', beats: 8, secs: 4, depth: 0.5 };
const DEFAULT_VIDEO = {
  x: 0, y: 0, w: 0, h: 0, mix: 255, sample: 6, on: false,
  speed: 1, loopIn: 0, loopOut: 0, bright: 0, contrast: 100, anim: DEFAULT_ANIM, lfo: DEFAULT_LFO,
};

const num = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : dflt);

// `patch` is merged over `cur`: absent fields keep their current value, the same contract
// as the FX route, so dragging the picture cannot reset the mix.
// [anim] The box's animation and the mix's breathing: `patch` over `cur`, field by field.
function sanitizeAnim(cur, patch) {
  const c = { ...DEFAULT_ANIM, ...(cur && typeof cur === 'object' ? cur : {}) };
  const p = patch && typeof patch === 'object' ? patch : {};
  const pick = (k, lo, hi) => num(p[k], lo, hi, num(c[k], lo, hi, DEFAULT_ANIM[k]));
  return {
    on: p.on != null ? !!p.on : !!c.on,
    bx: pick('bx', -WORLD, WORLD), by: pick('by', -WORLD, WORLD), bscale: pick('bscale', 0.1, 5),
    timing: TIMINGS.includes(p.timing) ? p.timing : (TIMINGS.includes(c.timing) ? c.timing : 'beats'),
    beats: Math.round(pick('beats', 0, 64)), secs: Math.round(pick('secs', 0, 600) * 10) / 10,
    dir: DIRS.includes(p.dir) ? p.dir : (DIRS.includes(c.dir) ? c.dir : 'pingpong'),
    ease: EASES.includes(p.ease) ? p.ease : (EASES.includes(c.ease) ? c.ease : 'smooth'),
    phase: pick('phase', 0, 1),
    loop: p.loop != null ? p.loop !== false : c.loop !== false,
    paused: p.paused != null ? p.paused === true : c.paused === true,
    hold: pick('hold', 0, 1), t0: pick('t0', 0, 1e13),
  };
}
function sanitizeLfo(cur, patch) {
  const c = { ...DEFAULT_LFO, ...(cur && typeof cur === 'object' ? cur : {}) };
  const p = patch && typeof patch === 'object' ? patch : {};
  const pick = (k, lo, hi) => num(p[k], lo, hi, num(c[k], lo, hi, DEFAULT_LFO[k]));
  return {
    on: p.on != null ? !!p.on : !!c.on,
    timing: TIMINGS.includes(p.timing) ? p.timing : (TIMINGS.includes(c.timing) ? c.timing : 'beats'),
    beats: Math.round(pick('beats', 0, 64)), secs: Math.round(pick('secs', 0, 600) * 10) / 10,
    depth: pick('depth', 0, 1),
  };
}

function sanitizeVideo(cur, patch) {
  const c = { ...DEFAULT_VIDEO, ...(cur || {}) };
  const p = patch || {};
  return {
    x: num(p.x, -WORLD, WORLD, num(c.x, -WORLD, WORLD, 0)),
    y: num(p.y, -WORLD, WORLD, num(c.y, -WORLD, WORLD, 0)),
    w: num(p.w, 0, 2 * WORLD, num(c.w, 0, 2 * WORLD, 0)),
    h: num(p.h, 0, 2 * WORLD, num(c.h, 0, 2 * WORLD, 0)),
    mix: Math.round(num(p.mix, 0, 255, num(c.mix, 0, 255, 255))),
    sample: Math.round(num(p.sample, 1, 30, num(c.sample, 1, 30, 6))),
    on: p.on != null ? !!p.on : !!c.on,
    speed: Math.round(num(p.speed, 0.1, 4, num(c.speed, 0.1, 4, 1)) * 100) / 100,
    loopIn: num(p.loopIn, 0, 86400, num(c.loopIn, 0, 86400, 0)),
    loopOut: num(p.loopOut, 0, 86400, num(c.loopOut, 0, 86400, 0)),
    bright: Math.round(num(p.bright, -100, 100, num(c.bright, -100, 100, 0))),
    contrast: Math.round(num(p.contrast, 0, 300, num(c.contrast, 0, 300, 100))),
    anim: sanitizeAnim(c.anim, p.anim),
    lfo: sanitizeLfo(c.lfo, p.lfo),
  };
}

// [anim] The mix right now: the saved mix, breathing down by the LFO's depth and back once a
// cycle (a raised cosine — it rests at the full mix, never snaps). Server-side, so every
// screen and the wire agree.
function mixNow(state, now = Date.now()) {
  const v = state.video;
  if (!v) return 0;
  const l = v.lfo;
  if (!l || !l.on || !(l.depth > 0)) return v.mix;
  const raw = animRaw({ timing: l.timing, beats: l.beats, secs: l.secs }, state.fx && state.fx.bpm, now);
  if (raw == null) return v.mix;
  return Math.round(v.mix * (1 - l.depth * (1 - Math.cos(raw * Math.PI * 2)) / 2));
}

function attachPixels(s) {
  delete s.pixels;   // a hand-edited show.json must not smuggle stale colours in
  Object.defineProperty(s, 'pixels', {
    value: { at: 0, colors: {}, count: 0, fps: 0, source: '' },
    enumerable: false, writable: true, configurable: true,
  });
  return s;
}

// {colors: {fixtureId: [r,g,b]}} → only fixtures that exist, channels clamped to 0..255.
function sanitizePixels(body, fixtures) {
  const known = new Set(fixtures.map((f) => f.id));
  const out = {};
  const src = body && typeof body.colors === 'object' && body.colors ? body.colors : {};
  for (const [id, c] of Object.entries(src)) {
    if (!known.has(id) || !Array.isArray(c) || c.length < 3) continue;
    out[id] = [0, 1, 2].map((k) => Math.round(num(c[k], 0, 255, 0)));
  }
  return out;
}

function pixelsFresh(state, now) {
  const v = state.video, px = state.pixels;
  return !!(v && v.on && v.w > 0 && v.h > 0 && px && now - (px.at || 0) < STALE_MS);
}

// What the page shows about the live layer — the same gate the engine applies.
function pixelStatus(state, now = Date.now()) {
  const px = state.pixels || {};
  return {
    fresh: pixelsFresh(state, now),
    count: px.count || 0,
    fps: Math.round(px.fps || 0),
    ageMs: px.at ? now - px.at : null,
    source: px.source || '',
    mixNow: mixNow(state, now),   // [anim] what the mix is right now, breathing included
  };
}

const inRect = (f, v) => {
  const x = +f.x, y = +f.y;
  return x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;
};
const OTHER_EMITTERS = new Set(['w', 'a', 'y', 'uv', 'lime', 'warm', 'cool']);

// The render hook. Returns the value reader the engine uses for this fixture: the look's
// own values, or the look blended toward the video colour. Blending happens on the VALUES,
// before the engine applies master, blackout, dimmer limits and FX — so a blackout still
// takes a pixel-mapped light to black and the master still dims it.
//   r, g, b    → toward the video colour by mix
//   dimmer     → toward full by mix: at 100% the video drives the light even when the
//                look had it dark, which is what a pixel map is
//   w, a, uv…  → toward 0 by mix, so a white or amber chip cannot wash the video out
// Untouched: stale or switched-off video, fixtures outside the picture, profiles the
// effects are told to leave alone (fx.exclude — the studio's Dimmer marker), profiles
// without r/g/b, and fixtures the page sent no colour for.
function pixelVal(state, f, profile, excluded, now, lookVal) {
  if (!pixelsFresh(state, now)) return lookVal;
  const v = state.video;
  if (excluded && excluded.has(f.profile)) return lookVal;
  const ch = profile.channels;
  if (!ch.includes('r') || !ch.includes('g') || !ch.includes('b')) return lookVal;
  // [anim] A box that travels A → B is not where the saved rectangle says: the page is the
  // authority on which lights are under it RIGHT NOW — it only sends colours for lights
  // inside its current box, and a light it sent nothing for keeps the look (below). A box
  // that stands still keeps the old check against the saved rectangle.
  if (!(v.anim && v.anim.on) && !inRect(f, v)) return lookVal;
  const c = state.pixels.colors[f.id];
  if (!c) return lookVal;
  const m = mixNow(state, now) / 255;
  if (m <= 0) return lookVal;
  const mixTo = (a, b) => a + (b - a) * m;
  return (role) => {
    const look = lookVal(role);
    if (role === 'r') return mixTo(look ?? 0, c[0]);
    if (role === 'g') return mixTo(look ?? 0, c[1]);
    if (role === 'b') return mixTo(look ?? 0, c[2]);
    if (role === 'dimmer') return mixTo(look ?? 255, 255);
    if (OTHER_EMITTERS.has(role)) return mixTo(look ?? 0, 0);
    return look;
  };
}

// The two routes, handed the server's own helpers so this file needs nothing from it.
// `getState` and not `state`: di.iiii's desk replaces `state` whole when a space's show is
// loaded (switchShow), and a route holding the object it was handed would go on editing the
// show that was left.
function videoRoutes({ getState, save, pushFrame, json }) {
  return {
    // Where the picture sits, how much it wins, the sample size, on/off. Persists.
    'POST /api/video': (req, res, body) => {
      const state = getState();
      state.video = sanitizeVideo(state.video, body);
      save(); pushFrame();
      json(res, { ok: true, video: state.video });
    },
    // The live colours, ~30 a second from the page that owns the video. Deliberately
    // cheap, like /api/audio: no save (volatile by design) and no pushFrame (the 40Hz
    // loop picks them up on its next tick; pushing here would double the frame rate).
    'POST /api/pixels': (req, res, body) => {
      const state = getState();
      const px = state.pixels;
      const now = Date.now();
      const dt = px.at ? now - px.at : 0;
      if (dt > 0 && dt < 2000) px.fps = px.fps ? px.fps * 0.85 + (1000 / dt) * 0.15 : 1000 / dt;
      else px.fps = 0;
      px.colors = sanitizePixels(body, state.fixtures);
      px.count = Object.keys(px.colors).length;
      px.source = typeof (body && body.source) === 'string' ? body.source.slice(0, 60) : '';
      px.at = now;
      json(res, { ok: true, count: px.count, on: !!(state.video && state.video.on) });
    },
  };
}

module.exports = {
  DEFAULT_VIDEO, DEFAULT_ANIM, DEFAULT_LFO, STALE_MS, WORLD, sanitizeVideo, attachPixels, sanitizePixels, mixNow,
  pixelsFresh, pixelStatus, pixelVal, videoRoutes,
};
