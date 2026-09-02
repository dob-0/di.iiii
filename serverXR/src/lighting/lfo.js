'use strict';
// Low-frequency oscillators: per-channel modulation that rides ON TOP of the scene values
// in the render path. Nothing in here ever mutates fixture.values — the saved look is the
// reference the oscillator swings around (bipolar) or dips down from (unipolar), and
// switching an LFO off returns the rig to exactly the scene that was there before.
//
// Like fx.js, nothing here reads the clock: `now` is a parameter so a wave can be asserted
// at an exact millisecond in a test.

const { fxHash, fxOrder, FRAME_MS } = require('./fx');

const LFO_WAVES = ['sine', 'tri', 'saw', 'square', 'random'];
const MAX_LFOS = 16;
const TAU = Math.PI * 2;

// A profile made ONLY of generic channels (c1, c2, ... like a 32-channel laser) is a bank
// of mode switches, not lamps: scaling any of its values changes what the fixture DOES,
// not how bright it is. Such fixtures are never modulated unless picked out by id.
const GENERIC_CH = /^c\d+$/;
function isGenericChannels(channels) {
  return Array.isArray(channels) && channels.length > 0
    && channels.every((c) => GENERIC_CH.test(c));
}

function clampNum(v, lo, hi, dflt) {
  const n = +v;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function clamp8(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// ---- validation ------------------------------------------------------------
// The route replaces the whole list, so every LFO that reaches the state has been through
// here: known keys only, every number clamped, every enum defaulted.
let lfoSeq = 1;
function sanitizeLfo(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const t = src.targets && typeof src.targets === 'object' ? src.targets : {};
  const strings = (list, cap, len) => (Array.isArray(list) ? list : [])
    .filter((s) => typeof s === 'string' && s.length > 0)
    .slice(0, cap)
    .map((s) => s.slice(0, len));
  return {
    id: typeof src.id === 'string' && src.id ? src.id.slice(0, 40)
      : `lf${Date.now().toString(36)}${lfoSeq++}`,
    name: typeof src.name === 'string' ? src.name.slice(0, 40) : '',
    enabled: !!src.enabled,
    wave: LFO_WAVES.includes(src.wave) ? src.wave : 'sine',
    beats: clampNum(src.beats, 0.25, 64, 1),
    depth: Math.round(clampNum(src.depth, 0, 255, 255)),
    spread: clampNum(src.spread, 0, 1, 0),
    channel: typeof src.channel === 'string' && src.channel ? src.channel.slice(0, 24) : 'dimmer',
    bipolar: !!src.bipolar,
    targets: { profiles: strings(t.profiles, 20, 40), ids: strings(t.ids, 128, 40) },
  };
}

// null for "not a list at all" so the route can 400 instead of quietly wiping the LFOs.
function sanitizeLfos(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, MAX_LFOS).map(sanitizeLfo);
}

// ---- the oscillator --------------------------------------------------------
// Deterministic per-lfo seed so two 'random' LFOs at the same tempo do not flicker in
// lockstep, and the same LFO gives the same flicker at the same millisecond every time.
function seedOf(id) {
  let h = 0x9dc5;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Wave value 0..1 at time `now`, cycle length periodMs, phase offset 0..1.
// square and random are stepped, so their clock is quantised to the 25ms frame grid the
// same way fx.js does it — an edge that falls between two frames never reaches the wire.
function lfoWave(wave, now, periodMs, phaseOffset, seed) {
  const period = Math.max(1, periodMs);
  if (wave === 'square' || wave === 'random') {
    const tq = Math.floor(Math.floor(now) / FRAME_MS) * FRAME_MS;
    const total = tq / period + (phaseOffset || 0);
    if (wave === 'random') {
      const slot = Math.floor(total);
      return (fxHash(((slot >>> 0) ^ (seed >>> 0)) >>> 0) & 0xff) / 255;
    }
    const p = total - Math.floor(total);
    return p < 0.5 ? 1 : 0;
  }
  const total = now / period + (phaseOffset || 0);
  const p = total - Math.floor(total);
  if (wave === 'tri') return p < 0.5 ? p * 2 : 2 - p * 2;
  if (wave === 'saw') return p;
  // sine starts at 0.5: a bipolar pan/tilt LFO switched on mid-show departs FROM the
  // scene position instead of snapping a full depth sideways on the first frame.
  return (Math.sin(TAU * p) + 1) / 2;
}

// Which fixtures an LFO drives, in patch order (that order is what `spread` fans across).
// channelsOf(fixture) -> the profile's channel list; passed in rather than required from
// engine.js because engine.js requires this file.
function lfoTargets(lfo, fixtures, channelsOf, order) {
  const ids = new Set((lfo.targets && lfo.targets.ids) || []);
  const profiles = new Set((lfo.targets && lfo.targets.profiles) || []);
  const everything = ids.size === 0 && profiles.size === 0;
  const out = [];
  for (const f of fixtures) {
    const channels = channelsOf(f) || [];
    const byId = ids.has(f.id);
    // Generic-only profiles (lasers): only an explicit id may modulate them.
    if (isGenericChannels(channels) && !byId) continue;
    if (!(everything || byId || profiles.has(f.profile))) continue;
    // Must actually have the channel. 'dimmer' is the one virtual exception: every
    // non-generic fixture carries a dimmer value (makeFixture guarantees it) and the
    // render path scales dimmerless emitters by it, so a dimmer LFO works on an rgb par.
    const has = channels.includes(lfo.channel)
      || (lfo.channel === 'dimmer' && !isGenericChannels(channels));
    if (!has) continue;
    out.push(f);
  }
  const ord = order || fxOrder(fixtures);
  out.sort((a, b) => (ord.get(a.id) ?? 0) - (ord.get(b.id) ?? 0));
  return out;
}

// The whole engine: Map<fixtureId, {channelName: modulatedValue 0..255}> for this
// millisecond, or null when no LFO is doing anything. The caller reads a fixture's value
// through this map and falls back to fixture.values — the scene itself is never written.
function lfoApply(lfos, fixtures, bpm, now, channelsOf) {
  if (!Array.isArray(lfos) || lfos.length === 0) return null;
  const active = lfos.filter((l) => l && l.enabled);
  if (active.length === 0 || !Array.isArray(fixtures) || fixtures.length === 0) return null;

  // The beat clock is the FX bpm even when no FX mode is running.
  const beatMs = 60000 / Math.max(20, Math.min(300, +bpm || 120));
  const order = fxOrder(fixtures);
  let map = null;

  for (const lfo of active) {
    const targets = lfoTargets(lfo, fixtures, channelsOf, order);
    const m = targets.length;
    if (m === 0) continue;
    const beats = clampNum(lfo.beats, 0.25, 64, 1);
    const periodMs = Math.max(1, beats * beatMs);
    const depth = Math.max(0, Math.min(255, lfo.depth | 0));
    const spread = clampNum(lfo.spread, 0, 1, 0);
    const seed = seedOf(lfo.id);

    for (let k = 0; k < m; k++) {
      const f = targets[k];
      const w = lfoWave(lfo.wave, now, periodMs, (spread * k) / m, seed);
      if (!map) map = new Map();
      let vals = map.get(f.id);
      if (!vals) { vals = {}; map.set(f.id, vals); }
      // A second LFO on the same channel modulates the first one's output, so stacking
      // a slow swell under a fast shimmer composes instead of the last one winning.
      const base = vals[lfo.channel] != null ? vals[lfo.channel]
        : (f.values && f.values[lfo.channel] != null ? f.values[lfo.channel] : 0);
      vals[lfo.channel] = lfo.bipolar
        // bipolar: swing AROUND the scene value — movement for pan/tilt.
        ? clamp8(base + Math.round((w * 2 - 1) * depth))
        // unipolar: dip DOWN from the scene value, so the saved look is the ceiling and
        // depth 0 leaves the rig exactly alone — the same contract FX depth keeps.
        : clamp8(base - Math.round((1 - w) * depth));
    }
  }
  return map;
}

module.exports = {
  LFO_WAVES, MAX_LFOS,
  sanitizeLfo, sanitizeLfos,
  lfoApply, lfoTargets, lfoWave, seedOf,
  isGenericChannels,
};
