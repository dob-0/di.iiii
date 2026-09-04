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
  'pump', 'breathe', 'pingpong', 'blocks'];

// The output loop pushes frames at 40 Hz. Any transition faster than one frame falls
// between pushes and never reaches the wire, so every stepped mode below quantises its
// clock to the frame grid and floors its step at a whole number of frames. Without this,
// a fast strobe's 6ms on-window lands between two 25ms frames and the rig just dims.
const FRAME_MS = 25;

// `exclude` is a list of profile NAMES the effects never touch: the render path gives any
// fixture patched on one of them a flat 255 multiplier, so a hazer on a dimmer channel or
// a wash that must hold a look can sit out an effect without being unpatched.
const DEFAULT_FX = { mode: 'none', bpm: 120, depth: 255, enabled: false, spatial: 'patch', exclude: [] };
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
function tailLevel(dist) {
  if (dist === 0) return 255;
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

// How many bands a mode cuts the rig into when a band is meant to be about one fixture
// wide — bars, and anything else whose whole reading is "this one, not that one". A fixed
// count is wrong at both ends: 16 lanes over 8 pars puts every par in its own lane with an
// EMPTY lane between each pair, and 16 lanes over 200 pixels is a comb nobody can see.
function fxLanes(n, cap) {
  return Math.max(2, Math.min(cap, Math.floor(n) || 2));
}

// Which of `lanes` positions along the rig a fixture stands on. Rounding, not flooring:
// phase 0 must land on the first lane and phase 1 on the last, so the ends of the rig are
// the ends of the effect. Flooring gives the last fixture a lane of its own and squeezes
// everything else down — that is how bars ended up splitting a rig of 8 into two halves
// (lanes 0,2,4,6,9,11,13,15: four even then four odd) instead of alternating.
function fxSlot(phase, lanes) {
  return Math.max(0, Math.min(lanes - 1, Math.round(phase * (lanes - 1))));
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
function fxPhase(fx, fixture, i, n) {
  const raw = FX_SPATIAL.includes(fx.spatial) ? fx.spatial : 'patch';
  const rev = raw.endsWith('-');
  const mode = rev ? raw.slice(0, -1) : raw;
  const flip = (p) => (rev ? 1 - p : p);
  if (mode === 'patch' || !fixture) return flip(n <= 1 ? 0 : i / (n - 1));
  // The ROOM is 0..1 — the square the stage view draws, the square `arrange` lays a grid
  // or a circle into, the square a fixture is dropped onto. That square is the effect.
  //
  // This used to normalise (x + 1) / 3, mapping the old -1..2 margin onto the phase, and
  // it was the single worst thing in this file: a real rig lives inside the room, so an
  // 8-par bar hung across x 0.34..0.83 came out at phase 0.447..0.610 — SIXTEEN per cent
  // of the effect. Every mode that reads a lane then collapsed. Measured on that bar at
  // spatial 'x': chase left the whole rig at zero on 38% of frames, comet on 63%, and
  // bars put all eight pars in three lanes. A fixture dragged out past the wall clamps to
  // it, the way a lamp hung past the end of the truss is still the end of the sweep.
  const nx = Math.max(0, Math.min(1, +fixture.x || 0)), ny = Math.max(0, Math.min(1, +fixture.y || 0));
  if (mode === 'x') return flip(nx);
  if (mode === 'y') return flip(ny);
  // radial: 0 in the middle of the room, 1 at its corners — divided by the corner
  // distance, not by 0.5, or everything outside the inscribed circle saturates at 1 and
  // the four corners of a grid rig all read as the same ring.
  const dx = nx - 0.5, dy = ny - 0.5;
  // Math.SQRT1_2 is sqrt(0.5² + 0.5²): the distance from the middle of the room to a corner.
  return flip(Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2));
}

function fxLevel(fx, fixture, i, n, now) {
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
      const lanes = 8;
      const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) % lanes;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n) * lanes));
      return fxApplyDepth(tailLevel((lane + lanes - active) % lanes), depth);
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
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n) * lanes));
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
      const lanes = 16;
      const active = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 4))) % lanes;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n) * lanes));
      return fxApplyDepth(tailLevel((lane + lanes - active) % lanes), depth);
    }
    case 'bars': {
      // A bar is one fixture wide on a rig small enough for that to read, and grows on a
      // rig big enough that single-fixture stripes would just shimmer. The old fixed 16
      // was the bug: on a rig of 8 the lanes came out 0,2,4,6,9,11,13,15, so fixtures
      // 0-3 were all even and 4-7 all odd and "bars" was the left half and the right half
      // flashing at each other. On 24 it was worse — lanes 0,0,1,2,2,3,4,4,5,… clump in
      // twos and threes, so the stripes came out different widths every time.
      const lanes = fxLanes(n, 32);
      const lane = fxSlot(fxPhase(fx, fixture, i, n), lanes);
      const flip = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 2))) & 1;
      // The off half sits at 18 rather than 0 so the rig stays legible between flips —
      // a hard alternation to black reads as half the lights having failed.
      return fxApplyDepth((lane & 1) === flip ? 255 : 18, depth);
    }
    case 'glitch': {
      const lanes = 16;
      const lane = Math.min(lanes - 1, Math.floor(fxPhase(fx, fixture, i, n) * lanes));
      const slot = Math.floor(tq / Math.max(FRAME_MS, Math.floor(beatMs / 20)));
      const r = fxHash((slot ^ Math.imul(lane, 0x45d9f3b)) >>> 0) & 0x0f;
      return fxApplyDepth(r < 3 ? 255 : r < 6 ? 0 : r < 9 ? 115 : 32, depth);
    }
    case 'radar': {
      // The one mode that cares where the fixture actually is. The firmware had 0..255
      // stage coordinates and this desk has 0..1, but the beam only asks for the angle
      // from the middle of the stage and an angle does not care about the scale — so this
      // one reads x/y raw, unclamped: a fixture hung right out past the wall still has an
      // honest direction from the middle of the room.
      const dx = (fixture && fixture.x != null ? +fixture.x : 0.5) - 0.5;
      const dy = (fixture && fixture.y != null ? +fixture.y : 0.5) - 0.5;
      // Everything below is in TURNS, not radians: one turn is one beat, so a width in
      // turns is a width in time and stays the same fraction of a beat at any bpm.
      const ang = (((Math.atan2(dy, dx) / TAU) % 1) + 1) % 1;
      const sweep = (t % beatMs) / beatMs;
      // The direction switch reaches radar too. It is the only mode that ignores `spatial`
      // for its geometry, but ignoring the DIRECTION as well made the reverse settings a
      // lie: the operator flips to 'radial-' and the beam keeps turning the same way.
      const rev = String(fx.spatial || '').endsWith('-');
      // How long since the beam last crossed this fixture, 0..1 turns.
      const since = (((rev ? ang - sweep : sweep - ang) % 1) + 1) % 1;
      // The beam is never narrower than three frames of the 40 Hz loop. The old width was
      // an absolute 0.28 rad — 4.5% of a turn either side — so its dwell shrank with the
      // tempo: 17ms at 300 bpm, under one 25ms frame, and the sweep stepped clean over
      // fixtures between two pushes. Measured on the 8-par bar at 300 bpm, three of the
      // eight NEVER lit (peak 0) and the rest peaked anywhere from 25 to 228 depending on
      // where a frame happened to fall. With the floor, the nearest frame is always
      // within a third of the half-width of the centre, so every fixture reaches 170+.
      const half = Math.max(0.06, (FRAME_MS * 1.5) / beatMs);
      const head = 1 - Math.min(1, Math.min(since, 1 - since) / half);
      // Phosphor. A radar screen holds the trace after the beam has gone, and here it is
      // the difference between an effect and a stutter: fixtures hung in a ROW all sit in
      // a narrow arc seen from the middle of the room — the 8-par bar spans 1.19 rad,
      // 18.9% of the turn — so a bare beam left the entire rig at DMX 0 for 70-75% of
      // every beat, whatever the tempo. The decay carries the sweep across the gap: same
      // rig, dark 28% of the time, and it reads as something crossing the room.
      const tail = since < 0.45 ? 0.72 * (1 - since / 0.45) : 0;
      return fxApplyDepth(Math.min(255, Math.round(Math.max(head, tail) * 255)), depth);
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
    case 'pingpong': {
      // A comet head that bounces end to end instead of wrapping — triangle position over
      // two beats, same tail curve as chase so the head stays a head.
      // The lane count follows the rig for the same reason bars' does: a fixed 16 over a
      // rig of 8 put the fixtures in lanes 0,2,4,6,9,11,13,15 and left the other eight
      // EMPTY, so on half of every frame the head was standing between two lamps and the
      // bounce stuttered. Worse at tempo — 16 lanes need 32 lane-steps per bounce and a
      // 600ms period only has 24 frames to make them in, so at 200 bpm the head never
      // landed on lanes 2 or 7 at all and the fixture sitting there peaked at 190, never 255.
      const lanes = fxLanes(n, 16);
      const lane = fxSlot(fxPhase(fx, fixture, i, n), lanes);
      const period = beatMs * 2;
      const p = (tq % period) / period;
      const head = Math.round((p < 0.5 ? p * 2 : (1 - p) * 2) * (lanes - 1));
      return fxApplyDepth(tailLevel(Math.abs(lane - head)), depth);
    }
    case 'blocks': {
      // Five blocks of the rig flip on and off each beat, half of them lit at a time on
      // average. Chunky where sparkle is fine-grained; reads as architecture, not noise.
      const groups = 5;
      // Straight from the phase. It used to go phase -> a fixture index -> fxLane, and the
      // round trip through the index quietly threw groups away whenever the phase was not
      // the patch fan: on the 24-fixture rig with spatial 'x' every fixture came back as
      // group 2 — ONE group, so "blocks" was the whole rig flashing in unison on 100% of
      // frames. Direct, it lands in four.
      const g = Math.max(0, Math.min(groups - 1, Math.floor(fxPhase(fx, fixture, i, n) * groups)));
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
  fxActive, fxOrder, fxLevel, fxPhase, sanitizeFxPatch,
  fxApplyDepth, fxLane, fxLanes, fxSlot, fxHash, tailLevel, tri8,
};
