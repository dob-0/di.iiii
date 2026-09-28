'use strict';
// The FX engine: nine effects that ride the rig as a level multiplier, 0..255.
//
// Ported from the ESP32 firmware these effects came from, where they ran per DMX channel.
// Here they run per FIXTURE, which is what they always wanted to be: a chase should step
// from lamp to lamp, not from channel to channel. Per channel, one 10-channel moving head
// spans several lanes on its own and lights in pieces — the effect is arithmetically
// correct and looks like nothing.
//
// Nothing in here reads the clock. `now` is a parameter, so an effect can be asserted at
// an exact millisecond instead of being watched for a while and believed.

const FX_MODES = ['none', 'strobe', 'chase', 'pulse', 'sine', 'sparkle', 'comet', 'bars', 'glitch', 'radar',
  'pump', 'breathe', 'pingpong', 'blocks', 'fade'];

// The output loop pushes frames at 40 Hz. Any transition faster than one frame falls
// between pushes and never reaches the wire, so every stepped mode below quantises its
// clock to the frame grid and floors its step at a whole number of frames. Without this,
// a fast strobe's 6ms on-window lands between two 25ms frames and the rig just dims.
const FRAME_MS = 25;

// `exclude` is a list of profile NAMES the effects never touch: the render path gives any
// fixture patched on one of them a flat 255 multiplier, so a hazer on a dimmer channel or
// a wash that must hold a look can sit out an effect without being unpatched.
//
// `epoch` is WHERE the beat is, as opposed to bpm, which is only how fast it goes. Tap
// set the rate and nothing ever said which moment was a downbeat, so every effect and
// every wave ran on a grid anchored at 1970 — correct tempo, arbitrary phase, and a chase
// that "syncs" to the music by coincidence roughly never. 0 keeps the old anchor exactly,
// so a show file from before this existed renders frame for frame as it did.
const DEFAULT_FX = { mode: 'none', bpm: 120, depth: 255, enabled: false, spatial: 'patch', exclude: [], epoch: 0 };
// Four beats to the bar. Not configurable yet, and named rather than left as a 4 in three
// files: when a 3/4 show turns up, this is the one line that has to learn about it.
const BEATS_PER_BAR = 4;

// Where `now` sits on the tempo grid. One answer, shared by quantised firing, the chase
// and anything else that has to land ON the music rather than near it.
function beatGrid(fx, now) {
  const bpm = Math.max(20, Math.min(300, (fx && fx.bpm | 0) || 120));
  const beatMs = 60000 / bpm;
  const epoch = fx && Number.isFinite(+fx.epoch) ? +fx.epoch : 0;
  const since = now - epoch;
  const beats = since / beatMs;
  const intoBeat = ((beats % 1) + 1) % 1;
  const intoBar = ((beats % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  return {
    bpm, beatMs, epoch,
    beat: Math.floor(beats),
    intoBeat,
    // How long until the next one lands. Exactly on a boundary counts as "now", not as a
    // whole beat away — a press that arrives on the beat must not wait for the next.
    nextBeatMs: intoBeat === 0 ? 0 : (1 - intoBeat) * beatMs,
    nextBarMs: intoBar === 0 ? 0 : (BEATS_PER_BAR - intoBar) * beatMs,
  };
}
// 'x' sweeps left to right across the stage arrangement, 'x-' right to left; same pair
// for y and for radial (out from the middle / in toward it). Both directions exist
// because every desk-grade FX engine has a direction switch, and because her chain zig-
// zags through the room — patch order and geometry disagree, which is the whole reason
// these modes exist.
const FX_SPATIAL = ['patch', 'x', 'x-', 'y', 'y-', 'radial', 'radial-'];

// The one set of clamps for an FX config, shared by POST /api/fx and by editing a saved
// scene's fx — a value that gets into EITHER place has been through here, so a scene can
// never smuggle in a bpm the live route would have refused. `patch` is merged over
// `current`: fields absent from the patch keep their current value, exactly the way the
// live route always behaved.
function sanitizeFxPatch(current, patch) {
  const cur = current || DEFAULT_FX;
  const p = patch || {};
  return {
    mode: FX_MODES.includes(p.mode) ? p.mode : (FX_MODES.includes(cur.mode) ? cur.mode : 'none'),
    bpm: p.bpm != null ? Math.max(20, Math.min(300, p.bpm | 0)) : cur.bpm,
    depth: p.depth != null ? Math.max(0, Math.min(255, p.depth | 0)) : cur.depth,
    enabled: p.enabled != null ? !!p.enabled : !!cur.enabled,
    spatial: FX_SPATIAL.includes(p.spatial) ? p.spatial : (cur.spatial || 'patch'),
    // A tap says "this instant is a beat". Anything else leaves the anchor where it was.
    epoch: p.epoch != null && Number.isFinite(+p.epoch) ? Math.max(0, +p.epoch) : (+cur.epoch || 0),
    // Replaced whole, never merged: the list IS the setting.
    exclude: Array.isArray(p.exclude)
      ? p.exclude.filter((s) => typeof s === 'string' && s).slice(0, 20).map((s) => s.slice(0, 40))
      : [...(Array.isArray(cur.exclude) ? cur.exclude : [])],
  };
}

const TAU = Math.PI * 2;

// Triangle wave over an 8-bit phase: up for the first half, down for the second.
function tri8(phase) {
  const p = phase & 255;
  return p < 128 ? p * 2 : (255 - p) * 2;
}

// Depth is a FLOOR under the effect, not a mix into it: at depth 0 every mode returns 255
// and the rig is left exactly as it was, at 255 the effect swings the whole way to black.
// That is what lets depth be swept live — the look never jumps at either end of the fader.
function fxApplyDepth(level, depth) {
  const d = Math.max(0, Math.min(255, depth | 0));
  return (255 - d) + Math.floor((level * d + 127) / 255);
}

// The firmware's 32-bit mixer, kept rather than Math.random because sparkle and glitch
// have to be reproducible: the same millisecond gives the same flicker every time, which
// is the only reason a random-looking effect can be tested at all. `>>> 0` after every
// step is what keeps it 32-bit; without it Math.imul's sign leaks into the next shift.
function fxHash(x) {
  let h = x >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// The tail behind a chase or comet head, four lanes long. The curve is steep on purpose:
// an even ramp reads as a smear rather than as a head with something following it.
function tailLevel(dist, lanes = 8) {
  if (dist === 0) return 255;
  // Few lanes = few slots of her arrangement (two rows, three columns): a long tail would
  // keep every slot lit and the step would not read. Two lanes: a clean flip; three: a
  // short tail.
  if (lanes <= 2) return 0;
  if (lanes === 3) return dist === 1 ? 90 : 0;
  if (dist === 1) return 190;
  if (dist === 2) return 110;
  if (dist === 3) return 52;
  return 0;
}

// Which lane of an effect a fixture sits in. The firmware cut a fixed 512-channel universe
// into equal blocks; a rig has however many fixtures it has, so the lanes are spread ACROSS
// the rig instead of being carved off the front of it. A rig with fewer fixtures than lanes
// would otherwise sit entirely in the low lanes and go dark for the rest of every sweep —
// a comet that crosses the stage and then vanishes for as long again.
function fxLane(i, n, lanes) {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(lanes - 1, Math.floor((i * lanes) / n)));
}

// Effects step along the rig in patch order — universe, then address — because that is the
// order the fixtures are numbered on the desk and, on nearly every rig, the order they are
// hung in. Stage position is deliberately not used for the ordering: dragging a fixture on
// the stage view to tidy the picture would silently reverse a chase. Radar is the one mode
// that does want the geometry, and it reads x/y directly.
function fxOrder(fixtures) {
  const sorted = [...fixtures].sort((a, b) =>
    (a.universe - b.universe)
    || (a.address - b.address)
    || String(a.id).localeCompare(String(b.id)));
  const order = new Map();
  sorted.forEach((f, i) => order.set(f.id, i));
  return order;
}

function fxActive(fx) {
  return !!fx && !!fx.enabled && fx.mode !== 'none' && FX_MODES.includes(fx.mode);
}

// The whole engine: fixture `i` of `n`, at millisecond `now`, gets a 0..255 multiplier.
// 255 means "leave this fixture alone", which is what every path returns when there is no
// effect running — so the caller never has to ask whether FX is on before multiplying.
// Where a fixture sits in the effect, 0..1. 'patch' is the old behaviour: position in
// the address-sorted rig. The rest read the stage arrangement, so the same chase
// becomes a line travelling across the room she just laid out — dragging a fixture on
// the stage MOVES it inside the effect, which is exactly what she asked the stage for.
// `bounds` ({x0, x1, y0, y1}, the patched rig's own extent) is optional. Without it the
// axes are the full -1..2 world, which is fine for a rig spread across the stage and
// useless for a compact one: five pars within 0.3 of each other all landed in ONE of
// eight chase lanes and flashed together instead of travelling (2026-09-18, her rave
// rig). With it, the rig's leftmost fixture is 0 and its rightmost is 1, whatever the
// zoom. An axis the rig does not span (a single column for 'x') puts everyone at 0.5.
function fxPhase(fx, fixture, i, n, bounds) {
  const raw = FX_SPATIAL.includes(fx.spatial) ? fx.spatial : 'patch';
  const rev = raw.endsWith('-');
  const mode = rev ? raw.slice(0, -1) : raw;
  const flip = (p) => (rev ? 1 - p : p);
  if (mode === 'patch' || !fixture) return flip(n <= 1 ? 0 : i / (n - 1));
  // Her arrangement, stepped evenly (studio, 2026-09-24): lights roughly in line share a
  // slot, and the slots are spaced evenly whatever the gaps between them — so Left → right
  // on two rows of four is column 1, 2, 3, 4 on the beat, and Top → bottom is front row,
  // back row. Without this her 4 columns fell on lanes 0, 2, 5 and 7 of the chase's 8: a
  // lopsided rhythm, and the two rows sat seven steps apart one way and one step the other.
  const slot = bounds && bounds.slots && fxSlotOf(mode, fixture, bounds);
  if (slot) return (rev ? slot.count - 1 - slot.index : slot.index) / slot.count;
  const norm = (v, lo, hi) => (hi - lo < 1e-3 ? 0.5 : (v - lo) / (hi - lo));
  const nx = bounds ? norm(+fixture.x || 0, bounds.x0, bounds.x1) : ((+fixture.x || 0) + 1) / 3;
  const ny = bounds ? norm(+fixture.y || 0, bounds.y0, bounds.y1) : ((+fixture.y || 0) + 1) / 3;
  if (mode === 'x') return flip(Math.max(0, Math.min(1, nx)));
  if (mode === 'y') return flip(Math.max(0, Math.min(1, ny)));
  // radial: 0 at the centre, growing outward. Against the world it reaches 1 at the
  // corners of the full -1..2 world; against the rig's bounds, at the rig's own corners.
  const dx = nx - 0.5, dy = ny - 0.5;
  return flip(Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) / (bounds ? Math.SQRT1_2 : 0.5))));
}

// The extent of the fixtures an effect runs over, for fxPhase. Null for none.
function fxBounds(fixtures) {
  if (!fixtures || !fixtures.length) return null;
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const f of fixtures) {
    const x = +f.x || 0, y = +f.y || 0;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
  }
  b.slots = fxFindSlots(fixtures, b);
  return b;
}

// The coordinate each Follow mode steps along, normalised to the rig: 0..1 across x or y,
// and for radial the distance from the rig's centre over the farthest light's.
function fxAxis(mode, fixture, b) {
  const norm = (v, lo, hi) => (hi - lo < 1e-3 ? 0.5 : (v - lo) / (hi - lo));
  const nx = norm(+fixture.x || 0, b.x0, b.x1), ny = norm(+fixture.y || 0, b.y0, b.y1);
  if (mode === 'x') return nx;
  if (mode === 'y') return ny;
  return Math.hypot(nx - 0.5, ny - 0.5);
}

// Group the lights into slots per axis: sort the coordinate and start a new slot at every
// gap wider than the tolerance. The tolerance shrinks with the rig (0.6 / count, capped at
// 0.12) so hand-placed rows that wobble by a few pixels are one row, while a ring of twenty
// lamps still gets a slot each. Each slot is stored by its centre.
function fxFindSlots(fixtures, b) {
  const tol = Math.min(0.12, 0.6 / Math.max(1, fixtures.length));
  const out = {};
  for (const mode of ['x', 'y', 'radial']) {
    let vals = fixtures.map((f) => fxAxis(mode, f, b)).sort((p, q) => p - q);
    if (mode === 'radial') { const m = vals[vals.length - 1] || 1; vals = vals.map((v) => v / (m || 1)); }
    const centres = [];
    let run = [];
    for (const v of vals) {
      if (run.length && v - run[run.length - 1] > tol) { centres.push(run.reduce((p, q) => p + q, 0) / run.length); run = []; }
      run.push(v);
    }
    if (run.length) centres.push(run.reduce((p, q) => p + q, 0) / run.length);
    out[mode] = { centres, max: mode === 'radial' ? (fixtures.reduce((m, f) => Math.max(m, fxAxis('radial', f, b)), 0) || 1) : 1 };
  }
  return out;
}

// Which slot a fixture sits in along a Follow mode, and how many there are. Null when the
// rig has one slot only (nothing to step through) — callers then fall back to the old maths.
function fxSlotOf(mode, fixture, b) {
  const sl = b.slots[mode];
  if (!sl || sl.centres.length < 2) return null;
  const v = fxAxis(mode, fixture, b) / sl.max;
  let best = 0;
  for (let k = 1; k < sl.centres.length; k++) {
    if (Math.abs(sl.centres[k] - v) < Math.abs(sl.centres[best] - v)) best = k;
  }
  return { index: best, count: sl.centres.length };
}

// How many lanes a stepped mode should use: its own fixed count, or — when Follow steps
// through her arrangement — exactly one lane per slot, so every step lands on a slot.
function fxLanes(fx, bounds, base) {
  const raw = FX_SPATIAL.includes(fx.spatial) ? fx.spatial : 'patch';
  const mode = raw.endsWith('-') ? raw.slice(0, -1) : raw;
  if (mode === 'patch' || !bounds || !bounds.slots || !bounds.slots[mode]) return base;
  const count = bounds.slots[mode].centres.length;
  return count >= 2 ? Math.min(base, count) : base;
}

function fxLevel(fx, fixture, i, n, now, bounds) {
  if (!fxActive(fx)) return 255;
  const depth = fx.depth == null ? 255 : fx.depth;
  const bpm = Math.max(20, Math.min(300, (fx.bpm | 0) || 120));
  const beatMs = Math.max(1, Math.floor(60000 / bpm));
  // Stepped modes read tq (frame-quantised); continuous modes read t. Quantising costs a
  // continuous mode nothing at 40 Hz, but the stepped modes need their edges ON the grid.
  const t = Math.floor(now);
  const tq = Math.floor(t / FRAME_MS) * FRAME_MS;

  switch (fx.mode) {
    case 'strobe': {
      // Eight flashes to the beat, on for a third of each. The floors are whole frames:
      // one frame on, one frame off is the fastest strobe the 40 Hz loop can carry.
      const slice = Math.max(FRAME_MS * 2, Math.floor(beatMs / 8 / FRAME_MS) * FRAME_MS);
      const on = (tq % slice) < Math.max(FRAME_MS, Math.floor(slice / 3 / FRAME_MS) * FRAME_MS);
      return fxApplyDepth(on ? 255 : 0, depth);
    }
    case 'chase': {
      const lanes = fxLanes(fx, bounds, 8);
      const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) % lanes;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      return fxApplyDepth(tailLevel((lane + lanes - active) % lanes, lanes), depth);
    }
    case 'pulse': {
      // A triangle, squared. The square is the whole effect: it makes the peak short and
      // the bottom long, so it breathes instead of ticking like a metronome.
      const phase = Math.floor(((t % beatMs) * 255) / beatMs);
      const level = tri8(phase);
      return fxApplyDepth((level * level + 255) >> 8, depth);
    }
    case 'sine': {
      const lanes = 16;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      // The 8-bit wrap here is the point: 16 of phase per lane is a sixteenth of a cycle,
      // so the wave travels along the rig rather than every fixture pumping in unison.
      const phase = (Math.floor(((t % beatMs) * 255) / beatMs) + lane * 16) & 255;
      return fxApplyDepth(tri8(phase), depth);
    }
    case 'sparkle': {
      // Sixteen draws to the beat, per fixture, so neighbours never fire together.
      const slot = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 16)));
      const r = fxHash((((i + 1) << 16) ^ slot) >>> 0) & 0x1f;
      return fxApplyDepth(r < 2 ? 255 : r < 5 ? 150 : r < 9 ? 58 : 0, depth);
    }
    case 'comet': {
      // Chase with twice the lanes and twice the speed: the same tail crossing a finer
      // grid, which is what makes it read as one thing moving instead of lamps stepping.
      const lanes = fxLanes(fx, bounds, 16);
      const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 4))) % lanes;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      return fxApplyDepth(tailLevel((lane + lanes - active) % lanes, lanes), depth);
    }
    case 'bars': {
      // One lane per slot, or neighbouring columns would share a parity and flip together.
      const lanes = fxLanes(fx, bounds, 16);
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      const flip = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) & 1;
      // The off half sits at 18 rather than 0 so the rig stays legible between flips —
      // a hard alternation to black reads as half the lights having failed.
      return fxApplyDepth((lane & 1) === flip ? 255 : 18, depth);
    }
    case 'glitch': {
      const lanes = 16;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      const slot = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 20)));
      const r = fxHash((slot ^ Math.imul(lane, 0x45d9f3b)) >>> 0) & 0x0f;
      return fxApplyDepth(r < 3 ? 255 : r < 6 ? 0 : r < 9 ? 115 : 32, depth);
    }
    case 'radar': {
      // The one mode that cares where the fixture actually is. The firmware had 0..255
      // stage coordinates and this desk has 0..1, but the beam only asks for the angle
      // from the middle of the stage and an angle does not care about the scale.
      // Round the rig's own centre when the bounds are known — the stage's (0.5, 0.5) sat
      // off to one side of her studio rig, so the beam swept past it lopsidedly.
      const cx = bounds ? (bounds.x0 + bounds.x1) / 2 : 0.5;
      const cy = bounds ? (bounds.y0 + bounds.y1) / 2 : 0.5;
      const dx = (fixture && fixture.x != null ? +fixture.x : 0.5) - cx;
      const dy = (fixture && fixture.y != null ? +fixture.y : 0.5) - cy;
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += TAU;
      const sweep = ((t % beatMs) / beatMs) * TAU;
      let diff = Math.abs(ang - sweep);
      if (diff > Math.PI) diff = TAU - diff;
      // 0.28 rad of beam either side of the line, about 16°. Tuned by eye and it is a
      // trade: narrower and the sweep flickers between fixtures at frame rate, wider and
      // it stops reading as a beam and becomes a wash going round.
      const level = 1 - Math.min(1, diff / 0.28);
      return fxApplyDepth(Math.min(255, Math.floor(level * 255)), depth);
    }
    case 'pump': {
      // The techno pump: full hit on the beat, quadratic decay to black before the next.
      // Quadratic because a linear decay reads as a fade; the square keeps the hit hard.
      const p = (t % beatMs) / beatMs;
      const level = Math.floor(255 * (1 - p) * (1 - p));
      return fxApplyDepth(level, depth);
    }
    case 'breathe': {
      // One smooth swell over four beats, whole rig in unison. The slow sibling of pulse
      // for floors that need to sit down without going static.
      const period = beatMs * 4;
      const p = (t % period) / period;
      const level = Math.floor(((1 - Math.cos(p * TAU)) / 2) * 255);
      return fxApplyDepth(level, depth);
    }
    case 'fade': {
      // Smooth on and off, like an eye, as one endless loop (2026-09-18, her ask). The
      // first cut rested at full and at black and she found it stop-start ("make it
      // smoother and loopy"), so there are no holds: a raised cosine over twelve beats,
      // always moving, never a corner. It is then put through a 2.2 power curve, because
      // the eye is logarithmic — a plain cosine of DMX values looks bright for most of the
      // cycle and then drops off a cliff near black. Perceptually even instead.
      // Unlike breathe it rolls across the rig: each fixture is offset along Follow by up to
      // two thirds of a cycle, so first, middle and last sit evenly round the loop and the
      // glow travels round and round. Half a cycle looked wrong: the two ends were exact
      // opposites, which reads as left/right ping-pong, not a loop.
      const period = beatMs * 12;
      const lag = fxPhase(fx, fixture, i, n, bounds) * (2 / 3);
      const p = ((t % period) / period + 1 - lag) % 1;
      const open = (1 - Math.cos(p * TAU)) / 2;
      return fxApplyDepth(Math.round(Math.pow(open, 2.2) * 255), depth);
    }
    case 'pingpong': {
      // A comet head that bounces end to end instead of wrapping — triangle position over
      // two beats, same tail curve as chase so the head stays a head.
      const lanes = fxLanes(fx, bounds, 16);
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n, bounds) * lanes));
      const period = beatMs * 2;
      const p = (tq % period) / period;
      const head = Math.round((p < 0.5 ? p * 2 : (1 - p) * 2) * (lanes - 1));
      return fxApplyDepth(tailLevel(Math.abs(lane - head), lanes), depth);
    }
    case 'blocks': {
      // Five blocks of the rig flip on and off each beat, half of them lit at a time on
      // average. Chunky where sparkle is fine-grained; reads as architecture, not noise.
      const groups = 5;
      const g = fxLane(Math.floor(fxPhase(fx, fixture, i, n, bounds) * (n - 1 || 1)), n, groups);
      const slot = Math.floor(tq / Math.max(FRAME_MS * 2, beatMs));
      const on = (fxHash((((g + 1) << 20) ^ slot) >>> 0) & 3) < 2;
      return fxApplyDepth(on ? 255 : 24, depth);
    }
    default:
      return 255;
  }
}

module.exports = {
  FX_MODES, FX_SPATIAL, DEFAULT_FX, FRAME_MS,
  fxActive, fxOrder, fxLevel, fxPhase, fxBounds, fxLanes, sanitizeFxPatch, beatGrid, BEATS_PER_BAR,
  fxApplyDepth, fxLane, fxHash, tailLevel, tri8,
};
