'use strict';
/* global S, post, say, stageMap, viewOf, snap, snapv, clamp, esc, isTypingTarget, spaceHeld, tool, touchedAt:writable, showPage, objectsPostedAt:writable, ObjCore -- defined by app.js and objcore.js, loaded first */
// Stage objects on the page: the Line / Radar / Ring / Spot buttons, the shapes drawn on
// every stage view, their handles, the list of objects, and the editor for the selected one.
//
// Loaded after app.js and objcore.js, and uses app.js's globals (S, post, say, views,
// viewOf, stageMap, page, snap, snapv, clamp, isTypingTarget). The engine on the server
// does the lighting; this file only shows where each object is and lets her move it —
// the fixture squares already show what the rig is really sending, so she sees the
// object and the lights answering it side by side.
//
// Drawing runs on requestAnimationFrame, on the DESK's clock (see objClockSample), so a
// radar drawn here points where the engine is pointing it. Elements are kept and
// updated in place, never rebuilt per frame: a handle under a captured pointer must not
// be replaced mid-drag.
//
// Easy to catch (her ask, 2026-09-24: "it's hard to select a line — it moves and it's hard
// to catch and delete"): every object is in a LIST (top-right of the small stages, and in
// the Stage page's inspector) — a row click selects it, ✕ deletes it; the selected object
// HOLDS STILL on the preview so its handles can be caught (the lights keep moving unless
// she presses Pause); the hub is always grabbable, above the lights; Tab / Shift+Tab walk
// through the objects when the stage has focus. And animation: one editor (the strip on the
// small stages, the Stage page's inspector) for motion, speed, direction, easing, phase,
// once/loop, spin, pulse and play / pause / restart — all maths in objcore.js.

const OBJ_NS = 'http://www.w3.org/2000/svg';
const OBJ_LABEL = { line: 'Line', radar: 'Radar', ring: 'Ring', spot: 'Spot' };
const OBJ_HINT = {
  line: 'Line — a bar that sweeps across the lights; speed 0 keeps it still so you can drag it by hand',
  radar: 'Radar — a beam turning round its centre, with a fading tail',
  ring: 'Ring — a circle growing out of a point',
  spot: 'Spot — lights what is under it; drag it around by hand',
};
// What "its own movement" is called, per kind.
const OBJ_OWN = { line: 'Sweep', radar: 'Turn', ring: 'Grow', spot: 'Stay' };
const OBJ_ICON = {
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M7 8l-3 4 3 4M17 8l3 4-3 4"/></svg>',
  radar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 12l6.4-6.4"/><path d="M12 12V3"/></svg>',
  ring: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>',
  spot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor" fill-opacity=".35"/></svg>',
};
let objSel = null;            // id of the selected object, or null
let objDrag = null;           // { id, mode: 'move'|'moveA'|'moveB'|'rotate'|'resize', ... } while a handle is held
let objHover = null;          // id of the object whose list row is under the pointer
let objHeld = null;           // { id, now }: the selected object's preview is frozen at `now`
let objSolo = null;           // { id, prev: Map(id → on) } while one object is soloed
const objClock = { skew: 0, best: Infinity, n: 0 };

// ---- the desk's clock ---------------------------------------------------------------
// /api/dmx carries the server's Date.now(). The midpoint of the request is the best guess
// of when it was read; samples from quick round trips are trusted more, and the best RTT
// seen creeps back up so one lucky sample cannot pin the estimate forever.
// eslint-disable-next-line no-unused-vars -- called by app.js pullState with the desk's clock
function objClockSample(serverNow, t0, t1) {
  const rtt = Math.max(0, t1 - t0);
  const skew = serverNow - (t0 + t1) / 2;
  objClock.best = Math.min(objClock.best + 0.5, rtt);
  if (objClock.n === 0) objClock.skew = skew;
  else if (rtt <= objClock.best * 2 + 4) objClock.skew += (skew - objClock.skew) * 0.25;
  objClock.n++;
}
const deskNow = () => Date.now() + objClock.skew;

// ---- state ----------------------------------------------------------------------------
const objList = () => (S && Array.isArray(S.objects) ? S.objects : []);
const objById = (id) => objList().find((o) => o.id === id) || null;
const objName = (o) => ObjCore.objectName(o, objList());
const objBpm = () => (S && S.fx && S.fx.bpm) || 120;
const objMoving = (o) => !!o && o.on !== false && !o.paused && ObjCore.cycleMs(o, objBpm()) != null;

// Send the whole list. Leading edge immediately, then at most every 50ms while a drag is
// going, and always once more at the end — the rig follows the hand, and the last
// position is the one that sticks.
let objPostTimer = null, objLastPost = 0;
function objSend(now = false) {
  if (!S) return;
  const go = () => {
    objPostTimer = null; objLastPost = Date.now(); objectsPostedAt = Date.now();
    post('api/objects', { objects: objList() }).then((r) => {
      if (r && r.error) say(r.error, true);
    });
  };
  if (now) { clearTimeout(objPostTimer); go(); return; }
  if (objPostTimer) return;
  if (Date.now() - objLastPost > 50) go();
  else objPostTimer = setTimeout(go, 50);
}

// Change one object: merge the patch, validate the list, send it, say what happened.
function objPatch(id, patch, { now = true, msg } = {}) {
  const o = objById(id);
  if (!o) return null;
  Object.assign(o, patch);
  S.objects = ObjCore.sanitizeObjects(objList());
  objSend(now);
  if (msg) say(typeof msg === 'function' ? msg(objById(id)) : msg);
  return objById(id);
}

// Where to put a new object: the middle of the lights the objects can reach (the Dimmer
// and anything else the effects leave alone does not count), sized to them.
function objRigFrame() {
  const skip = new Set((S.fx && S.fx.exclude) || []);
  const pts = S.fixtures.filter((f) => !skip.has(f.profile)).map((f) => ({ x: +f.x || 0, y: +f.y || 0 }));
  if (!pts.length) return { cx: 0.5, cy: 0.5, w: 0.6, h: 0.4, reach: 0.4 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const reach = Math.max(0.15, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { cx, cy, w: x1 - x0, h: y1 - y0, reach };
}

function objAdd(kind) {
  if (!S) return;
  if (!Array.isArray(S.objects)) S.objects = [];
  if (S.objects.length >= ObjCore.MAX_OBJECTS) { say(`At most ${ObjCore.MAX_OBJECTS} objects on the stage — delete one first`, true); return; }
  const r = objRigFrame();
  const d = ObjCore.KIND_DEFAULTS[kind];
  const n = S.objects.filter((x) => x.kind === kind).length + 1;
  const o = {
    id: 'ob' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    kind, name: `${OBJ_LABEL[kind]} ${n}`,
    x: r.cx, y: r.cy, angle: d.angle, width: d.width, beats: d.beats, depth: 255, on: true,
    size: kind === 'line' ? Math.max(0.1, r.w / 2 + 0.06)
      : kind === 'radar' ? r.reach * 1.15
      : kind === 'ring' ? r.reach * 1.1
      : d.size,
  };
  S.objects = ObjCore.sanitizeObjects([...S.objects, o]);
  objSelect(S.objects[S.objects.length - 1].id, { quiet: true });
  objSend(true);
  objPaintStrips();
  say(`${o.name} added — drag it on the stage, or pick it in the Objects list; Delete removes it`);
}

function objRemove(id) {
  const o = objById(id);
  if (!o) return;
  const name = objName(o);
  S.objects = objList().filter((x) => x.id !== id);
  if (objSel === id) { objSel = null; objHeld = null; }
  if (objSolo && objSolo.id === id) objSolo = null;
  objSend(true);
  objPaintStrips();
  say(`${name} removed — Ctrl+Z brings it back`);
}

// Select an object. A moving one holds still on the preview while it is selected, so its
// handles stay where the hand can catch them; the lights keep moving (the engine never
// stops unless Pause is pressed) — and she is told so.
function objSelect(id, { quiet = false } = {}) {
  if (objSel === id) return;
  objSel = id;
  const o = id ? objById(id) : null;
  objHeld = o ? { id, now: deskNow() } : null;
  if (o && !quiet) {
    say(objMoving(o)
      ? `${objName(o)} held still here for editing — the lights keep moving (Pause stops them)`
      : `${objName(o)} selected — drag it, or change it below; Delete removes it`);
  }
  objPaintStrips();
}

// ---- play / pause / restart / on / solo ------------------------------------------------
function objTogglePlay(id) {
  const o = objById(id);
  if (!o) return;
  const now = deskNow();
  if (!o.paused && !(o.loop === false && ObjCore.animRaw(o, objBpm(), now) >= 1)) {
    objPatch(id, ObjCore.pauseFields(o, objBpm(), now), { msg: `${objName(o)} paused — the lights hold where it is` });
  } else {
    objPatch(id, ObjCore.playFields(o, objBpm(), now), { msg: `${objName(o)} playing` });
  }
  if (objHeld && objHeld.id === id) objHeld.now = deskNow();
}
function objRestart(id) {
  const o = objById(id);
  if (!o) return;
  objPatch(id, ObjCore.restartFields(o, deskNow()), { msg: `${objName(o)} restarted from the top` });
  if (objHeld && objHeld.id === id) objHeld.now = deskNow();
}
function objToggleOn(id) {
  const o = objById(id);
  if (!o) return;
  if (objSolo) objSolo = null;   // a hand-set on/off ends a solo
  objPatch(id, { on: o.on === false }, { msg: (x) => `${objName(x)} ${x.on ? 'on' : 'off'}` });
}
// Solo: only this object shapes the lights; pressing it again brings the others back.
function objToggleSolo(id) {
  const o = objById(id);
  if (!o) return;
  if (objSolo && objSolo.id === id) {
    for (const x of objList()) if (objSolo.prev.has(x.id)) x.on = objSolo.prev.get(x.id);
    objSolo = null;
    S.objects = ObjCore.sanitizeObjects(objList()); objSend(true);
    say('Solo off — the other objects are back as they were');
    return;
  }
  const prev = objSolo ? objSolo.prev : new Map(objList().map((x) => [x.id, x.on !== false]));
  for (const x of objList()) x.on = x.id === id;
  objSolo = { id, prev };
  S.objects = ObjCore.sanitizeObjects(objList()); objSend(true);
  say(`Solo: ${objName(o)} — the other objects are off until you press S again`);
}
const objAnyMoving = () => objList().some((o) => !o.paused && ObjCore.cycleMs(o, objBpm()) != null);
function objPauseAll() {
  const now = deskNow();
  const pause = objAnyMoving();
  for (const o of objList()) {
    if (ObjCore.cycleMs(o, objBpm()) == null) continue;
    Object.assign(o, pause ? (o.paused ? {} : ObjCore.pauseFields(o, objBpm(), now)) : (o.paused ? ObjCore.playFields(o, objBpm(), now) : {}));
  }
  S.objects = ObjCore.sanitizeObjects(objList()); objSend(true);
  say(pause ? 'All objects paused — the lights hold where they are' : 'All objects playing');
}

// ---- drawing --------------------------------------------------------------------------
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(OBJ_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
const setA = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };

// Two layers per stage. The shapes sit UNDER the fixture squares, so a light inside a spot
// or under a line can still be clicked and dragged. The handles sit OVER them — and every
// object's hub too, selected or not, so an object is always there to take hold of. The
// stage is emptied on every structural change, so both layers are re-made whenever they
// have gone missing, and the top one is kept last.
function objLayers(inner) {
  let low = inner.querySelector(':scope > svg.objlow');
  if (!low) {
    low = svgEl('svg', { class: 'objlayer objlow', 'aria-hidden': 'true' });
    inner.insertBefore(low, inner.firstChild);
    low._g = new Map();
  }
  let top = inner.querySelector(':scope > svg.objtop');
  if (!top) top = svgEl('svg', { class: 'objlayer objtop', 'aria-hidden': 'true' });
  if (inner.lastElementChild !== top) inner.appendChild(top);
  return { low, top };
}

// The parts an object is drawn with, made once per object per stage: shapes and hit areas
// in the low group, handles in a twin group on the top layer (`g._h`, same class and id,
// so one pointer handler serves both). Handles only exist on an editable stage.
function objGroup(layers, o, editable) {
  let g = layers.low._g.get(o.id);
  if (g && g._kind !== o.kind) { g.remove(); if (g._h) g._h.remove(); g = null; }
  if (g) return g;
  g = svgEl('g', { class: `obj obj-${o.kind}`, 'data-oid': o.id }, layers.low);
  g._kind = o.kind;
  const h = g._h = editable ? svgEl('g', { class: `obj obj-${o.kind}`, 'data-oid': o.id }, layers.top) : null;
  const p = g._p = {};
  p.path = svgEl('line', { class: 'ob-path' }, g);          // move A → B: the way it travels
  if (o.kind === 'line') {
    p.band = svgEl('polygon', { class: 'ob-fill' }, g);
    p.guideA = svgEl('line', { class: 'ob-guide' }, g);
    p.guideB = svgEl('line', { class: 'ob-guide' }, g);
    p.core = svgEl('line', { class: 'ob-core' }, g);
    if (editable) p.hit = svgEl('line', { class: 'ob-hit', 'data-part': 'move' }, g);
  } else if (o.kind === 'radar') {
    p.reach = svgEl('circle', { class: 'ob-guide' }, g);
    p.tail = Array.from({ length: 6 }, () => svgEl('path', { class: 'ob-tail' }, g));
    p.beam = svgEl('path', { class: 'ob-fill ob-beam' }, g);
    p.edge = svgEl('line', { class: 'ob-core' }, g);
    if (editable) p.hit = svgEl('path', { class: 'ob-hit ob-hitfill', 'data-part': 'move' }, g);
  } else if (o.kind === 'ring') {
    p.max = svgEl('circle', { class: 'ob-guide' }, g);
    p.band = svgEl('circle', { class: 'ob-band' }, g);
    p.core = svgEl('circle', { class: 'ob-core ob-nofill' }, g);
    if (editable) p.hit = svgEl('circle', { class: 'ob-hit ob-nofill', 'data-part': 'move' }, g);
  } else {
    p.soft = svgEl('circle', { class: 'ob-guide' }, g);
    p.disc = svgEl('circle', { class: 'ob-fill ob-core' }, g);
    if (editable) p.hit = svgEl('circle', { class: 'ob-hit ob-hitfill', 'data-part': 'move' }, g);
  }
  // The hub: a dot marking the centre of every object.
  p.dot = svgEl('circle', { class: 'ob-dot' }, g);
  if (editable) {
    // The hub's grab area lives on the TOP layer and is shown for every object (objects.css),
    // selected or not — a light under the hub can no longer swallow the press.
    p.hub = svgEl('circle', { class: 'ob-hit ob-hitfill ob-hubtop', 'data-part': 'move' }, h);
    const tHub = svgEl('title', {}, p.hub); tHub.textContent = 'Drag to move — click to select';
    p.hMove = svgEl('rect', { class: 'ob-handle ob-hmove', 'data-part': 'move' }, h);
    if (o.kind === 'line' || o.kind === 'radar') {
      p.arm = svgEl('line', { class: 'ob-arm' }, h);
      p.hRot = svgEl('circle', { class: 'ob-handle ob-hrot', 'data-part': 'rotate' }, h);
    }
    p.hSize = svgEl('rect', { class: 'ob-handle ob-hsize', 'data-part': 'resize' }, h);
    p.hB = svgEl('circle', { class: 'ob-handle ob-hb', 'data-part': 'moveB' }, h);
    p.bText = svgEl('text', { class: 'ob-btext' }, h); p.bText.textContent = 'B';
    p.aText = svgEl('text', { class: 'ob-btext' }, h); p.aText.textContent = 'A';
    const t = svgEl('title', {}, p.hMove); t.textContent = 'Drag to move';
    if (p.hRot) { const t2 = svgEl('title', {}, p.hRot); t2.textContent = 'Drag to turn — Shift snaps to 15°'; }
    const t3 = svgEl('title', {}, p.hSize); t3.textContent = o.kind === 'line' ? 'Drag to set how far it travels' : 'Drag to set the size';
    const t4 = svgEl('title', {}, p.hB); t4.textContent = 'B — drag to set where it travels to';
  }
  layers.low._g.set(o.id, g);
  return g;
}

function wedge(cx, cy, r, a0, a1) {
  // a0 → a1 clockwise (degrees), as a pie slice
  const rad = (a) => a * Math.PI / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const large = ((a1 - a0) % 360 + 360) % 360 > 180 ? 1 : 0;
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
}

function objDrawStage(inner, now) {
  const stage = inner.parentElement;
  const editable = !stage.classList.contains('viewonly');
  const layers = objLayers(inner);
  const W = inner.clientWidth || 0, H = inner.clientHeight || 0;
  const { sc, ox, oy } = stageMap(W, H);
  const zoom = viewOf(inner).zoom || 1;
  const X = (x) => ox + x * sc, Y = (y) => oy + y * sc;
  const hs = 11 / zoom;                         // handles keep one size on screen
  const bpm = objBpm();
  const alive = new Set();
  for (const o of objList()) {
    alive.add(o.id);
    const g = objGroup(layers, o, editable);
    const p = g._p;
    // The selected object holds still on the preview (objHeld); everything else is live.
    const t = objHeld && objHeld.id === o.id ? objHeld.now : now;
    const pose = ObjCore.objectPose(o, bpm, t);
    const selected = editable && o.id === objSel;
    const move = o.motion === 'move';
    for (const el of g._h ? [g, g._h] : [g]) {
      el.classList.toggle('sel', selected);
      el.classList.toggle('off', o.on === false);
      el.classList.toggle('hl', objHover === o.id);
      el.classList.toggle('held', selected && objMoving(o));
      el.classList.toggle('moveab', move);
    }
    const cx = X(pose.cx), cy = Y(pose.cy);   // where the object is now
    const ax = X(o.x), ay = Y(o.y);           // its anchor (A): where the handles work from
    setA(p.dot, { cx, cy, r: 2.5 / zoom });
    if (p.hub) setA(p.hub, { cx, cy, r: 14 / zoom });
    setA(p.path, move ? { x1: ax, y1: ay, x2: X(o.bx), y2: Y(o.by), visibility: selected || objHover === o.id ? 'visible' : 'hidden' } : { visibility: 'hidden' });
    if (o.kind === 'line') {
      const L = 3 * sc;                          // the mask has no ends; draw it past the world
      const lx = cx + pose.nx * pose.offset * sc, ly = cy + pose.ny * pose.offset * sc;
      const hw = o.width / 2 * sc;
      const ex = pose.dx * L, ey = pose.dy * L, wx = pose.nx * hw, wy = pose.ny * hw;
      setA(p.band, { points: `${lx - ex + wx},${ly - ey + wy} ${lx + ex + wx},${ly + ey + wy} ${lx + ex - wx},${ly + ey - wy} ${lx - ex - wx},${ly - ey - wy}` });
      setA(p.core, { x1: lx - ex, y1: ly - ey, x2: lx + ex, y2: ly + ey });
      if (p.hit) setA(p.hit, { x1: lx - ex, y1: ly - ey, x2: lx + ex, y2: ly + ey });
      // the two ends of the sweep, while it is selected and sweeping
      const showG = selected && !move && ObjCore.cycleMs(o, bpm) != null;
      for (const [el, s] of [[p.guideA, 1], [p.guideB, -1]]) {
        const gx = ax + pose.nx * o.size * s * sc, gy = ay + pose.ny * o.size * s * sc;
        setA(el, { x1: gx - ex, y1: gy - ey, x2: gx + ex, y2: gy + ey, visibility: showG ? 'visible' : 'hidden' });
      }
      if (editable) {
        const R = Math.max(0.12, o.width) * sc + 22 / zoom;
        const rx = ax + pose.dx * R, ry = ay + pose.dy * R;
        setA(p.arm, { x1: ax, y1: ay, x2: rx, y2: ry });
        setA(p.hRot, { cx: rx, cy: ry, r: hs / 2 });
        const sx = ax + pose.nx * o.size * sc, sy = ay + pose.ny * o.size * sc;
        setA(p.hSize, { x: sx - hs / 2, y: sy - hs / 2, width: hs, height: hs, transform: `rotate(45 ${sx} ${sy})` });
      }
    } else if (o.kind === 'radar') {
      const r = pose.size * sc;
      setA(p.reach, { cx, cy, r, visibility: selected || objHover === o.id ? 'visible' : 'hidden' });
      const lead = pose.theta, back = lead - o.width;
      setA(p.beam, { d: wedge(cx, cy, r, back, lead) });
      const step = ObjCore.RADAR_TAIL / p.tail.length;
      p.tail.forEach((el, i) => {
        setA(el, { d: wedge(cx, cy, r, back - (i + 1) * step, back - i * step), 'fill-opacity': (0.2 * (1 - (i + 0.5) / p.tail.length) ** 2).toFixed(3) });
      });
      const a = lead * Math.PI / 180;
      setA(p.edge, { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a) });
      if (p.hit) setA(p.hit, { d: wedge(cx, cy, r, back, lead) });
      if (editable) {
        const a0 = o.angle * Math.PI / 180;
        const rr = Math.max(0.35 * o.size * sc, 26 / zoom);
        const rx = ax + rr * Math.cos(a0), ry = ay + rr * Math.sin(a0);
        setA(p.arm, { x1: ax, y1: ay, x2: rx, y2: ry });
        setA(p.hRot, { cx: rx, cy: ry, r: hs / 2 });
        setA(p.hSize, { x: ax + o.size * sc - hs / 2, y: ay - hs / 2, width: hs, height: hs, transform: `rotate(45 ${ax + o.size * sc} ${ay})` });
      }
    } else if (o.kind === 'ring') {
      const r = pose.r * sc;
      setA(p.max, { cx, cy, r: pose.size * sc, visibility: selected || objHover === o.id ? 'visible' : 'hidden' });
      setA(p.band, { cx, cy, r, 'stroke-width': Math.max(1 / zoom, o.width * sc), 'stroke-opacity': (0.28 * pose.fade).toFixed(3) });
      setA(p.core, { cx, cy, r, 'stroke-opacity': pose.fade.toFixed(3) });
      if (p.hit) setA(p.hit, { cx, cy, r: pose.size * sc });
      if (editable) setA(p.hSize, { x: ax + o.size * sc - hs / 2, y: ay - hs / 2, width: hs, height: hs, transform: `rotate(45 ${ax + o.size * sc} ${ay})` });
    } else {
      setA(p.disc, { cx, cy, r: pose.r * sc });
      setA(p.soft, { cx, cy, r: (pose.r + o.width) * sc, visibility: o.width > 0 ? 'visible' : 'hidden' });
      if (p.hit) setA(p.hit, { cx, cy, r: pose.r * sc });
      if (editable) setA(p.hSize, { x: ax + o.size * sc - hs / 2, y: ay - hs / 2, width: hs, height: hs, transform: `rotate(45 ${ax + o.size * sc} ${ay})` });
    }
    if (editable) {
      // A: the anchor handle. For move A → B it moves A alone (the body moves both).
      p.hMove.setAttribute('data-part', move ? 'moveA' : 'move');
      setA(p.hMove, { x: ax - hs / 2, y: ay - hs / 2, width: hs, height: hs });
      const bxs = X(o.bx), bys = Y(o.by);
      setA(p.hB, { cx: bxs, cy: bys, r: hs / 1.6, visibility: move ? 'visible' : 'hidden' });
      setA(p.bText, { x: bxs + hs, y: bys - hs * 0.6, 'font-size': 11 / zoom, visibility: move ? 'visible' : 'hidden' });
      setA(p.aText, { x: ax + hs, y: ay - hs * 0.6, 'font-size': 11 / zoom, visibility: move ? 'visible' : 'hidden' });
    }
  }
  for (const [id, g] of layers.low._g) {
    if (alive.has(id)) continue;
    g.remove(); if (g._h) g._h.remove();
    layers.low._g.delete(id);
  }
}

// The top-bar pill: an object dims the rig from every page, so from Setup or the Fader
// page the lights would go dark with no visible cause — the same reason FX has a pill.
let objPillText = null;
function objPaintPill() {
  const pill = document.getElementById('objPill');
  if (!pill) return;
  const on = objList().filter((o) => o.on !== false);
  const text = on.length ? `Objects: ${on.map((o) => objName(o) + (o.paused ? ' (paused)' : '')).join(', ')}` : '';
  if (text === objPillText) return;
  objPillText = text;
  pill.hidden = !on.length;
  pill.textContent = text;
}

let objListAt = 0;
function objFrame() {
  requestAnimationFrame(objFrame);
  if (!S || document.hidden) return;
  // A selection that no longer exists (deleted elsewhere, replaced by a scene) lets go.
  if (objSel && !objById(objSel)) { objSel = null; objHeld = null; objPaintStrips(); }
  const now = deskNow();
  for (const inner of document.querySelectorAll('.stage-inner')) {
    if (!inner.offsetParent) continue;           // not on screen: nothing to draw
    objDrawStage(inner, now);
  }
  objPaintPill();
  if (now - objListAt > 150) { objListAt = now; objSyncStrips(); }
}

// ---- the editor for one object ----------------------------------------------------------
// One editor, two homes: the strip over the small stages (the animation half behind
// "Animation ▸"), and the Stage page's inspector (everything open). Both are built and read
// by the functions below, so the two can never disagree.
const OE_DIR = { forward: 'Forward', reverse: 'Reverse', pingpong: 'Ping-pong' };
const OE_EASE = { linear: 'Linear', smooth: 'Smooth', bounce: 'Bounce' };
function objEditorHtml(o, { full = false } = {}) {
  const opt = (map, cur) => Object.entries(map).map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
  return `<div class="objed${full ? ' full' : ''}" data-oid="${esc(o.id)}">
    <div class="oe-row oe-main">
      <span class="oe-kind" title="${esc(OBJ_HINT[o.kind] || '')}">${OBJ_ICON[o.kind] || ''}</span>
      <input type="text" class="oe-name" data-f="name" maxlength="40" spellcheck="false" title="Its name — shown in the Objects list">
      <label title="How long one cycle takes — 0 keeps it still">Speed <input type="number" data-f="speed" min="0" step="1"><select data-f="timing" title="Beats follow the BPM; seconds do not"><option value="beats">beats</option><option value="secs">s</option></select></label>
      <label class="oe-wlabel">Width <input type="number" data-f="width" min="0" step="1"><span class="oe-unit oe-wunit"></span></label>
      <label title="How dark the lights outside it go — 100% is fully dark">Depth <input type="number" data-f="depth" min="0" max="100" step="5"><span class="oe-unit">%</span></label>
      <span class="oe-btns">
        <button class="sq" data-oe="on" title="Switch this object on or off">On</button>
        <button class="sq" data-oe="play" title="Pause it where it is, or play it on">Pause</button>
        <button class="sq" data-oe="restart" title="Start its cycle again from the top">Restart</button>
        <button class="sq danger" data-oe="del" title="Delete this object (Delete key)">Delete</button>
        ${full ? '' : '<button class="sq oe-more" data-oe="more" title="Motion, direction, easing, phase, once or loop">Animation ▸</button>'}
      </span>
    </div>
    <div class="oe-row oe-anim">
      <label title="Its own movement, or travelling from A to B">Motion <select data-f="motion"><option value="auto">${OBJ_OWN[o.kind] || 'Own'}</option><option value="move">Move A → B</option></select></label>
      <label>Direction <select data-f="dir">${opt(OE_DIR, o.dir)}</select></label>
      <label>Easing <select data-f="ease">${opt(OE_EASE, o.ease)}</select></label>
      <label title="Where in its cycle it starts — stagger several objects">Phase <input type="number" data-f="phase" min="0" max="100" step="5"><span class="oe-unit">%</span></label>
      <label title="Round and round, or once (Restart or a scene recall starts it)">Runs <select data-f="loop"><option value="loop">in a loop</option><option value="once">once</option></select></label>
      <label title="Degrees it turns every cycle">Spin <input type="number" data-f="spin" step="15"><span class="oe-unit">°</span></label>
      <label title="How much its size breathes every cycle">Pulse <input type="number" data-f="pulse" min="0" max="100" step="5"><span class="oe-unit">%</span></label>
      <span class="oe-hint"></span>
    </div>
  </div>`;
}

// Refresh an editor from the object. Fields are only rewritten while not focused, so a
// value being typed is never snapped back by the redraw.
function objEditorSync(root, o) {
  const ed = root.classList && root.classList.contains('objed') ? root : root.querySelector('.objed');
  if (!ed || !o) return;
  const put = (f, v) => { const el = ed.querySelector(`[data-f="${f}"]`); if (el && document.activeElement !== el && el.value !== String(v)) el.value = v; };
  put('name', objName(o));
  put('timing', o.timing === 'secs' ? 'secs' : 'beats');
  put('speed', o.timing === 'secs' ? o.secs : o.beats);
  const sp = ed.querySelector('[data-f="speed"]'); if (sp) sp.step = o.timing === 'secs' ? '0.5' : '1';
  put('width', o.kind === 'radar' ? Math.round(o.width) : Math.round(o.width * 100));
  put('depth', Math.round(o.depth / 2.55));
  put('motion', o.motion || 'auto');
  put('dir', o.dir);
  put('ease', o.ease);
  put('phase', Math.round((o.phase || 0) * 100));
  put('loop', o.loop === false ? 'once' : 'loop');
  put('spin', Math.round(o.spin || 0));
  put('pulse', Math.round((o.pulse || 0) * 100));
  ed.querySelector('.oe-wunit').textContent = o.kind === 'radar' ? '°' : '% of stage';
  ed.querySelector('.oe-wlabel').title = o.kind === 'radar' ? 'How wide the beam is' : o.kind === 'spot' ? 'How soft the edge is' : 'How thick it is';
  const on = ed.querySelector('[data-oe="on"]');
  on.textContent = o.on === false ? 'Off' : 'On';
  on.classList.toggle('accent', o.on !== false);
  const still = ObjCore.cycleMs(o, objBpm()) == null;
  const ended = o.loop === false && !o.paused && ObjCore.animRaw(o, objBpm(), deskNow()) >= 1;
  const play = ed.querySelector('[data-oe="play"]');
  play.textContent = o.paused || ended ? 'Play' : 'Pause';
  play.disabled = still;
  ed.querySelector('[data-oe="restart"]').disabled = still;
  const hint = ed.querySelector('.oe-hint');
  const txt = still ? 'Speed 0 — it stands still; give it a speed to move it'
    : o.paused ? 'Paused — the lights hold here; Play carries on'
    : ended ? 'Ran once — Play or Restart runs it again (a scene recall does too)'
    : o.motion === 'move' ? 'Drag A and B on the stage — it travels between them'
    : o.loop === false ? 'Runs once — Restart or a scene recall starts it' : '';
  if (hint.textContent !== txt) hint.textContent = txt;
}

// Wire an editor's container once (event delegation), whatever the editor inside it is.
function objEditorWire(container) {
  if (container._oeWired) return;
  container._oeWired = true;
  const current = (e) => { const ed = e.target.closest && e.target.closest('.objed'); return ed ? objById(ed.dataset.oid) : null; };
  const edit = (e, commit) => {
    const f = e.target.dataset && e.target.dataset.f;
    const o = f && current(e);
    if (!o) return;
    const v = e.target.value;
    const n = +v || 0;
    const bpm = objBpm();
    const patch = {};
    let msg = null;
    if (f === 'name') { if (!commit) return; patch.name = v; msg = `Renamed to "${String(v).trim() || objName(o)}"`; }
    else if (f === 'speed') { if (o.timing === 'secs') patch.secs = clamp(n, 0, 600); else patch.beats = clamp(Math.round(n), 0, 64); }
    else if (f === 'timing') {
      // Same speed, other unit: 8 beats at 120 BPM becomes 4 s.
      if (v === 'secs') { patch.timing = 'secs'; patch.secs = Math.round((o.beats || 0) * 600 / bpm) / 10; msg = 'Speed in seconds — it no longer follows the BPM'; }
      else { patch.timing = 'beats'; patch.beats = clamp(Math.round((o.secs || 0) * bpm / 60), 0, 64); msg = 'Speed in beats — it follows the BPM'; }
    }
    else if (f === 'width') patch.width = o.kind === 'radar' ? n : n / 100;
    else if (f === 'depth') patch.depth = Math.round(clamp(n, 0, 100) * 2.55);
    else if (f === 'motion') {
      patch.motion = v;
      if (v === 'move') {
        // First time: B a little to the right of A, and there-and-back is the natural way
        // to travel between two points.
        if (Math.abs(o.bx - o.x) < 1e-6 && Math.abs(o.by - o.y) < 1e-6) { patch.bx = clamp(o.x + 0.3, -1, 2); patch.by = o.y; }
        if (o.dir === ObjCore.KIND_DIR[o.kind] && o.dir !== 'pingpong') patch.dir = 'pingpong';
        if (ObjCore.cycleMs(o, bpm) == null) patch.beats = 8;
        msg = `${objName(o)} moves between A and B — drag the B handle on the stage`;
      } else msg = `${objName(o)} back to its own movement`;
    }
    else if (f === 'dir') { patch.dir = v; msg = `Direction: ${OE_DIR[v]}`; }
    else if (f === 'ease') { patch.ease = v; msg = `Easing: ${OE_EASE[v]}`; }
    else if (f === 'phase') patch.phase = clamp(n, 0, 100) / 100;
    else if (f === 'loop') {
      patch.loop = v !== 'once';
      if (v === 'once') { Object.assign(patch, ObjCore.restartFields(o, deskNow())); msg = `${objName(o)} runs once — running now; Restart runs it again`; }
      else msg = `${objName(o)} runs in a loop`;
    }
    else if (f === 'spin') patch.spin = clamp(n, -1440, 1440);
    else if (f === 'pulse') patch.pulse = clamp(n, 0, 100) / 100;
    else return;
    objPatch(o.id, patch, { now: commit, msg });
    if (objHeld && objHeld.id === o.id) objHeld.now = deskNow();
  };
  container.addEventListener('input', (e) => { if (e.target.dataset.f && e.target.tagName === 'INPUT' && e.target.type === 'number') edit(e, false); });
  container.addEventListener('change', (e) => edit(e, true));
  container.addEventListener('keydown', (e) => {
    if (!e.target.closest || !e.target.closest('.objed')) return;
    e.stopPropagation();     // typing a name or a number must not fire the desk's keys
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
  });
  container.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-oe]');
    const o = b && current(e);
    if (!o) return;
    const act = b.dataset.oe;
    if (act === 'on') objToggleOn(o.id);
    else if (act === 'play') objTogglePlay(o.id);
    else if (act === 'restart') objRestart(o.id);
    else if (act === 'del') objRemove(o.id);
    else if (act === 'more') {
      const strip = b.closest('.objstrip');
      const open = !strip.classList.contains('anim-open');
      strip.classList.toggle('anim-open', open);
      try { localStorage.setItem('objAnimOpen', open ? '1' : '0'); } catch (err) { /* private mode */ }
      b.textContent = open ? 'Animation ▾' : 'Animation ▸';
    }
  });
}
window.ObjEditor = { html: objEditorHtml, sync: objEditorSync, wire: objEditorWire };

// ---- the strip for the selected object (small stages) ----------------------------------
function objStripFor(stage) {
  let strip = stage.querySelector(':scope > .objstrip');
  if (strip) return strip;
  strip = document.createElement('div');
  strip.className = 'objstrip';
  strip.hidden = true;
  stage.appendChild(strip);
  let open = false;
  try { open = localStorage.getItem('objAnimOpen') === '1'; } catch (e) { /* private mode */ }
  strip.classList.toggle('anim-open', open);
  // Keep a press on the strip from starting a marquee or a pan on the stage under it.
  strip.addEventListener('pointerdown', (e) => e.stopPropagation());
  strip.addEventListener('wheel', (e) => e.stopPropagation());
  objEditorWire(strip);
  return strip;
}

// ---- the list of objects ----------------------------------------------------------------
// Top-right of every small editable stage, and at the top of the Stage page's inspector:
// every object, whatever it is doing. A row click selects (and the preview holds it still),
// the buttons switch it on or off, solo it, pause it or delete it — two clicks at most,
// and nothing to chase across the stage.
function objListRowsHtml() {
  const list = objList();
  if (!list.length) return '<div class="ol-empty muted">No objects — add one with the Line, Radar, Ring or Spot tool</div>';
  return list.map((o) => {
    const still = ObjCore.cycleMs(o, objBpm()) == null;
    const soloed = objSolo && objSolo.id === o.id;
    return `<div class="ol-row${o.id === objSel ? ' sel' : ''}${o.on === false ? ' off' : ''}${o.paused ? ' paused' : ''}" data-oid="${esc(o.id)}" title="Click to select — the preview holds it still">
      <span class="ol-kind">${OBJ_ICON[o.kind] || ''}</span><span class="ol-name">${esc(objName(o))}</span>
      <button class="ol-b${o.on !== false ? ' on' : ''}" data-ol="on" title="${o.on === false ? 'Off — switch it on' : 'On — switch it off'}">${o.on === false ? '○' : '●'}</button>
      <button class="ol-b${soloed ? ' on' : ''}" data-ol="solo" title="${soloed ? 'Soloed — press again to bring the others back' : 'Solo — only this object shapes the lights'}">S</button>
      <button class="ol-b" data-ol="play" title="${still ? 'It stands still (speed 0)' : o.paused ? 'Paused — play it' : 'Pause it where it is'}"${still ? ' disabled' : ''}>${o.paused ? '▶' : '❚❚'}</button>
      <button class="ol-b ol-del" data-ol="del" title="Delete it">✕</button>
    </div>`;
  }).join('');
}
function objListHeadHtml() {
  const n = objList().length;
  return `<span class="ol-title">Objects <i>${n}</i></span><span class="flex"></span>
    <button class="sq ol-all" data-ol="pauseall" title="Pause every object where it is, or play them all"${n ? '' : ' disabled'}>${objAnyMoving() ? 'Pause all' : 'Play all'}</button>`;
}
function objListWire(box) {
  if (box._olWired) return;
  box._olWired = true;
  box.addEventListener('pointerdown', (e) => e.stopPropagation());   // not a marquee on the stage
  box.addEventListener('wheel', (e) => e.stopPropagation());
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ol]');
    const row = e.target.closest('.ol-row');
    if (b) {
      const act = b.dataset.ol;
      if (act === 'pauseall') { objPauseAll(); return; }
      if (act === 'fold') {
        const folded = !box.classList.contains('folded');
        box.classList.toggle('folded', folded);
        try { localStorage.setItem('objListFold', folded ? '1' : '0'); } catch (err) { /* private mode */ }
        return;
      }
      if (!row) return;
      const id = row.dataset.oid;
      if (act === 'on') objToggleOn(id);
      else if (act === 'solo') objToggleSolo(id);
      else if (act === 'play') objTogglePlay(id);
      else if (act === 'del') objRemove(id);
      return;
    }
    if (row) objSelect(row.dataset.oid === objSel ? null : row.dataset.oid);
  });
  box.addEventListener('pointerover', (e) => { const row = e.target.closest('.ol-row'); objHover = row ? row.dataset.oid : null; });
  box.addEventListener('pointerleave', () => { objHover = null; });
}
function objListFor(stage) {
  let box = stage.querySelector(':scope > .objlist');
  if (box) return box;
  box = document.createElement('div');
  box.className = 'objlist';
  box.innerHTML = '<div class="ol-head"></div><div class="ol-rows"></div>';
  try { box.classList.toggle('folded', localStorage.getItem('objListFold') === '1'); } catch (e) { /* private mode */ }
  stage.appendChild(box);
  objListWire(box);
  return box;
}
// The Stage page keeps its list in the inspector, above the selected object's fields.
function objInspectorList() {
  const insp = document.querySelector('.stagepage .sp-insp');
  if (!insp) return null;
  let box = insp.querySelector(':scope > .objlist-insp');
  if (!box) {
    box = document.createElement('section');
    box.className = 'sp-sec objlist objlist-insp';
    box.innerHTML = '<div class="ol-head"></div><div class="ol-rows"></div>';
    const body = insp.querySelector('#spInspBody');
    if (body) insp.insertBefore(box, body); else insp.appendChild(box);
    objListWire(box);
  }
  return box;
}
function objPaintList(box) {
  const head = objListHeadHtml() + (box.classList.contains('objlist-insp') ? '' : '<button class="sq ol-fold" data-ol="fold" title="Fold the list">▾</button>');
  const h = box.querySelector('.ol-head');
  if (h.dataset.sig !== head) { h.dataset.sig = head; h.innerHTML = head; }
  const rows = objListRowsHtml();
  const r = box.querySelector('.ol-rows');
  if (r.dataset.sig !== rows) { r.dataset.sig = rows; r.innerHTML = rows; }
  box.classList.toggle('empty', !objList().length);
}

// Show/hide and fill the strips and the lists.
function objSyncStrips() {
  const o = objById(objSel);
  for (const stage of document.querySelectorAll('.stagepane .stage:not(.viewonly)')) {
    const strip = objStripFor(stage);
    strip.hidden = !o;
    if (o) {
      if (strip.dataset.oid !== o.id) { strip.dataset.oid = o.id; strip.innerHTML = objEditorHtml(o); const more = strip.querySelector('[data-oe="more"]'); if (more) more.textContent = strip.classList.contains('anim-open') ? 'Animation ▾' : 'Animation ▸'; }
      objEditorSync(strip, o);
    } else strip.dataset.oid = '';
    objPaintList(objListFor(stage));
  }
  const insp = objInspectorList();
  if (insp) objPaintList(insp);
}
const objPaintStrips = objSyncStrips;

// ---- pointer --------------------------------------------------------------------------
function objWorld(stage, e) {
  const r = stage.getBoundingClientRect();
  const v = viewOf(stage);
  const { sc, ox, oy } = stageMap(r.width, r.height);
  return {
    x: clamp(((e.clientX - r.left - v.x) / v.zoom - ox) / sc, -1, 2),
    y: clamp(((e.clientY - r.top - v.y) / v.zoom - oy) / sc, -1, 2),
  };
}

function objWireStage(stage) {
  if (stage._objWired || stage.classList.contains('viewonly')) return;
  stage._objWired = true;
  // The stage takes keyboard focus (Tab / Shift+Tab walk through the objects from there).
  if (!stage.hasAttribute('tabindex')) stage.tabIndex = 0;
  // Capture phase, so an object under the pointer is handled BEFORE the stage's own
  // handler starts a marquee. Anything that is not an object falls through untouched —
  // and a press on empty stage or a light lets go of the selected object.
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest && (e.target.closest('.objstrip') || e.target.closest('.objlist'))) return;   // their own things
    if (document.activeElement !== stage && !(e.target.closest && e.target.closest('input, select, textarea'))) {
      try { stage.focus({ preventScroll: true }); } catch (err) { /* old browser */ }
    }
    const part = e.target.closest && e.target.closest('[data-part]');
    const g = part && part.closest('g.obj');
    if (!g || e.button !== 0 || spaceHeld || (typeof tool !== 'undefined' && tool === 'hand' && !part.classList.contains('ob-handle'))) {
      if (objSel && e.button === 0 && !spaceHeld) objSelect(null);
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    const o = objById(g.dataset.oid);
    if (!o) return;
    objSelect(o.id);
    const p = objWorld(stage, e);
    objDrag = { id: o.id, mode: part.dataset.part, stage, pointerId: e.pointerId, start: p, ox: o.x, oy: o.y, obx: o.bx, oby: o.by, moved: false };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('objdragging');
    touchedAt = Date.now();
  }, true);

  stage.addEventListener('pointermove', (e) => {
    if (!objDrag || objDrag.stage !== stage || e.pointerId !== objDrag.pointerId) return;
    e.stopImmediatePropagation();
    const o = objById(objDrag.id);
    if (!o) return;
    const p = objWorld(stage, e);
    touchedAt = Date.now();
    const dx = p.x - objDrag.start.x, dy = p.y - objDrag.start.y;
    const sn = (v) => (snap ? snapv(v) : v);
    if (objDrag.mode === 'move') {
      // The whole object; for move A → B, A and B travel together (the path keeps its shape).
      const x = sn(objDrag.ox + dx), y = sn(objDrag.oy + dy);
      o.x = clamp(x, -1, 2); o.y = clamp(y, -1, 2);
      if (o.motion === 'move') { o.bx = clamp(objDrag.obx + (o.x - objDrag.ox), -1, 2); o.by = clamp(objDrag.oby + (o.y - objDrag.oy), -1, 2); }
    } else if (objDrag.mode === 'moveA') {
      o.x = clamp(sn(objDrag.ox + dx), -1, 2); o.y = clamp(sn(objDrag.oy + dy), -1, 2);
    } else if (objDrag.mode === 'moveB') {
      o.bx = clamp(sn(objDrag.obx + dx), -1, 2); o.by = clamp(sn(objDrag.oby + dy), -1, 2);
    } else if (objDrag.mode === 'rotate') {
      let a = Math.atan2(p.y - o.y, p.x - o.x) * 180 / Math.PI;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      o.angle = ((a % 360) + 360) % 360;
    } else {
      let s;
      if (o.kind === 'line') {
        const t = o.angle * Math.PI / 180;
        s = Math.abs((p.x - o.x) * -Math.sin(t) + (p.y - o.y) * Math.cos(t));
      } else s = Math.hypot(p.x - o.x, p.y - o.y);
      o.size = clamp(s, 0.02, 3);
    }
    objDrag.moved = true;
    objSend();
  }, true);

  const end = (e) => {
    if (!objDrag || objDrag.stage !== stage || (e && e.pointerId !== objDrag.pointerId)) return;
    e.stopImmediatePropagation();
    const o = objById(objDrag.id);
    if (objDrag.moved && o) {
      S.objects = ObjCore.sanitizeObjects(objList());
      objSend(true);
      const what = { move: 'moved', moveA: 'A moved', moveB: 'B moved — it travels there', rotate: `turned to ${Math.round(o.angle)}°`, resize: 'resized' }[objDrag.mode];
      say(`${objName(o)} ${what}`);
    }
    stage.classList.remove('objdragging');
    objDrag = null;
  };
  stage.addEventListener('pointerup', end, true);
  stage.addEventListener('pointercancel', end, true);
}

// A press anywhere off the stage lets go of the selected object. Without this, selecting a
// radar and then clicking a scene tile left the radar selected, and the Delete meant for
// the scene removed the radar instead.
document.addEventListener('pointerdown', (e) => {
  if (!objSel || !e.target.closest) return;
  // [data-obj-keep] marks panels that edit the selected object (the Stage page's inspector).
  if (e.target.closest('.stage') || e.target.closest('.objstrip') || e.target.closest('.objlist') || e.target.closest('[data-obj-keep]')) return;
  objSelect(null);
}, true);

// ---- keys -----------------------------------------------------------------------------
// Window capture, ahead of app.js's document handler — on Control, Delete would otherwise
// go on to delete the selected SCENES as well.
window.addEventListener('keydown', (e) => {
  // Tab / Shift+Tab walk through the objects while a stage (or an objects list) has focus.
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && objList().length) {
    const a = document.activeElement;
    const onStage = a && a.classList && a.classList.contains('stage') && !a.classList.contains('viewonly');
    if (onStage) {
      e.preventDefault(); e.stopImmediatePropagation();
      const list = objList();
      const i = list.findIndex((o) => o.id === objSel);
      const next = list[(i + (e.shiftKey ? -1 : 1) + list.length + (i < 0 && e.shiftKey ? 1 : 0)) % list.length];
      objSelect(next.id);
      return;
    }
  }
  if (!objSel || isTypingTarget(e.target)) return;
  if (e.key === 'Delete') {
    e.preventDefault(); e.stopImmediatePropagation();
    objRemove(objSel);
  } else if (e.key === 'Escape') {
    objSelect(null);       // and let Escape go on to clear the rest
  }
}, true);

// ---- start ----------------------------------------------------------------------------
for (const b of document.querySelectorAll('.objBtn')) {
  b.title = OBJ_HINT[b.dataset.obj] || b.title;
  b.addEventListener('click', () => objAdd(b.dataset.obj));
}
for (const stage of document.querySelectorAll('.stagepane .stage')) objWireStage(stage);
const objPill = document.getElementById('objPill');
if (objPill) objPill.addEventListener('click', () => { location.hash = 'control'; showPage('control'); });
requestAnimationFrame(objFrame);
