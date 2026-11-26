'use strict';
// The Aim panel on Setup: pick a light on the map, tune its pan / tilt trim beside it.
//
// It writes only through the desk's existing POST api/fixtures/limits ({ ids, limits: { panTrim | tiltTrim } })
// and shows what the desk stored: every write is followed by a state pull, and the numbers drawn come
// from the fixtures' own limits, never from what was pressed. app.js hands over its state once:
//   deskAimPanel.init({ S: () => S, sel: () => sel, fxById, post, say, paintSelection, pullState })   (S is a getter)
//
// Target = the lights the user picked by hand. The desk's default "everything selected" is never a
// target: one stray press must not move every light of a rig someone is aiming (the panel says so).
//   Map focused: arrows nudge pan (left/right) and tilt (down/up) by 1, Shift = 5 (trims may be fractional: steps 0.01 / 0.1 / 1 / 5, kept in localStorage 'trimStep');
//   Tab / Shift+Tab step to the next / previous light of the same line (universe, in address order).
// Light it: the existing identify route (white flash, ten seconds). It is a button, not automatic.
(function (root) {
  const MIN = -255, MAX = 255;
  let h = null, step = aimPanelStoredStep(), busy = Promise.resolve();
  function aimPanelStoredStep() {
    let v = 1;
    try { v = +localStorage.getItem('trimStep') || 1; } catch (e) { /* default */ }
    return [0.01, 0.1, 1, 5].includes(v) ? v : 1;
  }
  const $ = (s) => document.querySelector(s);

  const targets = () => {
    const S = h.S();
    if (!S) return [];
    const ids = [...h.sel()];
    if (ids.length >= S.fixtures.length && S.fixtures.length > 1) return [];   // the default: nothing picked
    return ids.map((id) => h.fxById(id)).filter(Boolean);
  };
  const lim = (f) => f.limits || {};
  // a trim may be fractional (0.25): read it as a number, never with `| 0`
const aimPanelTrim = (f, k) => +(lim(f)[k]) || 0;
  const same = (list, k) => list.every((f) => aimPanelTrim(f, k) === aimPanelTrim(list[0], k));

  function refresh() {
    if (!h || !$('#apWho')) return;
    const t = targets();
    const on = t.length > 0;
    for (const b of document.querySelectorAll('#aimPane .ap-btns button, #apZero, #apLight')) b.disabled = !on;
    if (!on) {
      $('#apWho').textContent = 'Pick a light on the map';
      $('#apSub').textContent = h.sel().size ? 'Everything is selected — click one light, or box-select a few.' : 'Click a light.';
      $('#apPanVal').textContent = '–'; $('#apTiltVal').textContent = '–';
      return;
    }
    const f = t[0];
    $('#apWho').textContent = t.length === 1 ? f.name : t.length + ' lights';
    $('#apWho').title = $('#apWho').textContent;
    $('#apSub').textContent = t.length === 1 ? `Universe ${f.universe + 1} · ${String(f.address).padStart(3, '0')} · #${f.index}` : 'Same nudge on each light';
    const show = (el, k) => { $(el).textContent = same(t, k) ? String(aimPanelTrim(f, k)) : 'mixed'; };
    show('#apPanVal', 'panTrim'); show('#apTiltVal', 'tiltTrim');
  }

  // One queue: a press waits for the write before it, so a fast double press adds up from what
  // the desk stored, not from a stale number. Lights with different stored values get separate
  // calls, each carrying that light's own new value (the same delta on every light).
  function write(fn) {
    busy = busy.then(async () => {
      const t = targets();
      if (!t.length) return;
      const jobs = fn(t);                       // [{ ids, limits }]
      for (const j of jobs) {
        const r = await h.post('api/fixtures/limits', { ids: j.ids, limits: j.limits });
        if (r && r.error) h.say(r.error, true);
      }
      await readBack(t.map((f) => f.id));
      refresh();
    }).catch((e) => h.say('aim: ' + e.message, true));
    return busy;
  }
  // The desk's own answer: what it stored for these lights, straight from api/state. (pullState keeps
  // the old fixtures for 700 ms after any press, so it cannot be the read-back for a fast nudge.)
  async function readBack(ids) {
    const next = await (await fetch('api/state')).json();
    for (const f of (next && next.fixtures) || []) {
      const mine = ids.includes(f.id) && h.fxById(f.id);
      if (mine && f.limits) mine.limits = f.limits;
    }
    h.pullState();
  }
  const clamp = (v) => Math.max(MIN, Math.min(MAX, v));

  function nudge(axis, dir, by) {
    const key = axis + 'Trim';
    return write((t) => {
      const groups = new Map();
      for (const f of t) {
        const v = clamp(Math.round((aimPanelTrim(f, key) + dir * by) * 100) / 100);
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(f.id);
      }
      return [...groups].map(([v, ids]) => ({ ids, limits: { [key]: v } }));
    });
  }
  const zero = () => write((t) => [{ ids: t.map((f) => f.id), limits: { panTrim: 0, tiltTrim: 0 } }]);

  async function light() {
    const t = targets();
    if (!t.length) return;
    const r = await h.post('api/fixtures/identify', { ids: t.map((f) => f.id), seconds: 10 });
    if (r && r.error) return h.say(r.error, true);
    h.say(`${t.length === 1 ? t[0].name : t.length + ' lights'} flashing for ten seconds`);
  }

  // Step to the neighbour in the same line.
  function walk(dir) {
    const t = targets();
    if (!t.length) return false;
    const cur = t[0];
    const line = h.S().fixtures.filter((f) => f.universe === cur.universe).sort((a, b) => a.address - b.address || a.index - b.index);
    const i = line.findIndex((f) => f.id === cur.id) + dir;
    if (i < 0 || i >= line.length) return false;     // the ends let Tab leave the map
    pick(line[i].id);
    return true;
  }

  // Aim this light: it alone is the target, and the map has the keys.
  function pick(id) {
    h.sel().clear(); h.sel().add(id);
    h.paintSelection();
    refresh();
  }
  function focus(id) {
    pick(id);
    const st = document.querySelector('.page[data-page="setup"] .stage');
    if (st) st.focus({ preventScroll: true });
  }

  // The patch strip above can fold away to give the map the height; remembered per browser.
  function patchHidden(hide, save) {
    const page = document.querySelector('.page[data-page="setup"]');
    page.classList.toggle('patch-min', hide);
    const b = $('#apPatchToggle');
    b.setAttribute('aria-pressed', String(hide));
    b.textContent = hide ? 'Patch ▾' : 'Patch ▴';
    b.title = hide ? 'Show the library and patch again' : 'Hide the library and patch to give the map more height';
    if (save) { try { localStorage.setItem('aimPatchHidden', hide ? '1' : '0'); } catch (e) { /* session only */ } }
  }

  function init(hooks) {
    h = hooks;
    const pane = $('#aimPane');
    pane.addEventListener('click', (e) => {
      const st = e.target.closest('[data-step]');
      if (st) {
        step = +st.dataset.step;
        try { localStorage.setItem('trimStep', String(step)); } catch (e) { /* session only */ }
        pane.querySelectorAll('[data-step]').forEach((b) => b.classList.toggle('is-active', b === st));
        return;
      }
      const n = e.target.closest('[data-axis]');
      if (n) nudge(n.dataset.axis, +n.dataset.dir, step);
    });
    $('#apZero').addEventListener('click', zero);
    $('#apLight').addEventListener('click', light);
    let stored = null;
    try { stored = localStorage.getItem('aimPatchHidden'); } catch (e) { /* none */ }
    patchHidden(stored == null ? window.innerHeight < 1200 : stored === '1', false);
    $('#apPatchToggle').addEventListener('click', () => patchHidden(!document.querySelector('.page[data-page="setup"]').classList.contains('patch-min'), true));

    const stage = document.querySelector('.page[data-page="setup"] .stage');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', 'Stage map — arrows nudge the picked light, Tab steps to the next light');
    // the map's own pointer code prevents default, which would stop the click from focusing it
    stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }), true);
    stage.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const by = e.shiftKey ? 5 : 1;
      let hit = true;
      if (e.key === 'ArrowLeft') nudge('pan', -1, by);
      else if (e.key === 'ArrowRight') nudge('pan', 1, by);
      else if (e.key === 'ArrowDown') nudge('tilt', -1, by);
      else if (e.key === 'ArrowUp') nudge('tilt', 1, by);
      else if (e.key === 'Tab') hit = walk(e.shiftKey ? -1 : 1);
      else hit = false;
      if (hit) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    pane.querySelectorAll('[data-step]').forEach((b) => b.classList.toggle('is-active', +b.dataset.step === step));
    refresh();
  }

  root.deskAimPanel = { init, refresh, focus, nudge, zero };
})(window);
