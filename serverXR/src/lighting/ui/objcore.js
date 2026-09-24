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
// That is why it lives in public/ and the engine reaches in for it.
//
// Coordinates are the stage world (-1..2, the same x/y as fixtures). The stage view maps
// both axes with ONE scale, so a circle here is a circle on screen and an angle here is
// the angle she sees. Angles are degrees, clockwise on screen (y points down).
//
// An object is a MASK over the current look: a light inside it plays the look at the
// look's own brightness, a light outside falls to the object's floor (255 - depth; the
// default depth 255 is fully dark). Several objects: the brightest wins. Colour always
// comes from the look — a radar over "Sunset" sweeps sunset colours round the room.
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

  const num = (v, lo, hi, dflt) => {
    const n = +v;
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const smoothstep = (e0, e1, x) => {
    if (e1 <= e0) return x < e0 ? 0 : 1;
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const wrap360 = (a) => ((a % 360) + 360) % 360;

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
      out.push({
        id, kind: o.kind,
        x: num(o.x, -1, 2, 0.5),
        y: num(o.y, -1, 2, 0.5),
        angle: wrap360(num(o.angle, -1e6, 1e6, d.angle)),
        size: num(o.size, 0.01, 3, d.size),
        width: num(o.width, wlo, whi, d.width),
        beats: Math.round(num(o.beats, 0, 64, d.beats)),
        depth: Math.round(num(o.depth, 0, 255, 255)),
        on: o.on !== false,
      });
    }
    return out;
  }

  // 0..1 through the object's cycle on the FX clock, or null when it stands still.
  // Absolute time modulo the cycle, like the FX: every client and the engine agree on the
  // phase without being told it, as long as they agree on the time.
  function objectPhase(o, bpm, now) {
    if (!o.beats) return null;
    const b = Math.max(20, Math.min(300, (bpm | 0) || 120));
    const cycle = o.beats * 60000 / b;
    return (((now % cycle) + cycle) % cycle) / cycle;
  }

  // Where the object is at `now`: everything the mask and the drawing both need.
  function objectPose(o, bpm, now) {
    const phase = objectPhase(o, bpm, now);
    const a = o.angle * Math.PI / 180;
    const pose = { phase, cx: o.x, cy: o.y };
    if (o.kind === 'line') {
      // `angle` is the direction the line runs; it travels along its normal at a steady
      // speed, there and back. (A cosine sweep was tried first: it lingered at each end,
      // and on her rig the outer columns stayed lit a third of the time — the edges of
      // the room got twice the light of the middle.) The default upright line (90°) sets
      // off from the LEFT; turned 180° it sets off from the right, so the rotate handle
      // is also the direction switch.
      pose.dx = Math.cos(a); pose.dy = Math.sin(a);
      pose.nx = -Math.sin(a); pose.ny = Math.cos(a);
      const u = phase == null ? 0.5 : (phase < 0.5 ? phase * 2 : 2 - phase * 2);   // 0 → 1 → 0
      pose.offset = o.size * (1 - 2 * u);
    } else if (o.kind === 'radar') {
      pose.theta = wrap360(o.angle + (phase == null ? 0 : phase * 360));   // the leading edge
    } else if (o.kind === 'ring') {
      pose.r = phase == null ? o.size : o.size * phase;
      // The last quarter of the growth fades out, so the restart at the centre is not a
      // hard pop from a big ring to nothing.
      pose.fade = phase == null ? 1 : Math.min(1, (1 - phase) * 4);
    } else {
      pose.r = o.size;
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
      if (dist > o.size * 1.08 + 0.01) return 0;
      const reach = 1 - smoothstep(o.size, o.size * 1.08 + 0.01, dist);
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
    return 1 - smoothstep(o.size, o.size + o.width, dist);   // spot
  }

  // Once per frame: the poses of the objects that are on, or null when none are — the
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

  const api = {
    OBJECT_KINDS, MAX_OBJECTS, KIND_DEFAULTS, WIDTH_RANGE, RADAR_TAIL,
    sanitizeObjects, objectPhase, objectPose, objectMask, objectsFrame, objectsLevelAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ObjCore = api;
})(typeof window !== 'undefined' ? window : this);
