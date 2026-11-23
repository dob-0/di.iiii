'use strict';
// Stage objects — shapes placed on the stage view that light the fixtures they pass over
// (her ask, 2026-09-24: "put the object, for example the line or radar, on the preview
// and it will affect the light").
//
// This file is the ONE geometry for both sides. The server's engine requires it to render
// DMX (the server is authoritative, 40Hz, nothing depends on a browser being open), and
// the page loads the very same file to draw the shapes where the engine thinks they are.
// Two copies of this maths would drift, and a radar drawn a few degrees away from the
// lights it is actually lighting is the "correct code, person can't tell" bug again.
// That is why it lives in ui/ and the engine reaches in for it.
//
// Coordinates are the stage world, the same x/y as fixtures (most rigs sit in -1..2; the
// position is clamped to ±WORLD, the bound desk.js puts on a fixture). The stage view maps
// both axes with ONE scale, so a circle here is a circle on screen and an angle here is
// the angle she sees. Angles are degrees, clockwise on screen (y points down).
//
// An object is a MASK over the current look: a light inside it plays the look at the
// look's own brightness, a light outside falls to the object's floor (255 - depth; the
// default depth 255 is fully dark). Several objects: the brightest wins. Colour always
// comes from the look — a radar over "Sunset" sweeps sunset colours round the room.
//
// Animation (2026-09-24, her ask: "make it possible to animate — more control on the
// objects"). Every object runs on ONE cycle — `beats` on the desk's BPM, or `secs` — and
// the cycle position is shaped before the kind uses it:
//   motion    auto = the kind's own movement (line sweeps, radar turns, ring grows, spot
//             stands); move = the object travels from A (x, y) to B (bx, by) instead
//   dir       forward | reverse | pingpong      ease   linear | smooth | bounce
//   phase     0..1 offset, so several objects stagger (a start delay when it runs once)
//   loop      true = round and round; false = once, from t0 (Play, or a scene recall)
//   paused    holds at `hold` (0..1 of the cycle); Play carries on from there
//   spin      degrees per cycle added to the angle; pulse 0..1 breathes the size
// An object saved before any of this has none of these fields and moves exactly as it did:
// the defaults (auto, the kind's own direction — a line's sweep is there-and-back — linear,
// phase 0, loop, t0 0) reproduce the old maths to the number.
(function (root) {
  const OBJECT_KINDS = ['line', 'radar', 'ring', 'spot'];
  const MAX_OBJECTS = 8;
  // How far the radar's afterglow trails its beam, in degrees.
  const RADAR_TAIL = 90;
  // size: line = how far it travels each side of its centre; radar = reach; ring = the
  //       widest it grows; spot = radius.
  // width: line/ring = band thickness; spot = soft edge; radar = beam width in DEGREES.
  // beats: one full cycle (line there-and-back, radar turn, ring growth), 0 = still.
  const KIND_DEFAULTS = {
    line:  { size: 0.3, width: 0.12, beats: 8, angle: 90 },
    radar: { size: 0.5, width: 30, beats: 8, angle: 0 },
    ring:  { size: 0.5, width: 0.12, beats: 4, angle: 0 },
    spot:  { size: 0.12, width: 0.06, beats: 0, angle: 0 },
  };
  const WIDTH_RANGE = { line: [0.01, 1], radar: [2, 180], ring: [0.01, 1], spot: [0, 1] };
  const KIND_LABEL = { line: 'Line', radar: 'Radar', ring: 'Ring', spot: 'Spot' };
  const MOTIONS = ['auto', 'move'];
  const DIRS = ['forward', 'reverse', 'pingpong'];
  const EASES = ['linear', 'smooth', 'bounce'];
  const TIMINGS = ['beats', 'secs'];
  // A kind's own direction when none is chosen: the line has always gone there and back.
  const KIND_DIR = { line: 'pingpong', radar: 'forward', ring: 'forward', spot: 'forward' };
  const TAU = Math.PI * 2;
  // Where an object may stand: anywhere a fixture may (desk.js WORLD).
  const WORLD = 1000;

  const num = (v, lo, hi, dflt) => {
    const n = +v;
    return v !== null && v !== '' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const smoothstep = (e0, e1, x) => {
    if (e1 <= e0) return x < e0 ? 0 : 1;
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const wrap360 = (a) => ((a % 360) + 360) % 360;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const frac = (x) => x - Math.floor(x);
  const cleanName = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 40);

  // The one validator for an object list — the live route, show-file load and scenes all
  // come through here. Returns null for "not a list" so a route can refuse it by name.
  function sanitizeObjects(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    const seen = new Set();
    for (const o of list) {
      if (out.length >= MAX_OBJECTS) break;
      if (!o || !OBJECT_KINDS.includes(o.kind)) continue;
      const d = KIND_DEFAULTS[o.kind];
      let id = typeof o.id === 'string' && o.id ? o.id.slice(0, 40)
        : 'ob' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      while (seen.has(id)) id = id.slice(0, 34) + Math.random().toString(36).slice(2, 6);
      seen.add(id);
      const [wlo, whi] = WIDTH_RANGE[o.kind];
      const x = num(o.x, -WORLD, WORLD, 0.5), y = num(o.y, -WORLD, WORLD, 0.5);
      out.push({
        id, kind: o.kind,
        name: cleanName(o.name),
        x, y,
        angle: wrap360(num(o.angle, -1e6, 1e6, d.angle)),
        size: num(o.size, 0.01, 3, d.size),
        width: num(o.width, wlo, whi, d.width),
        beats: Math.round(num(o.beats, 0, 64, d.beats)),
        depth: Math.round(num(o.depth, 0, 255, 255)),
        on: o.on !== false,
        // animation (all optional; the defaults are the old behaviour)
        motion: MOTIONS.includes(o.motion) ? o.motion : 'auto',
        bx: num(o.bx, -WORLD, WORLD, x),
        by: num(o.by, -WORLD, WORLD, y),
        timing: TIMINGS.includes(o.timing) ? o.timing : 'beats',
        secs: Math.round(num(o.secs, 0, 600, 4) * 10) / 10,
        dir: DIRS.includes(o.dir) ? o.dir : KIND_DIR[o.kind],
        ease: EASES.includes(o.ease) ? o.ease : 'linear',
        phase: num(o.phase, 0, 1, 0),
        loop: o.loop !== false,
        paused: o.paused === true,
        hold: num(o.hold, 0, 1, 0),
        t0: num(o.t0, 0, 1e13, 0),
        spin: num(o.spin, -1440, 1440, 0),
        pulse: num(o.pulse, 0, 1, 0),
      });
    }
    return out;
  }

  // ---- the cycle ------------------------------------------------------------------------
  // How long one cycle takes, in ms, or null when the thing stands still. Anything with
  // {timing, beats, secs} works — the video box's animation uses the same clock.
  function cycleMs(a, bpm) {
    if (!a) return null;
    if (a.timing === 'secs') return a.secs > 0 ? a.secs * 1000 : null;
    if (!a.beats) return null;
    const b = Math.max(20, Math.min(300, (bpm | 0) || 120));
    return a.beats * 60000 / b;
  }

  // Where in its cycle a thing is at `now`, 0..1, or null when it stands still. Absolute
  // time from t0, like the FX: every client and the engine agree without being told, as
  // long as they agree on the time. Paused = held at `hold`. Once = runs 0 → 1 from t0
  // (after a `phase` delay) and then stays at the end.
  function animRaw(a, bpm, now) {
    const cycle = cycleMs(a, bpm);
    if (cycle == null) return null;
    if (a.paused) return clamp01(+a.hold || 0);
    const since = now - (+a.t0 || 0);
    if (a.loop === false) return clamp01(since / cycle - (+a.phase || 0));
    const base = ((since % cycle) + cycle) % cycle / cycle;   // the old maths exactly
    return a.phase ? frac(base + a.phase) : base;
  }
  const objectPhase = (o, bpm, now) => animRaw(o, bpm, now);

  function easeBounce(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }
  const EASE_FN = {
    linear: (t) => t,
    smooth: (t) => t * t * (3 - 2 * t),
    bounce: easeBounce,
  };
  // The cycle position shaped into progress 0..1: direction first, then easing.
  function shape(raw, dir, ease) {
    let p = clamp01(raw);
    if (dir === 'reverse') p = 1 - p;
    else if (dir === 'pingpong') p = p < 0.5 ? p * 2 : 2 - p * 2;
    return (EASE_FN[ease] || EASE_FN.linear)(p);
  }

  // Where the object is at `now`: everything the mask and the drawing both need.
  function objectPose(o, bpm, now) {
    const raw = animRaw(o, bpm, now);
    const dir = DIRS.includes(o.dir) ? o.dir : KIND_DIR[o.kind];
    const q = raw == null ? null : shape(raw, dir, o.ease);
    const move = o.motion === 'move';
    const bx = o.bx != null ? +o.bx : o.x, by = o.by != null ? +o.by : o.y;
    const pose = {
      phase: raw, q,
      cx: move && q != null ? o.x + (bx - o.x) * q : o.x,
      cy: move && q != null ? o.y + (by - o.y) * q : o.y,
      // pulse breathes the size once per cycle, never to nothing
      size: o.size * (raw != null && o.pulse ? Math.max(0.05, 1 + o.pulse * Math.sin(raw * TAU)) : 1),
    };
    const angle = o.angle + (raw != null && o.spin ? o.spin * raw : 0);
    const a = angle * Math.PI / 180;
    if (o.kind === 'line') {
      // `angle` is the direction the line runs; it travels along its normal. The old sweep
      // is the default direction (there and back, at a steady speed — a cosine lingered at
      // each end and gave the room's edges twice the light of the middle). The default
      // upright line (90°) sets off from the LEFT; turned 180° it sets off from the right.
      pose.dx = Math.cos(a); pose.dy = Math.sin(a);
      pose.nx = -Math.sin(a); pose.ny = Math.cos(a);
      pose.offset = move || q == null ? 0 : pose.size * (1 - 2 * q);
    } else if (o.kind === 'radar') {
      pose.theta = wrap360(angle + (move || q == null ? 0 : q * 360));   // the leading edge
    } else if (o.kind === 'ring') {
      pose.r = move || q == null ? pose.size : pose.size * q;
      // The last quarter of the growth fades out, so the restart at the centre is not a
      // hard pop from a big ring to nothing. Ping-pong never pops, so it never fades.
      pose.fade = move || q == null || dir === 'pingpong' ? 1 : Math.min(1, (1 - q) * 4);
    } else {
      pose.r = pose.size;
    }
    return pose;
  }

  // 0..1: how much of the look a light at (x, y) gets from this object.
  function objectMask(o, pose, x, y) {
    const px = x - pose.cx, py = y - pose.cy;
    if (o.kind === 'line') {
      const d = Math.abs(px * pose.nx + py * pose.ny - pose.offset);
      return 1 - smoothstep(o.width / 2, o.width, d);
    }
    const dist = Math.hypot(px, py);
    if (o.kind === 'radar') {
      const R = pose.size;
      if (dist > R * 1.08 + 0.01) return 0;
      const reach = 1 - smoothstep(R, R * 1.08 + 0.01, dist);
      if (dist < 0.02) return reach;          // the hub is always inside the beam
      const phi = Math.atan2(py, px) * 180 / Math.PI;
      const behind = wrap360(pose.theta - phi);   // degrees since the leading edge passed it
      let m;
      if (behind <= o.width) m = 1;
      else if (behind < o.width + RADAR_TAIL) { const t = 1 - (behind - o.width) / RADAR_TAIL; m = t * t; }
      else if (behind > 356) m = (behind - 356) / 4;   // a 4° soft leading edge
      else m = 0;
      return m * reach;
    }
    if (o.kind === 'ring') {
      return (1 - smoothstep(o.width / 2, o.width, Math.abs(dist - pose.r))) * pose.fade;
    }
    return 1 - smoothstep(pose.r, pose.r + o.width, dist);   // spot
  }

  // Once a frame: the poses of the objects that are on, or null when none are — the
  // renderer then skips the whole layer and every light is exactly what it was.
  function objectsFrame(objects, bpm, now) {
    if (!Array.isArray(objects)) return null;
    const on = objects.filter((o) => o && o.on !== false);
    if (!on.length) return null;
    return on.map((o) => ({ o, pose: objectPose(o, bpm, now) }));
  }

  // 0..255 multiplier for a light at (x, y): each object's floor + depth × mask, and the
  // brightest object wins. Same contract as fxLevel: 255 means untouched.
  function objectsLevelAt(frame, x, y) {
    if (!frame) return 255;
    let best = 0;
    for (const { o, pose } of frame) {
      const lvl = (255 - o.depth) + o.depth * objectMask(o, pose, x, y);
      if (lvl > best) best = lvl;
    }
    return Math.max(0, Math.min(255, Math.round(best)));
  }

  // ---- play / pause / restart — the fields to post, worked out on the desk's clock --------
  // Pause: hold where it is now. Play: carry on from the hold (a finished once-run starts
  // over). Restart: from the top now. Nothing here writes; the caller posts the patch.
  function pauseFields(a, bpm, now) {
    const raw = animRaw({ ...a, paused: false }, bpm, now);
    return { paused: true, hold: raw == null ? 0 : raw };
  }
  function playFields(a, bpm, now) {
    const cycle = cycleMs(a, bpm);
    if (cycle == null) return { paused: false };
    if (a.loop === false) {
      const at = a.paused ? clamp01(+a.hold || 0) : animRaw(a, bpm, now);
      if (!a.paused || at >= 1) return { paused: false, t0: now };   // once: play = from the top
      return { paused: false, t0: now - (at + (+a.phase || 0)) * cycle };
    }
    if (!a.paused) return { paused: false };
    return { paused: false, t0: now - frac((+a.hold || 0) - (+a.phase || 0)) * cycle };
  }
  const restartFields = (a, now) => ({ paused: false, t0: now });
  // A scene recall starts every run-once object from the top (the engine calls this).
  function restartOnce(objects, now) {
    return (objects || []).map((o) => (o && o.loop === false ? { ...o, paused: false, t0: now } : o));
  }

  // "Line 2": the name she gave it, else the kind and its number among its own kind.
  function objectName(o, list) {
    if (o && o.name) return o.name;
    const same = (list || []).filter((x) => x && x.kind === o.kind);
    const i = same.indexOf(o);
    return `${KIND_LABEL[o.kind] || 'Object'} ${i >= 0 ? i + 1 : same.length + 1}`;
  }

  const api = {
    OBJECT_KINDS, MAX_OBJECTS, KIND_DEFAULTS, WIDTH_RANGE, RADAR_TAIL, KIND_LABEL, KIND_DIR,
    MOTIONS, DIRS, EASES, TIMINGS,
    sanitizeObjects, objectPhase, objectPose, objectMask, objectsFrame, objectsLevelAt,
    cycleMs, animRaw, shape, EASE_FN, pauseFields, playFields, restartFields, restartOnce, objectName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ObjCore = api;
})(typeof window !== 'undefined' ? window : this);
