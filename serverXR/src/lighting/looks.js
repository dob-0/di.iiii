'use strict';
// LOOKS AND LAYERS — the desk's content model.
//
// One object holds every kind of content a lighting desk has, because the field's own
// best idea (grandMA3's phasers) is that they were never four things:
//
//   a look is a LIST OF STEPS.
//
//   · one step, values per fixture            → a scene
//   · one step, one attribute kind            → a palette (a colour, a position)
//   · two steps, transition 0                 → a chase
//   · two steps, transition 1, phase fanned   → a wave travelling across the rig
//   · a value that points at another look     → a scene built out of palettes
//
// Scene, palette, chase and effect stop being four objects with four editors, and
// "phase" stops being an effects-engine private and becomes an ordinary number you can
// fan across an ordered selection — which is the mechanism behind every chase, ripple
// and colour swell in the audit.
//
// A LAYER is a look under a finger: a level, a merge rule, a priority and a mask. That
// one structure is a submaster, an executor, a Resolume layer, and "a strobe on top of
// whatever is running" — the thing this desk could not do at all before, because a
// scene recall assigned straight onto the fixtures and nothing could sit above it.

const { roleKind } = require('./roles');

// What a look is allowed to set. A mask keeps a colour palette from moving the heads,
// and lets a layer own the beam while another owns intensity.
const KINDS = ['all', 'intensity', 'colour', 'position', 'beam'];
const MERGES = ['htp', 'ltp'];
// What drives a wave ACROSS the rig — the audit's one recurring idea (Resolume's line/
// radial generators, MADRIX's pixel mapper, the old fx.js spatial fan) done as a fan
// setting instead of a fourth object: 'patch' is the desk's old behaviour (phase spread
// by index, the order fixtures were added); the rest read the stage arrangement, so a
// two-step wave becomes a line crossing the room, a ring breathing out from its centre,
// or a beam turning round it — and dragging a fixture on the stage moves it inside every
// look using one of these, the same promise fx.js's spatial fan already made for FX.
const SPATIAL = ['patch', 'x', 'x-', 'y', 'y-', 'radial', 'radial-', 'angle', 'angle-'];
// Whose value this is. Position is per fixture — every head points somewhere different.
// Colour and gobo are per fixture TYPE — "open white" is the same DMX on every unit of
// that model. The distinction is Avolites', and it is what makes a palette portable.
const SCOPES = ['each', 'type', 'global'];
const MAX_LOOKS = 2000;
const MAX_LAYERS = 64;
const MAX_STEPS = 64;
// Deep enough for a palette of a palette, shallow enough that a cycle cannot cost a frame.
const MAX_REF_DEPTH = 4;
const TAU = Math.PI * 2;

// Which attributes a mask admits. `control` and `fine` ride with beam: they are the
// wheels, prisms and low bytes, and nobody wants them in a colour palette.
const kindAllows = (kind, role) => {
  if (!kind || kind === 'all') return true;
  const k = roleKind(role);
  if (kind === 'intensity') return k === 'level';
  if (kind === 'colour') return k === 'emitter';
  if (kind === 'position') return k === 'position' || role === 'panFine' || role === 'tiltFine';
  if (kind === 'beam') return k === 'control' || k === 'fine';
  return true;
};

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const num = (v, fallback) => (Number.isFinite(+v) ? +v : fallback);

// ---- shapes ---------------------------------------------------------------

function sanitizeValues(values) {
  const out = {};
  if (!values || typeof values !== 'object') return out;
  for (const [fixtureId, attrs] of Object.entries(values)) {
    if (typeof fixtureId !== 'string' || !fixtureId || fixtureId.length > 40) continue;
    if (!attrs || typeof attrs !== 'object') continue;
    const cell = {};
    for (const [role, v] of Object.entries(attrs)) {
      if (typeof role !== 'string' || !role || role.length > 24) continue;
      // A value is a number, or a POINTER at another look. The pointer is the whole
      // reason palettes work: re-point "Downstage Centre" once and every look that
      // named it is right, instead of re-recording the show.
      if (v && typeof v === 'object' && typeof v.ref === 'string' && v.ref) {
        cell[role] = { ref: v.ref.slice(0, 40) };
      } else if (Number.isFinite(+v)) {
        cell[role] = clamp8(+v);
      }
    }
    if (Object.keys(cell).length) out[fixtureId] = cell;
  }
  return out;
}

function sanitizeStep(step) {
  if (!step || typeof step !== 'object') return null;
  return {
    values: sanitizeValues(step.values),
    // How long this step lasts, relative to the others. Widths are normalised at
    // evaluation time, so [1,1] and [3,3] are the same phaser.
    width: Math.max(0.01, Math.min(100, num(step.width, 1))),
    // How much of that width is spent MOVING to the next step rather than holding this
    // one. 0 snaps — that is a chase. 1 never stops moving — that is a wave. The whole
    // difference between the two objects every other desk keeps separate.
    transition: clamp01(num(step.transition, 0)),
  };
}

function sanitizeLook(look) {
  if (!look || typeof look !== 'object' || typeof look.id !== 'string' || !look.id) return null;
  const steps = (Array.isArray(look.steps) ? look.steps : []).slice(0, MAX_STEPS)
    .map(sanitizeStep).filter(Boolean);
  if (!steps.length) return null;
  return {
    id: look.id.slice(0, 40),
    name: String(look.name || 'Look').slice(0, 60),
    kind: KINDS.includes(look.kind) ? look.kind : 'all',
    scope: SCOPES.includes(look.scope) ? look.scope : 'each',
    spatial: SPATIAL.includes(look.spatial) ? look.spatial : 'patch',
    // The ordered selection this look runs across. Order is DATA: it is what phase,
    // fan and "next fixture" all read. Empty means every patched fixture.
    fixtures: (Array.isArray(look.fixtures) ? look.fixtures : [])
      .filter((id) => typeof id === 'string' && id).slice(0, 1024),
    steps,
    // Beats for one full loop. Held against the desk's clock, so tapping a tempo
    // retimes every running look at once.
    measure: Math.max(0.01, Math.min(64, num(look.measure, 1))),
    // Degrees of offset spread across the selection. 0 = the whole rig in unison,
    // 360 = one full cycle walking round it, 720 = two.
    phase: Math.max(-3600, Math.min(3600, num(look.phase, 0))),
    // A look can run against the clock (null) or at its own tempo.
    bpm: look.bpm == null ? null : Math.max(1, Math.min(600, num(look.bpm, 120))),
  };
}

function sanitizeLooks(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_LOOKS)) {
    const look = sanitizeLook(raw);
    if (!look || seen.has(look.id)) continue;
    seen.add(look.id);
    out.push(look);
  }
  return out;
}

function sanitizeLayer(layer) {
  if (!layer || typeof layer !== 'object' || typeof layer.id !== 'string' || !layer.id) return null;
  return {
    id: layer.id.slice(0, 40),
    name: String(layer.name || 'Layer').slice(0, 60),
    lookId: typeof layer.lookId === 'string' && layer.lookId ? layer.lookId.slice(0, 40) : null,
    // The fader. 0 is not "off": a layer at 0 still costs nothing and still holds its
    // place in the stack, which is what makes a fader a fader.
    level: clamp01(num(layer.level, 1)),
    on: layer.on !== false,
    // Intensity genuinely adds, so HTP is right for it; a half-blend of two gobo wheel
    // positions is meaningless, so everything else is LTP. Priority is the real
    // ordering — HTP is one merge function inside a tier, not a first-class idea.
    merge: MERGES.includes(layer.merge) ? layer.merge : 'htp',
    priority: Math.max(0, Math.min(999, Math.round(num(layer.priority, 0)))),
    mask: KINDS.includes(layer.mask) ? layer.mask : 'all',
    // Speed against the desk's clock, so one layer can run at half time.
    rate: Math.max(0.01, Math.min(64, num(layer.rate, 1))),
  };
}

function sanitizeLayers(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_LAYERS)) {
    const layer = sanitizeLayer(raw);
    if (!layer || seen.has(layer.id)) continue;
    seen.add(layer.id);
    out.push(layer);
  }
  return out;
}

// ---- evaluation -----------------------------------------------------------

// Where a fixture sits in the room, 0..1 along the axis `spatial` names — null for
// 'patch' or a fixture with no position, which tells stepPosition to fall back to its
// place in the ordered selection instead. The home rectangle is 0..1; -1..2 is the old
// margin around it and anything further out (the stage can be dragged much wider than
// that now) simply clamps to the wall nearest it, same as a fixture hung past the truss.
function spatialFrac(spatial, fixture) {
  if (!fixture || spatial === 'patch') return null;
  const rev = spatial.endsWith('-');
  const axis = rev ? spatial.slice(0, -1) : spatial;
  const flip = (p) => (rev ? 1 - p : p);
  // The ROOM is 0..1 — that is the square the stage view draws and the only part of the
  // world a rig is ever laid out in. Normalising the -1..2 clamp range instead squeezed a
  // real rig into a slice of the sweep: on this desk's own 26-fixture rig, an 'x' fan
  // spanned 0.28..0.75, so half of every travelling look happened where no light is.
  // fx.js carried the identical bug; this is the same fix, kept in step with it.
  const nx = clamp01(num(fixture.x, 0));
  const ny = clamp01(num(fixture.y, 0));
  if (axis === 'x') return flip(nx);
  if (axis === 'y') return flip(ny);
  const dx = nx - 0.5, dy = ny - 0.5;
  // radial: 0 at the centre of the room, 1 at its corners — an expanding ring. angle:
  // which way round the centre a fixture sits — a beam rotating past it reads as a radar
  // sweep once phase and the clock are moving it. SQRT1_2 is the centre-to-corner
  // distance, so a corner reads 1.0 rather than saturating early.
  if (axis === 'radial') return flip(Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2));
  if (axis === 'angle') return flip((((Math.atan2(dy, dx) / TAU) % 1) + 1) % 1);
  return null;
}

// Where a fixture sits in the loop, 0..1. Its phase offset comes from its place in the
// ordered selection by default, or from its room position when the look names a spatial
// fan — this is the one line that turns a two-step look into a wave, and the one branch
// that turns that wave into a line crossing the room instead of the patch order.
function stepPosition(look, index, count, now, rate, clockBpm, fixture) {
  // The desk's clock unless the look insists on its own. This is what makes Tap mean
  // something: one tempo, and every running look retimes to it at once. A look with its
  // own bpm has opted out on purpose — a slow swell under a fast chase.
  const bpm = Math.max(1, look.bpm || clockBpm || 120);
  const beatMs = 60000 / bpm;
  const periodMs = Math.max(1, beatMs * look.measure / Math.max(0.01, rate));
  const geo = spatialFrac(look.spatial, fixture);
  const frac = geo != null ? geo : (count > 1 ? index / count : 0);
  const spread = frac * (look.phase / 360);
  const p = (now / periodMs + spread) % 1;
  return p < 0 ? p + 1 : p;
}

// Ease the move so a transition arrives rather than stops dead. Cosine, because it is
// symmetric and costs nothing; a fixture that eases in and out reads as a light rather
// than a value being written.
const ease = (t) => (1 - Math.cos(clamp01(t) * Math.PI)) / 2;

// The value of one look for one fixture, right now: which step it is in, and how far it
// has moved toward the next.
function stepBlend(look, pos) {
  const steps = look.steps;
  if (steps.length === 1) return { a: steps[0], b: steps[0], t: 0 };
  const total = steps.reduce((sum, s) => sum + s.width, 0);
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const w = steps[i].width / total;
    if (pos < acc + w || i === steps.length - 1) {
      const u = w > 0 ? (pos - acc) / w : 0;
      const step = steps[i];
      const next = steps[(i + 1) % steps.length];
      // Hold this step for (1 - transition) of its width, then move to the next during
      // the rest. transition 0 never moves — it snaps at the boundary, which is a chase.
      if (step.transition <= 0) return { a: step, b: step, t: 0 };
      const start = 1 - step.transition;
      const t = u <= start ? 0 : ease((u - start) / step.transition);
      return { a: step, b: next, t };
    }
    acc += w;
  }
  return { a: steps[0], b: steps[0], t: 0 };
}

// Resolve a value that may point at another look — a palette. Depth-limited, so a
// palette that names itself costs one lookup and not a frame.
function resolveValue(v, role, fixtureId, looks, depth = 0) {
  if (typeof v === 'number') return v;
  if (!v || typeof v !== 'object' || !v.ref || depth >= MAX_REF_DEPTH) return null;
  const target = looks.get(v.ref);
  if (!target) return null;
  const step = target.steps[0];
  if (!step) return null;
  // A palette's value for THIS fixture, or its one shared value: 'each' scope stores a
  // value per fixture, 'type' and 'global' store one under '*'.
  const cell = step.values[fixtureId] || step.values['*'];
  if (!cell || cell[role] == null) return null;
  return resolveValue(cell[role], role, fixtureId, looks, depth + 1);
}

// Everything one look is saying right now, as fixtureId -> { role: 0..255 }.
function evalLook(look, fixtures, now, { rate = 1, looks = new Map(), bpm = 120 } = {}) {
  const out = new Map();
  if (!look || !look.steps.length) return out;
  const chosen = look.fixtures.length
    ? look.fixtures.map((id) => fixtures.find((f) => f.id === id)).filter(Boolean)
    : fixtures;
  chosen.forEach((f, index) => {
    const pos = stepPosition(look, index, chosen.length, now, rate, bpm, f);
    const { a, b, t } = stepBlend(look, pos);
    // '*' is "every fixture in the selection" — one value set walking the rig by phase.
    // A per-fixture key is a snapshot. Both live in the same object.
    const cellA = a.values[f.id] || a.values['*'];
    const cellB = b.values[f.id] || b.values['*'];
    if (!cellA && !cellB) return;
    const cell = {};
    const roles = new Set([...Object.keys(cellA || {}), ...Object.keys(cellB || {})]);
    for (const role of roles) {
      if (!kindAllows(look.kind, role)) continue;
      const va = cellA ? resolveValue(cellA[role], role, f.id, looks) : null;
      const vb = cellB ? resolveValue(cellB[role], role, f.id, looks) : null;
      if (va == null && vb == null) continue;
      const from = va == null ? vb : va;
      const to = vb == null ? va : vb;
      cell[role] = clamp8(from + (to - from) * t);
    }
    if (Object.keys(cell).length) out.set(f.id, cell);
  });
  return out;
}

// The whole stack, composited: fixtureId -> { role: 0..255 }, or null when nothing is
// running (in which case the renderer takes the fixtures' own values, exactly as it did
// before layers existed — a desk with no layers behaves as though this file were absent).
function layerValues(state, fixtures, now, clockBpm) {
  const layers = Array.isArray(state.layers) ? state.layers : [];
  if (!layers.length) return null;
  const lookList = Array.isArray(state.looks) ? state.looks : [];
  const looks = new Map(lookList.map((l) => [l.id, l]));
  const live = layers.filter((l) => l.on && l.lookId && looks.has(l.lookId));
  if (!live.length) return null;

  const out = new Map();
  // What is underneath the bottom layer: the fixture's own stored value, which is the
  // look the desk is holding. Without this the first layer's fader had nothing to
  // crossfade FROM and snapped its values in at any level above zero.
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const beneath = (fixtureId, role, current) => {
    if (current != null) return current;
    const f = byId.get(fixtureId);
    const v = f && f.values ? f.values[role] : undefined;
    return Number.isFinite(+v) ? +v : null;
  };
  // Low priority first, so a later write wins for LTP attributes. Ties keep the order
  // the operator put them in — the stack reads top-down on screen, bottom-up here.
  const ordered = [...live].sort((a, b) => a.priority - b.priority);
  for (const layer of ordered) {
    if (layer.level <= 0) continue;
    const values = evalLook(looks.get(layer.lookId), fixtures, now, { rate: layer.rate, looks, bpm: clockBpm });
    for (const [fixtureId, cell] of values) {
      const target = out.get(fixtureId) || {};
      for (const [role, v] of Object.entries(cell)) {
        if (!kindAllows(layer.mask, role)) continue;
        const kind = roleKind(role);
        const under = beneath(fixtureId, role, target[role]);
        // The fader. Intensity is HTP against what is already there — a submaster adds
        // light, it never takes it away, and that is the one place the old HTP rule is
        // still the right answer. Everything else is a crossfade toward the layer's
        // value, because scaling a gobo index halfway is meaningless while easing a
        // layer in is exactly what an operator means by moving its fader.
        if (kind === 'level') {
          const scaled = v * layer.level;
          target[role] = under == null || layer.merge === 'ltp' ? scaled : Math.max(under, scaled);
        } else {
          target[role] = under == null ? v : under + (v - under) * layer.level;
        }
      }
      out.set(fixtureId, target);
    }
  }
  if (!out.size) return null;
  for (const cell of out.values()) {
    for (const role of Object.keys(cell)) cell[role] = clamp8(cell[role]);
  }
  return out;
}

module.exports = {
  KINDS, MERGES, SCOPES, SPATIAL, MAX_LOOKS, MAX_LAYERS, MAX_STEPS,
  sanitizeLook, sanitizeLooks, sanitizeLayer, sanitizeLayers,
  kindAllows, evalLook, layerValues, stepBlend, stepPosition, spatialFrac,
};
