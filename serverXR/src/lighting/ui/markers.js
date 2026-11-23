'use strict';
/* global S, post, say, stageMap, viewOf, snap, snapv, clamp, WORLD, isTypingTarget, spaceHeld, tool, touchedAt:writable, markersPostedAt:writable, objSel:writable, objPaintStrips -- defined by app.js and objects.js, loaded first */
// [labels] Stage labels on the page (studio, 2026-09-24): names on the stage view — "DJ",
// "Stage edge", "Door" — with no DMX. Emily's DJ place had been patched as a 1-channel
// Dimmer fixture, so it counted as a light, "All" picked it, and it was drawn as the
// brightest lamp on every stage. A label is not in S.fixtures, so the rig never sees it.
//
// Loaded after app.js and objects.js; uses app.js's globals (S, post, say, stageMap,
// viewOf, clamp, snap, snapv, spaceHeld, tool, isTypingTarget, markersPostedAt, touchedAt)
// and, when present, objects.js's objSel/objPaintStrips so only one thing is selected.
//
// Drawn on every stage — Setup, Control, the Stage page, and Touch (view-only) — as a flat
// outlined tag in muted grey, UNDER the lights, one size on screen at any zoom. On an
// editable stage: the Label tool adds one (and opens its name for typing), drag moves it,
// double-click renames it, Delete / Backspace removes it. A selected label carries a small bar
// beside it — size − / +, ✕ Delete — so neither is a hidden gesture (her ask, 2026-11-22:
// "when we add a label we can't delete it and resize it"). Every change says so in the
// status strip. A label stands ABOVE the lights: under them (the studio desk's order) a label
// dropped on a light, like the DJ label on the Dimmer, could never be picked up again.
(() => {
  const MAX = 16;
  const SIZE_MIN = 0.6, SIZE_MAX = 3, SIZE_STEP = 0.2;   // the server clamps to the same range
  let markSel = null;           // id of the selected label
  let drag = null;              // {id, pointerId, el, stage, start, ox, oy, moved}
  let lastDown = { id: null, t: 0 };
  let editing = null;           // {id, input, isNew}

  const list = () => (S && Array.isArray(S.markers) ? S.markers : []);
  const byId = (id) => list().find((m) => m.id === id) || null;

  // ---- sending --------------------------------------------------------------------------
  // The whole list, like the objects: leading edge now, then at most every 50ms while a
  // drag goes on, and always once more at the end.
  let postTimer = null, lastPost = 0;
  function send(now = false) {
    if (!S) return;
    const go = () => {
      postTimer = null; lastPost = Date.now(); markersPostedAt = Date.now();
      post('api/markers', { markers: list() }).then((r) => { if (r && r.error) say(r.error, true); });
    };
    if (now) { clearTimeout(postTimer); go(); return; }
    if (postTimer) return;
    if (Date.now() - lastPost > 50) go(); else postTimer = setTimeout(go, 50);
  }

  function select(id) {
    markSel = id;
    // One selected thing at a time: a label and an object both answering Delete would be a trap.
    if (id && typeof objSel !== 'undefined' && objSel) { objSel = null; if (typeof objPaintStrips === 'function') objPaintStrips(); }
  }

  // ---- stage geometry ---------------------------------------------------------------------
  function worldAt(stage, clientX, clientY) {
    const r = stage.getBoundingClientRect();
    const v = viewOf(stage);
    const { sc, ox, oy } = stageMap(r.width, r.height);
    return {
      x: clamp(((clientX - r.left - v.x) / v.zoom - ox) / sc, -WORLD, WORLD),
      y: clamp(((clientY - r.top - v.y) / v.zoom - oy) / sc, -WORLD, WORLD),
    };
  }

  // ---- drawing ------------------------------------------------------------------------------
  // One layer per stage, kept after the lights and just under the objects' handle layer (the
  // video picture and the objects' low layer stay under the lights). buildStages() empties
  // the stage on every structural change, so a missing layer is simply made again.
  function layerFor(inner) {
    let layer = inner.querySelector(':scope > .mklayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'mklayer';
      layer._tags = new Map();
    }
    const top = inner.querySelector(':scope > svg.objtop');
    if (layer.parentElement !== inner || layer.nextElementSibling !== top) inner.insertBefore(layer, top);
    return layer;
  }

  function draw(inner) {
    const stage = inner.parentElement;
    const editable = !!stage && !stage.classList.contains('viewonly');
    const layer = layerFor(inner);
    const W = inner.clientWidth || 0, H = inner.clientHeight || 0;
    const { sc, ox, oy } = stageMap(W, H);
    const alive = new Set();
    for (const m of list()) {
      alive.add(m.id);
      let el = layer._tags.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mk-tag';
        el.dataset.mid = m.id;
        el.innerHTML = '<span class="mk-text"></span>';
        layer.appendChild(el);
        layer._tags.set(m.id, el);
      }
      el.classList.toggle('editable', editable);
      el.classList.toggle('sel', editable && m.id === markSel);
      el.classList.toggle('renaming', !!editing && editing.id === m.id);
      el.style.left = (ox + m.x * sc) + 'px';
      el.style.top = (oy + m.y * sc) + 'px';
      el.style.setProperty('--mks', labelSize(m));
      const t = el.firstChild;
      if (t.textContent !== m.text) t.textContent = m.text;
      el.title = editable ? `${m.text} — a label, not a light. Drag to move, double-click to rename, Delete removes it, the bar beside it sets its size` : m.text;
    }
    for (const [id, el] of layer._tags) {
      if (alive.has(id)) continue;
      el.remove(); layer._tags.delete(id);
    }
  }

  const labelSize = (m) => (Number.isFinite(+m.size) && +m.size > 0 ? +m.size : 1);

  // ---- the bar beside the selected label: size − / +, ✕ Delete ---------------------------------
  // One bar per editable stage, shown only for the label selected on that stage.
  function barFor(stage) {
    let bar = stage._mkBar;
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'mk-bar';
    bar.hidden = true;
    bar.innerHTML = '<button class="sq" data-mk="smaller" title="Label smaller">A−</button><output class="mk-size" title="Label size"></output>'
      + '<button class="sq" data-mk="bigger" title="Label bigger">A+</button>'
      + '<button class="sq danger" data-mk="del" title="Delete this label (Delete or Backspace)">✕ Delete</button>';
    stage.appendChild(bar);
    stage._mkBar = bar;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());   // not a marquee on the stage
    bar.addEventListener('wheel', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mk]');
      if (!b || !markSel) return;
      if (b.dataset.mk === 'del') remove(markSel);
      else resize(markSel, b.dataset.mk === 'bigger' ? SIZE_STEP : -SIZE_STEP);
    });
    return bar;
  }
  function placeBars() {
    for (const stage of document.querySelectorAll('.stagepane .stage:not(.viewonly)')) {
      const bar = barFor(stage);
      const m = markSel && !editing ? byId(markSel) : null;
      const tag = m && stage.offsetParent ? [...stage.querySelectorAll('.mk-tag')].find((el) => el.dataset.mid === markSel) : null;
      bar.hidden = !tag;
      if (!tag) continue;
      const sr = stage.getBoundingClientRect(), tr = tag.getBoundingClientRect();
      const out = bar.querySelector('.mk-size');
      const pct = Math.round(labelSize(m) * 100) + '%';
      if (out.textContent !== pct) out.textContent = pct;
      bar.querySelector('[data-mk="smaller"]').disabled = labelSize(m) <= SIZE_MIN + 0.001;
      bar.querySelector('[data-mk="bigger"]').disabled = labelSize(m) >= SIZE_MAX - 0.001;
      // Above the label, centred; below it when there is no room above; kept inside the stage.
      const bw = bar.offsetWidth, bh = bar.offsetHeight;
      let top = tr.top - sr.top - bh - 6;
      if (top < 4) top = tr.bottom - sr.top + 6;
      bar.style.left = clamp(tr.left - sr.left + tr.width / 2 - bw / 2, 4, Math.max(4, sr.width - bw - 4)) + 'px';
      bar.style.top = clamp(top, 4, Math.max(4, sr.height - bh - 4)) + 'px';
    }
  }
  function resize(id, delta) {
    const m = byId(id);
    if (!m) return;
    m.size = Math.round(clamp(labelSize(m) + delta, SIZE_MIN, SIZE_MAX) * 100) / 100;
    send(true);
    say(`Label "${m.text}" at ${Math.round(m.size * 100)}%`);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!S || document.hidden) return;
    // A selected label that is gone (deleted elsewhere, undone) or not on screen lets go —
    // otherwise Delete on another page would remove a label she cannot see.
    if (markSel && !drag && !editing && (!byId(markSel) || !visibleTag(markSel))) markSel = null;
    for (const inner of document.querySelectorAll('.stage-inner')) {
      if (!inner.offsetParent) continue;
      draw(inner);
    }
    placeBars();
    if (editing) placeEditor();
  }
  const visibleTag = (id) => [...document.querySelectorAll(`.mk-tag[data-mid="${CSS.escape(id)}"]`)].find((el) => el.offsetParent);

  // ---- rename in place ------------------------------------------------------------------
  function rename(id, isNew = false) {
    const m = byId(id);
    const tag = visibleTag(id);
    if (!m || !tag) return;
    stopEditing(false);
    const stage = tag.closest('.stage');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mk-rename';
    input.maxLength = 40;
    input.value = m.text;
    input.spellcheck = false;
    stage.appendChild(input);
    editing = { id, input, stage, isNew, before: m.text };
    placeEditor();
    input.focus(); input.select();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();                         // typing a name must not fire desk keys
      if (e.key === 'Enter') { e.preventDefault(); stopEditing(true); }
      else if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); }
    });
    input.addEventListener('blur', () => stopEditing(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  function placeEditor() {
    const tag = visibleTag(editing.id);
    if (!tag) return;
    const sr = editing.stage.getBoundingClientRect(), tr = tag.getBoundingClientRect();
    const w = Math.max(120, tr.width + 24);
    editing.input.style.left = (tr.left - sr.left + tr.width / 2 - w / 2) + 'px';
    editing.input.style.top = (tr.top - sr.top + tr.height / 2 - 13) + 'px';
    editing.input.style.width = w + 'px';
  }
  function stopEditing(commit) {
    if (!editing) return;
    const ed = editing; editing = null;
    ed.input.remove();
    const m = byId(ed.id);
    if (!m) return;
    const text = ed.input.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (commit && text && text !== ed.before) {
      m.text = text;
      send(true);
      say(ed.isNew ? `Label "${text}" added — drag it where it belongs` : `Label renamed to "${text}"`);
    } else if (ed.isNew) {
      say(`Label "${m.text}" added — double-click it to rename`);
    }
  }

  // ---- add / remove -------------------------------------------------------------------------
  function add(stage) {
    if (!S) return;
    if (!Array.isArray(S.markers)) S.markers = [];
    if (S.markers.length >= MAX) { say(`At most ${MAX} labels on the stage — delete one first`, true); return; }
    // In the middle of what she is looking at on that stage, not somewhere off-screen.
    const r = stage.getBoundingClientRect();
    const c = worldAt(stage, r.left + r.width / 2, r.top + r.height / 2);
    const x = typeof snapv === 'function' && snap ? snapv(c.x) : c.x;
    const y = typeof snapv === 'function' && snap ? snapv(c.y) : c.y;
    const m = { id: 'mk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'label', text: 'Label', x, y, size: 1 };
    S.markers = [...S.markers, m];
    select(m.id);
    send(true);
    // Draw it now so the name box has something to sit on, then open it for typing.
    for (const inner of document.querySelectorAll('.stage-inner')) if (inner.offsetParent) draw(inner);
    rename(m.id, true);
  }

  function remove(id) {
    const m = byId(id);
    if (!m) return;
    S.markers = list().filter((x) => x.id !== id);
    if (markSel === id) markSel = null;
    send(true);
    say(`Label "${m.text}" deleted`);
  }

  // ---- pointer ----------------------------------------------------------------------------------
  function wireStage(stage) {
    if (stage._mkWired || stage.classList.contains('viewonly')) return;
    stage._mkWired = true;
    // Capture phase on the stage, so a press on a label is taken before app.js starts a
    // marquee or a light drag. Anything that is not a label falls through untouched; the
    // hand tool, Space and the middle button still pan across a label.
    stage.addEventListener('pointerdown', (e) => {
      const tag = e.target.closest && e.target.closest('.mk-tag');
      if (!tag || e.button !== 0 || spaceHeld || (typeof tool !== 'undefined' && tool === 'hand')) return;
      const m = byId(tag.dataset.mid);
      if (!m) return;
      e.preventDefault(); e.stopImmediatePropagation();
      select(m.id);
      // A second press on the same label within 350ms is a double-click: rename. Done by hand
      // because the pointer capture below retargets the browser's own dblclick.
      const now = Date.now();
      if (lastDown.id === m.id && now - lastDown.t < 350) { lastDown = { id: null, t: 0 }; rename(m.id); return; }
      lastDown = { id: m.id, t: now };
      drag = { id: m.id, pointerId: e.pointerId, el: tag, stage, start: worldAt(stage, e.clientX, e.clientY), ox: m.x, oy: m.y, moved: false };
      tag.setPointerCapture(e.pointerId);
      stage.classList.add('mkdragging');
      touchedAt = Date.now();
      say(`${m.text} — a label, not a light. Drag to move, double-click to rename, size and ✕ in the bar beside it, Delete removes it`);
    }, true);

    const move = (e) => {
      if (!drag || drag.stage !== stage || e.pointerId !== drag.pointerId) return;
      const m = byId(drag.id);
      if (!m) return;
      const p = worldAt(stage, e.clientX, e.clientY);
      let x = drag.ox + (p.x - drag.start.x), y = drag.oy + (p.y - drag.start.y);
      if (!drag.moved && Math.hypot((x - drag.ox), (y - drag.oy)) < 0.002) return;
      if (typeof snapv === 'function' && snap) { x = snapv(x); y = snapv(y); }
      m.x = clamp(x, -WORLD, WORLD); m.y = clamp(y, -WORLD, WORLD);
      drag.moved = true;
      touchedAt = Date.now();
      send();
    };
    const end = (e) => {
      if (!drag || drag.stage !== stage || (e && e.pointerId !== drag.pointerId)) return;
      const d = drag; drag = null;
      stage.classList.remove('mkdragging');
      if (d.moved) { const m = byId(d.id); send(true); if (m) say(`Label "${m.text}" moved`); lastDown = { id: null, t: 0 }; }
    };
    stage.addEventListener('pointermove', move, true);
    stage.addEventListener('pointerup', end, true);
    stage.addEventListener('pointercancel', end, true);
    // The browser's own double-click still renames when no capture got in the way.
    stage.addEventListener('dblclick', (e) => {
      const tag = e.target.closest && e.target.closest('.mk-tag');
      if (tag && !editing) { e.preventDefault(); e.stopImmediatePropagation(); rename(tag.dataset.mid); }
    }, true);
  }

  // A press anywhere that is not a label lets go of the selected label — clicking a scene
  // tile and pressing Delete must delete the scene, not the label.
  document.addEventListener('pointerdown', (e) => {
    if (!markSel || !e.target.closest) return;
    if (e.target.closest('.mk-tag') || e.target.closest('.mk-rename') || e.target.closest('.mk-bar')) return;
    markSel = null;
  }, true);

  // Window capture, ahead of app.js (Delete there removes scenes on Control and unpatches
  // lights on Setup) and alongside objects.js.
  window.addEventListener('keydown', (e) => {
    if (!markSel || editing || isTypingTarget(e.target)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopImmediatePropagation();
      remove(markSel);
    } else if (e.key === 'Escape') {
      markSel = null;
    } else if (e.key === 'F2') {
      e.preventDefault(); e.stopImmediatePropagation();
      rename(markSel);
    }
  }, true);

  // ---- the Label tool --------------------------------------------------------------------------
  // In every editable stage toolbar (Setup, Control, the Stage page's rail), just before the
  // Objects group — a label is placed the same way an object is.
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h13l5 5-5 5H3z"/><path d="M7 12h6"/></svg>';
  function wireTools() {
    for (const pane of document.querySelectorAll('.stagepane')) {
      const stage = pane.querySelector('.stage');
      const tools = pane.querySelector('.stage-tools');
      if (!stage || !tools || stage.classList.contains('viewonly')) continue;
      wireStage(stage);
      if (tools.querySelector('.mkBtn')) continue;
      const btn = document.createElement('button');
      btn.className = 'tool mkBtn';
      btn.title = 'Add a label — a name on the stage (DJ, door, stage edge), not a light';
      btn.innerHTML = ICON;
      btn.addEventListener('click', () => add(stage));
      const sep = document.createElement('span'); sep.className = 'sep';
      const note = tools.querySelector('.toolnote');
      if (note) { note.before(btn, sep); } else tools.append(sep, btn);
    }
  }

  wireTools();
  requestAnimationFrame(frame);

  // For the harness and anything that needs to know.
  window.StageLabels = { add, remove, rename, resize, list, selected: () => markSel };
})();
