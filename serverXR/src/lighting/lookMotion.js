'use strict';
// LOOK MOTION on the desk - a look that moves its LEVELS (a breathe, a pulse, a chase, a strobe...) played in DMX.
//
// The 3D room has animated a look's `motion` since 2026-10-09 (src/rigbuild/lookMotion.js, a client port of fx.js pinned
// by src/rigbuild/lookMotion.test.js); the desk only ever received the look's one static step plus its `heads`. Measured
// 2026-10-17 (MOXIR, a "breathe" look): the wash dimmers on the wire sat still while the 3D pulsed, and once the room
// followed the desk's DMX nothing moved anywhere. This file is the desk's half, built the way headMotion.js is:
//
//   What a look says (components.rigLooks.looks[].motion, normalised by normalizeRigLooks in the project schema):
//     { mode, bpm, depth, spatial, kinds, still }   mode = an fx.js mode (MOTION_MODES = FX_MODES without 'none'),
//     spatial = how it fans across the rig (fx.js FX_SPATIAL), kinds = the fixture types that move, still = a lamp at or
//     under this level in the look holds still.
//   What the desk look carries (deskLookValues.js, through POST /api/looks): the same, plus `units` - the fixtures that
//     move, in the order the room's motionPlan put them (patch order: universe, address, id), each with its place in the
//     effect (x, y in the desk's -1..2 world: the room's own spread, or its distance from the DJ for a radial fan). The
//     room decides WHO moves (kinds, still; a laser, a hazer, a smoke or a spark machine never) and hands the desk the
//     list; order is DATA, as a look's `fixtures` is.
//   The maths is fx.js's fxLevel itself, not a second copy, so desk == room is what lookMotion.test.js already pins, and
//     the same test now asserts it end to end (desk frame = room frame within 1/255 at fixed `now` values).
//
// Nothing in here reads the clock: `now` and `epoch` are parameters (server time, ms); the epoch is the layer's firedAt,
// the instant the room counts from too. The strobe cap is fx.js's own (MAX_STROBE_HZ = 3: a slice is never shorter than
// 350 ms on the 40 Hz grid) and the engine keeps two strobes from stacking on one lamp. A look without `motion` renders
// byte for byte as before: motionFrame is null and the engine's multiply is not reached.

const { FX_MODES, FX_SPATIAL, fxLevel } = require('./fx');

const MOTION_MODES = FX_MODES.filter((m) => m !== 'none');
const MOTION_SPATIAL = [...FX_SPATIAL];
// What the schema keeps (bounded numbers and short words). unitsMax = a look's `fixtures` cap: the whole rig may move.
const MOTION_LIMITS = Object.freeze({ bpmMin: 20, bpmMax: 300, depthMax: 255, kindsMax: 8, unitsMax: 1024 });
const MOTION_DEFAULTS = Object.freeze({ bpm: 120, depth: 255, spatial: 'patch', still: 0 });

const fin = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The motion a look names, as the project stores it (no units): or null. Mirror of normalizeLookMotion in the project schema. */
function sanitizeMotionConfig(value) {
  if (!value || typeof value !== 'object' || !MOTION_MODES.includes(value.mode)) return null;
  const kinds = (Array.isArray(value.kinds) ? value.kinds : []).filter((k) => typeof k === 'string' && /^[\w.-]{1,40}$/.test(k)).slice(0, MOTION_LIMITS.kindsMax);
  return {
    mode: value.mode,
    bpm: clamp(Math.round(fin(value.bpm, MOTION_DEFAULTS.bpm)), MOTION_LIMITS.bpmMin, MOTION_LIMITS.bpmMax),
    depth: clamp(Math.round(fin(value.depth, MOTION_DEFAULTS.depth)), 0, MOTION_LIMITS.depthMax),
    spatial: MOTION_SPATIAL.includes(value.spatial) ? value.spatial : MOTION_DEFAULTS.spatial,
    kinds,
    still: clamp(fin(value.still, MOTION_DEFAULTS.still), 0, 1),
  };
}

/**
 * A desk look's motion: the config plus its UNITS, the fixtures the look moves, in effect order: { id (desk fixture id), x, y }.
 * x and y are kept as given, not rounded: a rounded place could cross a lane edge and part the desk from the room.
 */
function sanitizeMotion(value) {
  const config = sanitizeMotionConfig(value);
  if (!config) return null;
  const units = [];
  const seen = new Set();
  for (const u of (Array.isArray(value.units) ? value.units : []).slice(0, MOTION_LIMITS.unitsMax)) {
    if (!u || typeof u.id !== 'string' || !u.id || u.id.length > 40 || seen.has(u.id)) continue;
    seen.add(u.id);
    units.push({ id: u.id, x: fin(u.x, 0), y: fin(u.y, 0) });
  }
  return units.length ? { ...config, units } : null;
}

/**
 * The multipliers at server time `now`: Map(unit id -> 0..255), 255 = leave the lamp alone. fx.js's own fxLevel for unit
 * i of n at `now - epoch`; the room's motionFrame (lookMotion.js) does the same sum, so the two are one beat.
 */
function motionLevels(motion, now, epoch = 0) {
  const out = new Map();
  if (!motion || !MOTION_MODES.includes(motion.mode) || !Array.isArray(motion.units) || !motion.units.length) return out;
  const cfg = { mode: motion.mode, bpm: motion.bpm, depth: motion.depth, spatial: motion.spatial, enabled: true, exclude: [], epoch: 0 };
  const t = fin(now, 0) - fin(epoch, 0);
  const n = motion.units.length;
  motion.units.forEach((u, i) => out.set(u.id, fxLevel(cfg, u, i, n, t)));
  return out;
}

// A layer's fader scales the motion as it scales the light: at half level the swing is half as deep (255 = still).
const byLevel = (m, level) => 255 - (255 - m) * clamp(fin(level, 1), 0, 1);

/**
 * Who moves this frame: Map(desk fixture id -> { level: 0..255, strobe }) over the layers that are on, above 0, whose mask
 * admits intensity and whose look names motion. A higher layer wins a fixture. The epoch is the layer's own `firedAt`; a
 * layer restored from disk has none and counts from the clock's zero. THE CROSSFADE: for `fadeMs` after `firedAt` the look
 * the layer replaced (`fromLookId`, on its own beat `fromFiredAt`) still moves and the two blend linearly, so a swell
 * dissolves into the next instead of popping; a look without motion on either side blends with 255. `strobe` says a
 * strobe reaches the lamp, so the engine can keep the global strobe off it. Null when nobody moves, so a desk without
 * motion costs one array scan.
 */
function motionFrame(state, now, kindAllows) {
  const layers = Array.isArray(state.layers) ? state.layers : [];
  const looks = Array.isArray(state.looks) ? state.looks : [];
  const allows = (kind) => (kindAllows ? kindAllows(kind, 'dimmer') : true);
  const live = layers.filter((l) => l.on && l.lookId && l.level > 0 && allows(l.mask));
  if (!live.length) return null;
  const byId = new Map(looks.map((l) => [l.id, l]));
  const motionOf = (lookId) => {
    const look = lookId ? byId.get(lookId) : null;
    return look && look.motion && allows(look.kind) ? look.motion : null;
  };
  const out = new Map();
  for (const layer of [...live].sort((a, b) => a.priority - b.priority)) {
    const to = motionOf(layer.lookId);
    const epoch = Number.isFinite(layer.firedAt) ? layer.firedAt : 0;
    const fadeMs = Number.isFinite(layer.fadeMs) ? layer.fadeMs : 0;
    const t = epoch > 0 && fadeMs > 0 ? clamp((fin(now, 0) - epoch) / fadeMs, 0, 1) : 1;
    const from = t < 1 ? motionOf(layer.fromLookId) : null;
    if (!to && !from) continue;
    const toMap = to ? motionLevels(to, now, epoch) : new Map();
    const fromMap = from ? motionLevels(from, now, Number.isFinite(layer.fromFiredAt) ? layer.fromFiredAt : 0) : new Map();
    for (const id of new Set([...fromMap.keys(), ...toMap.keys()])) {
      const a = fromMap.has(id) ? fromMap.get(id) : 255;
      const b = toMap.has(id) ? toMap.get(id) : 255;
      const strobe = (to && to.mode === 'strobe' && toMap.has(id)) || (from && from.mode === 'strobe' && fromMap.has(id));
      out.set(id, { level: byLevel(a + (b - a) * t, layer.level), strobe: !!strobe });
    }
  }
  return out.size ? out : null;
}

module.exports = {
  MOTION_MODES, MOTION_SPATIAL, MOTION_LIMITS, MOTION_DEFAULTS,
  sanitizeMotionConfig, sanitizeMotion, motionLevels, motionFrame,
};
