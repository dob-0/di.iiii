'use strict';
// HEAD MOTION - a look that MOVES the moving heads. One pure function, played the same way by the desk (here) and by
// the 3D room (src/rigbuild/headMotion.js, a CLIENT PORT: serverXR is CommonJS and src/ cannot import it; the test
// src/rigbuild/headMotion.test.js pins the two to within 0.01 degree at fixed `now` values, as lookMotion.test.js
// pins fx.js). Nothing in here reads the clock: `now` and `epoch` are parameters (server time, ms).
//
// What a look says (components.rigLooks.looks[].heads, normalised by normalizeRigLooks in the project schema):
//   { pattern, period_s, pan_deg, tilt_deg, spatial, kinds }
//   th = 2 pi (now - epoch) / 1000 / period_s     `now` is the SERVER's time and `epoch` the server time the look was
//   fired, so every viewer and the desk are on the same beat; a viewer's own clock never enters.
//   unit i of n (units ordered by x, house left to right, then z, then id) has the phase  a_i = th + phiPattern_i + phiSpatial_i
//     pattern  sweep   pan  = pan_deg sin a_i
//              nod     tilt = tilt_deg sin a_i
//              circle  pan  = pan_deg sin a_i,  tilt = tilt_deg cos a_i
//              figure8 pan  = pan_deg sin a_i,  tilt = tilt_deg sin 2 a_i
//              fan     STATIC: pan = pan_deg (2 i / (n - 1) - 1); n = 1 stays at 0
//              wave    tilt = tilt_deg sin a_i, phiPattern_i = 2 pi i / n
//              cross   sweep, phiPattern_i = pi (i mod 2)
//     spatial  all (phi 0) | alternate (phi pi on odd units) | ripple (phi 2 pi i / n) | left-right (pan sign flipped for x < 0)
//   The two phases ADD: a 'wave' with spatial 'ripple' runs two waves across the rig; a 'cross' with 'alternate' is
//   back in unison. Said once here, pinned by the test.
// Output: per unit id, the OFFSET { pan, tilt } in degrees in the WORLD frame the room draws in: pan = turn of the beam
// about world +y (positive = anticlockwise seen from above), tilt = swing away from straight down (positive = further).
// Offsets sit on top of the look's REST aim. The desk adds them to the rest pan/tilt it reads from the look's channel
// values, in the fixture's own frame (sign flipped by `hung`, see headSigns), clamps to the fixture's range and writes
// 16 bits where the mode has fine channels (headsPose). The room does the same arithmetic on the entity's rotation.
//
// Hard limits kept by construction: a unit is only ever a fixture with pan/tilt; this module returns two numbers per
// unit and has no way to say a level, a colour or a position, so a lamp without pan/tilt cannot be moved by it.

const HEAD_PATTERNS = ['sweep', 'nod', 'circle', 'figure8', 'fan', 'wave', 'cross'];
const HEAD_SPATIAL = ['all', 'alternate', 'left-right', 'ripple'];
// What the schema keeps (bounded numbers and short words). The half ranges are the largest a 540/270 degree head has.
const HEAD_LIMITS = Object.freeze({ periodMin: 0.5, periodMax: 600, panMax: 270, tiltMax: 135, kindsMax: 8, unitsMax: 256 });
const HEAD_DEFAULTS = Object.freeze({ period_s: 8, pan_deg: 30, tilt_deg: 20 });

const TAU = Math.PI * 2;
const fin = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Order units the way every player must: x (house left to right), then z, then id. Never mutates. */
function orderUnits(units) {
  return [...units].sort((a, b) => (fin(a.x, 0) - fin(b.x, 0)) || (fin(a.z, 0) - fin(b.z, 0)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * The offsets at server time `now`: Map(unit id -> { pan, tilt }) in degrees.
 * @param {number} now     server time, ms
 * @param {number} epoch   server time the look was fired, ms (0 = counted from the clock's own zero)
 * @param {object} heads   { pattern, period_s, pan_deg, tilt_deg, spatial }
 * @param {{id: string, x?: number, z?: number}[]} units
 */
function headOffsets(now, epoch, heads, units) {
  const out = new Map();
  if (!heads || !HEAD_PATTERNS.includes(heads.pattern) || !Array.isArray(units) || !units.length) return out;
  const pattern = heads.pattern;
  const spatial = HEAD_SPATIAL.includes(heads.spatial) ? heads.spatial : 'all';
  const panDeg = fin(heads.pan_deg, 0);
  const tiltDeg = fin(heads.tilt_deg, 0);
  const period = Math.max(1e-3, fin(heads.period_s, HEAD_DEFAULTS.period_s));
  const th = (TAU * ((fin(now, 0) - fin(epoch, 0)) / 1000)) / period;
  const ordered = orderUnits(units);
  const n = ordered.length;
  ordered.forEach((u, i) => {
    const phiPattern = pattern === 'wave' ? (TAU * i) / n : pattern === 'cross' ? Math.PI * (i % 2) : 0;
    const phiSpatial = spatial === 'alternate' ? Math.PI * (i % 2) : spatial === 'ripple' ? (TAU * i) / n : 0;
    const a = th + phiPattern + phiSpatial;
    let pan = 0;
    let tilt = 0;
    switch (pattern) {
      case 'sweep': case 'cross': pan = panDeg * Math.sin(a); break;
      case 'nod': case 'wave': tilt = tiltDeg * Math.sin(a); break;
      case 'circle': pan = panDeg * Math.sin(a); tilt = tiltDeg * Math.cos(a); break;
      case 'figure8': pan = panDeg * Math.sin(a); tilt = tiltDeg * Math.sin(2 * a); break;
      case 'fan': pan = n > 1 ? panDeg * ((2 * i) / (n - 1) - 1) : 0; break;
      default: break;
    }
    if (spatial === 'left-right' && fin(u.x, 0) < 0) pan = -pan;
    out.set(u.id, { pan: pan + 0, tilt: tilt + 0 });
  });
  return out;
}

/** The fastest the head turns, degrees per second, over the pattern (a check, not a clamp: the schema does not slow a look). */
function headPeakSpeed(heads) {
  if (!heads || !HEAD_PATTERNS.includes(heads.pattern) || heads.pattern === 'fan') return 0;
  const w = TAU / Math.max(1e-3, fin(heads.period_s, HEAD_DEFAULTS.period_s));
  const pan = fin(heads.pan_deg, 0);
  const tilt = fin(heads.tilt_deg, 0);
  const speed = { sweep: pan * w, cross: pan * w, nod: tilt * w, wave: tilt * w, circle: Math.hypot(pan * w, tilt * w), figure8: Math.hypot(pan * w, 2 * tilt * w) };
  return speed[heads.pattern] || 0;
}

/** The heads a look names, as the project stores them (no units): or null. Mirror of normalizeLookHeads in the project schema. */
function sanitizeHeadsConfig(value) {
  if (!value || typeof value !== 'object' || !HEAD_PATTERNS.includes(value.pattern)) return null;
  const kinds = (Array.isArray(value.kinds) ? value.kinds : []).filter((k) => typeof k === 'string' && /^[\w.-]{1,40}$/.test(k)).slice(0, HEAD_LIMITS.kindsMax);
  return {
    pattern: value.pattern,
    period_s: clamp(fin(value.period_s, HEAD_DEFAULTS.period_s), HEAD_LIMITS.periodMin, HEAD_LIMITS.periodMax),
    pan_deg: clamp(fin(value.pan_deg, HEAD_DEFAULTS.pan_deg), 0, HEAD_LIMITS.panMax),
    tilt_deg: clamp(fin(value.tilt_deg, HEAD_DEFAULTS.tilt_deg), 0, HEAD_LIMITS.tiltMax),
    spatial: HEAD_SPATIAL.includes(value.spatial) ? value.spatial : 'all',
    kinds,
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * A desk look's heads: the config plus its UNITS, the fixtures the look moves, each with what the desk needs and the
 * library alone knows: { id (desk fixture id), x, z (metres, for the order), hung, panRange, tiltRange (degrees) }.
 */
function sanitizeHeads(value) {
  const config = sanitizeHeadsConfig(value);
  if (!config) return null;
  const units = [];
  const seen = new Set();
  for (const u of (Array.isArray(value.units) ? value.units : []).slice(0, HEAD_LIMITS.unitsMax)) {
    if (!u || typeof u.id !== 'string' || !u.id || u.id.length > 40 || seen.has(u.id)) continue;
    const panRange = fin(u.panRange, 540);
    const tiltRange = fin(u.tiltRange, 270);
    if (!(panRange > 0) || !(tiltRange > 0)) continue;
    seen.add(u.id);
    units.push({ id: u.id, x: round3(fin(u.x, 0)), z: round3(fin(u.z, 0)), hung: u.hung === true, panRange: clamp(panRange, 1, 1440), tiltRange: clamp(tiltRange, 1, 720) });
  }
  return units.length ? { ...config, units } : null;
}

// ---- THE DESK SIDE: rest channel values + offsets -> channel values -----------------------------------------------

/**
 * The sign that turns a WORLD offset into the fixture's own pan/tilt. A standing machine: the beam is (sin t sin p, cos t,
 * sin t cos p); a hung one is that turned half a turn about z, (-sin t sin p, -cos t, sin t cos p) (fixture-lib.mjs,
 * dmxPose.js beamOfPanTilt). Against the room's d = (-sin T sin P, -cos T, -sin T cos P): hung P = 180 - p, T = t;
 * standing P = 180 + p, T = 180 - t. So a world pan of +1 is a fixture pan of -1 (hung) or +1 (standing), and a world
 * tilt of +1 (further from straight down) is a fixture tilt of +1 (hung) or -1 (standing).
 */
function headSigns(hung) {
  return hung ? { pan: -1, tilt: 1 } : { pan: 1, tilt: -1 };
}

// 16-bit value 0..1 from a coarse and an optional fine byte: dmxDecode.js `sixteen`, the same convention.
const unitFrom = (coarse, fine) => {
  const c = clamp(Number(coarse) || 0, 0, 255);
  if (fine == null) return c / 255;
  return (c * 256 + clamp(Number(fine) || 0, 0, 255)) / 65535;
};
// Degrees from home over a symmetric range (DMX centre is home): dmxDecode.js `degFromHome`.
const degFromHome = (u, range) => (clamp(u, 0, 1) - 0.5) * range;
// The bytes for a position in degrees from home: dmxDecode.js `toSixteen`; 8-bit when the mode has no fine channel.
const bytesFor = (deg, range, hasFine) => {
  const u = clamp(deg / range + 0.5, 0, 1);
  if (!hasFine) return [Math.round(u * 255), null];
  const v = Math.round(u * 65535);
  return [v >> 8, v & 255];
};

/**
 * One axis: rest bytes + a world offset -> bytes. `rest` is [coarse, fine|null]. Clamped to +-range/2 (the fixture stops).
 * With a zero offset the bytes come back exactly as they went in.
 */
function moveAxis(rest, offsetDeg, range, hasFine) {
  const deg = degFromHome(unitFrom(rest[0], hasFine ? rest[1] : null), range) + offsetDeg;
  return bytesFor(clamp(deg, -range / 2, range / 2), range, hasFine);
}

/**
 * The pan/tilt channel values for one unit this frame: { pan, panFine?, tilt, tiltFine? } (0..255) or null when the
 * fixture's channel list has neither pan nor tilt. `val(role)` reads the rest value (layer, LFO, stored) or undefined.
 */
function headsPose(hd, channels, val) {
  const { off, unit, level } = hd;
  const sign = headSigns(unit.hung);
  const out = {};
  const axis = (role, fineRole, offset, range) => {
    if (!channels.includes(role)) return;
    const hasFine = channels.includes(fineRole);
    const c = val(role);
    const f = hasFine ? val(fineRole) : null;
    const [coarse, fine] = moveAxis([c == null ? 128 : c, f == null ? 0 : f], offset, range, hasFine);
    out[role] = coarse;
    if (hasFine) out[fineRole] = fine;
  };
  axis('pan', 'panFine', sign.pan * off.pan * level, unit.panRange);
  axis('tilt', 'tiltFine', sign.tilt * off.tilt * level, unit.tiltRange);
  return Object.keys(out).length ? out : null;
}

/**
 * Who moves this frame: Map(desk fixture id -> { off, unit, level }) over the layers that are on, above 0, whose look names
 * heads and whose mask admits position. A higher layer wins a fixture. The epoch is the layer's own `firedAt` (the moment
 * the look was put there, the same instant a room following the desk counts from); a layer restored from disk has none and
 * counts from the clock's zero. Null when nobody moves, so a desk without heads costs one array scan.
 */
function headsFrame(state, now, kindAllows) {
  const layers = Array.isArray(state.layers) ? state.layers : [];
  const looks = Array.isArray(state.looks) ? state.looks : [];
  const live = layers.filter((l) => l.on && l.lookId && l.level > 0 && (kindAllows ? kindAllows(l.mask, 'pan') : true));
  if (!live.length) return null;
  const out = new Map();
  for (const layer of [...live].sort((a, b) => a.priority - b.priority)) {
    const look = looks.find((l) => l.id === layer.lookId);
    if (!look || !look.heads || !Array.isArray(look.heads.units) || !look.heads.units.length) continue;
    if (kindAllows && !kindAllows(look.kind, 'pan')) continue;
    const epoch = Number.isFinite(layer.firedAt) ? layer.firedAt : 0;
    const offsets = headOffsets(now, epoch, look.heads, look.heads.units);
    for (const unit of look.heads.units) {
      const off = offsets.get(unit.id);
      if (off) out.set(unit.id, { off, unit, level: layer.level });
    }
  }
  return out.size ? out : null;
}

module.exports = {
  HEAD_PATTERNS, HEAD_SPATIAL, HEAD_LIMITS, HEAD_DEFAULTS,
  headOffsets, headPeakSpeed, orderUnits, sanitizeHeadsConfig, sanitizeHeads,
  headSigns, moveAxis, headsPose, headsFrame,
};
