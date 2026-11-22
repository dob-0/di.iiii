'use strict';
/* exported stagePageRender, stagePageShown */
/* global S, sel:writable, page, post, say, $, setRole, applyColor, queueFixture, recallScene, sceneStrip, banks, bankById, unfiledIds, activePalette, favorites, toggleBlackout, paintBlackout, fitStage, zoomAt, views, esc, asPct, clamp, pullState, paintSelection, isTypingTarget, fxLabel, fxNames, fxSubset, fxOwners, fxLitModes, fxPadPress, fxBackToRig, fxRunning, fxAnyRunning, fxSummary, objSel, objById, objList, objSend, objRemove, ObjCore, ObjEditor -- defined by app.js, objcore.js and objects.js, loaded first */
// The Stage page: the stage view as a whole workspace (her ask, 2026-09-24: "it's a small
// preview, make it extended"). The small stages stay on Setup and Control — she asked for
// them twice — this is the big one for designing with the stage: lights, objects and the
// video layer, with a strip along the bottom to fire looks while she works.
//
// Loaded after app.js, objcore.js and objects.js, and uses their globals (S, sel, post,
// say, setRole, applyColor, queueFixture, recallScene, sceneStrip, banks, bankById,
// unfiledIds, activePalette, favorites, toggleBlackout, fitStage, views, page, esc,
// asPct, clamp, objSel, objById, objList, objSend, objRemove, ObjCore). The stage itself
// is an ordinary `.stagepane .stage` in index.html, so app.js wires it (select, drag,
// marquee, wheel zoom, pan) and objects.js draws and edits objects on it like any other.
// It keeps its OWN view (`views.stage`): zooming here never moves Control's or Touch's.
//
// Nothing here is a second copy of desk logic: colour goes through applyColor/setRole,
// scenes through recallScene, blackout through toggleBlackout, tempo through the top
// bar's own BPM field and Tap button.

const SP_SPATIAL_LABEL = {
  patch: 'Patch order', 'x': 'Left → right', 'x-': 'Right → left', 'y': 'Top → bottom',
  'y-': 'Bottom → top', radial: 'From centre', 'radial-': 'To centre',
};
const SP_KIND = { line: 'Line', radar: 'Radar', ring: 'Ring', spot: 'Spot' };

let spBank = null;            // the strip's open container — its own, like Touch's
try { spBank = localStorage.getItem('stageBank') || null; } catch (e) { /* private mode */ }
let spInspSig = '';           // what the inspector was last built for
let spFitted = false;         // the first visit frames the rig; after that the view is hers
const spPage = () => document.querySelector('.stagepage');
const spStage = () => document.querySelector('.stagepage .stage');
// The desk's fit frames the light CENTRES at 80% of the pane, so on this big stage — where
// the zoom runs high and the labels grow with it — the bottom row's names fell off the
// edge. Here a fit backs off a further 15% about the pane's centre, which stays centred.
function spFit(st = spStage()) {
  if (!st || !st.clientWidth) return false;
  fitStage(st);
  const r = st.getBoundingClientRect();
  zoomAt(st, r.left + r.width / 2, r.top + r.height / 2, views.stage.zoom * 0.85);
  return true;
}

// ---- the strip's container -------------------------------------------------------------
// Same rules as the Touch page: her containers in her order, a virtual Unfiled only while
// something is unfiled. Picking a tab here never moves Control's open container.
function spContainer() {
  const unfiled = () => {
    const ids = unfiledIds();
    return ids.length ? { id: 'unfiled', name: 'Unfiled', color: '#878d92', sceneIds: ids, virtual: true } : null;
  };
  if (spBank === 'unfiled') { const u = unfiled(); if (u) return u; }
  else if (spBank && bankById(spBank)) return bankById(spBank);
  return banks()[0] || unfiled();
}

function spBuildStrip() {
  const cur = spContainer();
  const open = cur ? cur.id : null;
  const un = unfiledIds().length;
  const tabs = banks().map((b) =>
    `<button class="btab${open === b.id ? ' is-active' : ''}" data-tab="${esc(b.id)}" style="--bc:${esc(b.color)}">${esc(b.name)}<i>${b.sceneIds.filter((id) => S.scenes.some((s) => s.id === id)).length}</i></button>`).join('')
    + (un ? `<button class="btab unfiled${open === 'unfiled' ? ' is-active' : ''}" data-tab="unfiled" style="--bc: var(--muted)">Unfiled<i>${un}</i></button>` : '');
  const tabsEl = $('#spTabs');
  if (tabsEl.dataset.sig !== tabs) { tabsEl.dataset.sig = tabs; tabsEl.innerHTML = tabs; }

  const scenes = cur ? cur.sceneIds.map((id) => S.scenes.find((s) => s.id === id)).filter(Boolean) : [];
  const color = cur ? cur.color : '#878d92';
  const tiles = scenes.length
    ? scenes.map((sc) => `<button class="sp-tile" data-id="${esc(sc.id)}" style="--bc:${esc(color)}" title="${esc(sc.name)}"><span class="nm">${esc(sc.name)}</span><span class="bar">${sceneStrip(sc, 8)}</span></button>`).join('')
    : `<span class="muted sp-none">${S.scenes.length ? 'This container is empty' : 'No scenes yet — save a look with Save scene'}</span>`;
  const tilesEl = $('#spTiles');
  const sig = (cur ? cur.id : '') + '#' + scenes.map((s) => s.id + s.name).join('|');
  if (tilesEl.dataset.sig !== sig) { tilesEl.dataset.sig = sig; tilesEl.innerHTML = tiles; }
  for (const t of tilesEl.querySelectorAll('.sp-tile')) t.classList.toggle('is-active', t.dataset.id === S.activeScene);
}

function spSyncLive() {
  // Follow: built from the server's list, like the Control rail's buttons.
  const f = $('#spFollow');
  const modes = S.fxSpatial || ['patch'];
  if (f.dataset.sig !== modes.join(',')) {
    f.dataset.sig = modes.join(',');
    f.innerHTML = modes.map((m) => `<option value="${m}">${SP_SPATIAL_LABEL[m] || m}</option>`).join('');
  }
  if (document.activeElement !== f) f.value = S.fx.spatial || 'patch';
  const m = $('#spMaster');
  if (document.activeElement !== m) m.value = S.master;
  $('#spMasterOut').textContent = asPct(S.master);
  const b = $('#spBpm');
  if (document.activeElement !== b) b.value = S.fx.bpm;
  paintBlackout(S.blackout, ['#spBlackout']);
}

// Called by renderAll on every poll while this page is showing.
function stagePageRender() {
  if (!S) return;
  spBuildStrip();
  spSyncLive();
  spInspector();
}

// Called by showPage. The first visit frames the rig (the Touch page's trick: on a cold
// load — a pop-out window opening straight on #stage — the state may not be in yet, so
// try a few times). Later visits keep whatever view she left.
function stagePageShown(p) {
  if (p !== 'stage' || spFitted) return;
  const tryFit = (left) => {
    const st = spStage();
    if (S && st && st.clientWidth) { spFit(st); spFitted = true; }
    else if (left > 0) setTimeout(() => tryFit(left - 1), 250);
  };
  requestAnimationFrame(() => tryFit(20));
}

// ---- inspector --------------------------------------------------------------------------
// Follows the selection: an object if one is selected (objects.js), else the lights, else a
// hint. Built once per selection and refreshed in place, so a slider under the hand is
// never replaced mid-drag.
function spInspector() {
  const body = $('#spInspBody');
  if (!body || !S) return;
  const o = typeof objById === 'function' && objSel ? objById(objSel) : null;
  const lights = S.fixtures.filter((f) => sel.has(f.id));
  const sig = o ? 'o:' + o.id + ':' + o.kind : 'l:' + lights.map((f) => f.id).join(',');
  if (sig !== spInspSig) {
    spInspSig = sig;
    body.innerHTML = o ? spObjectHtml(o) : lights.length ? spLightsHtml(lights) : spEmptyHtml();
    $('#spInspTitle').textContent = o ? ObjCore.objectName(o, objList()) : lights.length ? (lights.length === 1 ? lights[0].name : `${lights.length} lights`) : 'Inspector';
  }
  if (o) spSyncObject(body, o); else if (lights.length) spSyncLights(body, lights);
  // Effects sit under the lights (or the hint), not under an object's editor.
  const fx = $('#spFx');
  if (fx) { fx.hidden = !!o; if (!o) spEffects(); }
}

// ---- effects ------------------------------------------------------------------------------
// The Control rail's pads, through the same functions (app.js fxPadPress / fxLitModes /
// fxPadSelected), so the two pages can never disagree about who a pad acts on. The colour
// pads are mounted into #spCfx by colorfxui.js, which paints every copy of them.
function spEffects() {
  const pads = $('#spFxPads');
  if (!pads) return;
  const modes = S.fxModes || ['none'];
  if (pads.dataset.sig !== modes.join(',')) {
    pads.dataset.sig = modes.join(',');
    pads.innerHTML = modes.map((m) => `<button class="fxpad${m === 'none' ? ' off' : ''}" data-fx="${m}">${fxLabel(m)}</button>`).join('');
  }
  const lit = fxLitModes();
  for (const b of pads.querySelectorAll('.fxpad')) b.classList.toggle('is-active', lit.has(b.dataset.fx));
  // Who the pads act on, in words — the selection here is the same one the stage shows.
  const tgt = $('#spFxTarget');
  const ids = fxSubset();
  const mine = ids ? S.fixtures.filter((f) => sel.has(f.id)) : [];
  const own = mine.filter((f) => f.fx);
  const sig = (ids ? ids.join(',') : 'rig') + '#' + own.map((f) => f.id + f.fx.mode).join(',') + '#' + fxOwners().length;
  if (tgt.dataset.sig !== sig) {
    tgt.dataset.sig = sig;
    tgt.innerHTML = ids
      ? `<span class="muted">Pads act on</span> <b>${esc(fxNames(mine))}</b> <span class="muted">only</span>` +
        (own.length ? ` <button class="sq" data-act="fx-rig" title="Drop their own effect and follow the rig's again">Back to rig</button>` : '')
      : `<span class="muted">Pads act on the whole rig${fxOwners().length ? ' — lights with their own effect rejoin it' : ''}. Select lights to give them their own.</span>`;
  }
  const st = $('#spFxState');
  st.textContent = fxSummary();
  st.classList.toggle('running', fxAnyRunning());
  const d = $('#spFxDepth');
  if (document.activeElement !== d && +d.value !== S.fx.depth) d.value = S.fx.depth;
  const out = $('#spFxDepthOut');
  out.textContent = asPct(+d.value);
  // Depth 0 is an effect nobody can see — flag it, as the Control rail does.
  out.classList.toggle('bad', fxRunning() && S.fx.depth === 0);
}

function spEmptyHtml() {
  return `<p class="muted">Click a light, or drag a box round several. Click an object to edit it, or add one from the rail — Line, Radar, Ring, Spot.</p>
    <div class="sp-row"><button class="sq" data-act="all">Select all lights</button></div>`;
}

// The roles a light editor shows: dimmer always (lights without one get a virtual dimmer),
// colour when some selected light mixes colour.
function spLightsHtml(lights) {
  const names = lights.slice(0, 6).map((f) => esc(f.name)).join(', ') + (lights.length > 6 ? ` +${lights.length - 6}` : '');
  const hasRgb = lights.some((f) => ((S.profiles[f.profile] || {}).channels || []).includes('r'));
  const slider = (role, label) => `<div class="sp-slider" data-role="${role}"><span class="sp-lab">${label}</span><input type="range" min="0" max="255" data-role="${role}"><b class="sp-v"></b></div>`;
  const pal = activePalette();
  const sw = (hex) => `<button class="sw sp-sw" data-hex="${esc(hex)}" style="background:${esc(hex)}" title="${esc(hex)}"></button>`;
  return `<div class="sp-sec"><div class="sp-sub muted">${names}</div>
      <div class="sp-row"><button class="sq" data-act="on">On</button><button class="sq" data-act="off">Off</button><span class="flex"></span><button class="sq" data-act="all">All</button><button class="sq" data-act="none">None</button></div></div>
    <div class="sp-sec"><h3>Dimmer</h3>${slider('dimmer', 'Level')}</div>
    ${hasRgb ? `<div class="sp-sec"><h3>Colour</h3>
      <div class="sp-swatches" title="${esc(pal[0])}">${pal[1].map(sw).join('')}</div>
      ${favorites().length ? `<div class="sp-swatches sp-favs" title="Favourites">${favorites().map(sw).join('')}</div>` : ''}
      <label class="sp-pick"><span class="sp-lab">Pick</span><input type="color" class="sp-color"></label>
      ${slider('r', 'Red')}${slider('g', 'Green')}${slider('b', 'Blue')}</div>` : ''}`;
}

// Reads come from a light that HAS the role (never simply the first selected): a mixed
// selection's first fixture may not carry it, and would read 0.
function spRoleValue(lights, role) {
  const f = lights.find((x) => role === 'dimmer' || ((S.profiles[x.profile] || {}).channels || []).includes(role));
  return f ? (f.values[role] ?? (role === 'dimmer' ? 255 : 0)) : 0;
}

function spSyncLights(body, lights) {
  for (const w of body.querySelectorAll('.sp-slider')) {
    const inp = w.querySelector('input');
    const v = spRoleValue(lights, w.dataset.role);
    if (document.activeElement !== inp && +inp.value !== v) inp.value = v;
    w.querySelector('.sp-v').textContent = asPct(+inp.value);
  }
  const pick = body.querySelector('.sp-color');
  if (pick && document.activeElement !== pick) {
    const hex = '#' + ['r', 'g', 'b'].map((k) => Math.round(spRoleValue(lights, k)).toString(16).padStart(2, '0')).join('');
    if (pick.value !== hex) pick.value = hex;
  }
}

// Same fields as the objects strip on the small stages, same units: width in % of the
// stage (° for a radar's beam), depth in %, speed in beats (0 = still).
function spObjectHtml(o) {
  if (window.ObjEditor) return ObjEditor.html(o, { full: true });   // [anim]
  const deg = o.kind === 'radar';
  return `<div class="sp-sec"><div class="sp-sub muted">Drag it on the stage · the round handle turns it · the diamond sets its size</div></div>
    <div class="sp-sec sp-fields">
      ${o.kind === 'spot' ? '' : `<label title="Beats for one full sweep, turn or growth — 0 keeps it still">Speed <input type="number" class="sp-o" data-f="beats" min="0" max="64" step="1"><span class="muted">beats</span></label>`}
      <label title="${deg ? 'How wide the beam is' : o.kind === 'spot' ? 'How soft the edge is' : 'How thick it is'}">Width <input type="number" class="sp-o" data-f="width" min="0" step="1"><span class="muted">${deg ? '°' : '% of stage'}</span></label>
      <label title="How dark the lights outside it go — 100% is fully dark">Depth <input type="number" class="sp-o" data-f="depth" min="0" max="100" step="5"><span class="muted">%</span></label>
    </div>
    <div class="sp-sec sp-row"><button class="sq" data-act="obj-on"></button><button class="sq danger" data-act="obj-del">Delete</button></div>`;
}

function spSyncObject(body, o) {
  if (window.ObjEditor) { ObjEditor.sync(body, o); return; }   // [anim]
  const shown = { beats: o.beats, width: o.kind === 'radar' ? Math.round(o.width) : Math.round(o.width * 100), depth: Math.round(o.depth / 2.55) };
  for (const inp of body.querySelectorAll('.sp-o')) {
    const v = shown[inp.dataset.f];
    if (document.activeElement !== inp && inp.value !== String(v)) inp.value = v;
  }
  const on = body.querySelector('[data-act="obj-on"]');
  if (on) { on.textContent = o.on === false ? 'Off' : 'On'; on.classList.toggle('accent', o.on !== false); }
}

// ---- wiring -------------------------------------------------------------------------------
(function spWire() {
  if (!spPage()) return;
  const body = $('#spInspBody');
  if (window.ObjEditor) ObjEditor.wire(body);   // [anim] the shared object editor's fields and buttons

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('.sp-slider input')) {
      setRole(t.dataset.role, +t.value);
      t.closest('.sp-slider').querySelector('.sp-v').textContent = asPct(+t.value);
    } else if (t.matches('.sp-color')) {
      applyColor(t.value);
    } else if (t.matches('.sp-o')) {
      const o = objById(objSel);
      if (!o) return;
      const v = +t.value || 0;
      if (t.dataset.f === 'beats') o.beats = clamp(Math.round(v), 0, 64);
      else if (t.dataset.f === 'width') o.width = o.kind === 'radar' ? v : v / 100;
      else if (t.dataset.f === 'depth') o.depth = Math.round(clamp(v, 0, 100) * 2.55);
      S.objects = ObjCore.sanitizeObjects(objList());
      objSend();
    }
  });
  body.addEventListener('change', (e) => { if (e.target.matches('.sp-o')) objSend(true); });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  body.addEventListener('click', (e) => {
    const sw = e.target.closest('.sp-sw');
    if (sw) { applyColor(sw.dataset.hex); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'all') { sel = new Set(S.fixtures.map((f) => f.id)); paintSelection(); }
    else if (act === 'none') { sel.clear(); paintSelection(); }
    else if (act === 'on') { setRole('dimmer', 255); say(`${sel.size} light${sel.size === 1 ? '' : 's'} on`); }
    else if (act === 'off') {
      for (const f of S.fixtures.filter((x) => sel.has(x.id))) { f.on = false; queueFixture(f.id, { on: false }); }
      say(`${sel.size} light${sel.size === 1 ? '' : 's'} off`);
    } else if (act === 'obj-on') {
      const o = objById(objSel); if (!o) return;
      o.on = o.on === false;
      S.objects = ObjCore.sanitizeObjects(objList()); objSend(true);
      say(`${SP_KIND[o.kind]} ${o.on ? 'on' : 'off'}`);
    } else if (act === 'obj-del') objRemove(objSel);
    spInspector();
  });

  // Inspector open/closed is a per-browser preference, like the rail folds.
  const setInsp = (open) => {
    spPage().classList.toggle('insp-closed', !open);
    $('#spInspOpen').hidden = open;
    try { localStorage.setItem('stageInsp', open ? 'open' : 'closed'); } catch (e) { /* private mode */ }
  };
  let startOpen = true;
  try { startOpen = localStorage.getItem('stageInsp') !== 'closed'; } catch (e) { /* private mode */ }
  setInsp(startOpen);
  $('#spInspClose').addEventListener('click', () => setInsp(false));
  $('#spInspOpen').addEventListener('click', () => setInsp(true));

  // Effects.
  const fxBox = $('#spFx');
  if (fxBox) {
    fxBox.addEventListener('click', (e) => {
      const pad = e.target.closest('#spFxPads .fxpad');
      if (pad) {
        // Every press says what it did — pressing the lit pad is the off switch, and
        // without a word a rig-wide change here reads as "nothing happened". fxPadPress
        // speaks for itself on a selection, or when lights had their own effect; read that
        // BEFORE the press, which clears them.
        const m = pad.dataset.fx;
        const quiet = !fxSubset() && !fxOwners().length;
        const msg = fxRunning() && S.fx.mode === m ? 'Effect off' : m === 'none' ? 'Effects off' : `${fxLabel(m)} on the whole rig`;
        fxPadPress(m);
        if (quiet) say(msg);
        return;
      }
      if (e.target.closest('[data-act="fx-rig"]')) fxBackToRig(S.fixtures.filter((f) => sel.has(f.id) && f.fx));
    });
    let depthTimer = null;
    $('#spFxDepth').addEventListener('input', (e) => {
      S.fx.depth = +e.target.value;   // optimistic, like the Control rail's depth
      $('#spFxDepthOut').textContent = asPct(S.fx.depth);
      clearTimeout(depthTimer);
      depthTimer = setTimeout(() => post('api/fx', { depth: S.fx.depth }), 40);
    });
    $('#spFxDepth').addEventListener('change', (e) => post('api/fx', { depth: +e.target.value }).then(pullState));
  }

  // The strip.
  $('#spTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.btab');
    if (!t) return;
    spBank = t.dataset.tab;
    try { localStorage.setItem('stageBank', spBank); } catch (err) { /* private mode */ }
    spBuildStrip();
  });
  $('#spTiles').addEventListener('click', (e) => {
    const t = e.target.closest('.sp-tile');
    if (!t) return;
    const sc = S.scenes.find((s) => s.id === t.dataset.id);
    S.activeScene = t.dataset.id;          // optimistic: the tile lights on the press
    spBuildStrip();
    recallScene(t.dataset.id);
    if (sc) say(sc.name);
  });
  // A vertical wheel over the one-row tile strip scrolls it sideways.
  $('#spTiles').addEventListener('wheel', (e) => {
    const el = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  $('#spFollow').addEventListener('change', (e) => {
    const m = e.target.value;
    S.fx.spatial = m;
    post('api/fx', { spatial: m }).then(pullState);
    say(`Effects follow: ${SP_SPATIAL_LABEL[m] || m}`);
  });
  $('#spMaster').addEventListener('input', (e) => {
    S.master = +e.target.value;
    $('#spMasterOut').textContent = asPct(S.master);
    post('api/master', { master: S.master });
  });
  // Tempo goes through the top bar's own field and Tap button: one tempo brain.
  $('#spBpm').addEventListener('change', (e) => {
    $('#bpm').value = e.target.value;
    $('#bpm').dispatchEvent(new Event('change'));
  });
  $('#spBpm').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#spTap').addEventListener('click', () => { $('#tapBtn').click(); $('#spBpm').value = $('#bpm').value; });
  // Blackout toggles like the Control and top-bar buttons (toggleBlackout waits for the desk's
  // answer and paints every copy). The B key and the MIDI pad stay one-way (panicKeys.js).
  $('#spBlackout').addEventListener('click', toggleBlackout);

  // Full screen: the whole page, rail + inspector + strip. The top bar is gone then, so the
  // strip carries Blackout, master and tempo, and messages show over the stage.
  const full = $('.spFull');
  full.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const pg = spPage();
    if (!pg.requestFullscreen) { say('This browser cannot go full screen', true); return; }
    pg.requestFullscreen().then(() => say('Full screen — Esc leaves'))
      .catch((err) => say(`Full screen refused — ${err.message}`, true));
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === spPage();
    full.classList.toggle('is-active', on);
    full.title = on ? 'Leave full screen (Esc)' : 'Full screen — the stage page fills the monitor';
    requestAnimationFrame(() => spFit());
  });
  // Pop out: the desk in its own window straight on this page, for a second monitor. It is
  // the whole desk, so everything keeps working there; this window stays as it was.
  $('.spPop').addEventListener('click', () => {
    const w = window.open(location.pathname + '#stage', 'artnetStage', 'popup=yes,width=1600,height=1000');
    if (!w) say('The browser blocked the pop-out — allow pop-ups for this page and try again', true);
    else say('Stage opened in its own window — drag it to the other monitor');
  });

  // The rail's Fit button: app.js fits (its handler runs first), this adds the same margin
  // as F, so the two never disagree.
  const fitBtn = document.querySelector('.stagepage .fitBtn');
  if (fitBtn) fitBtn.addEventListener('click', () => {
    const st = spStage(); if (!st || !st.clientWidth) return;
    const r = st.getBoundingClientRect();
    zoomAt(st, r.left + r.width / 2, r.top + r.height / 2, views.stage.zoom * 0.85);
  });

  // Messages over the stage while full screen (the status strip is outside the page then).
  const strip = $('#statusStrip');
  const msg = $('#spMsg');
  if (strip && msg && window.MutationObserver) {
    new MutationObserver(() => {
      msg.textContent = strip.hidden ? '' : strip.textContent;
      msg.classList.toggle('bad', strip.classList.contains('bad'));
    }).observe(strip, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  // F frames the rig on this page. After app.js's handler: a scene key or a desk mapping
  // bound to F has already claimed it (preventDefault) and wins.
  document.addEventListener('keydown', (e) => {
    if (page !== 'stage' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (spFit()) say('Framed the rig'); }
  });

  // The inspector follows the selection as it changes (a click, a marquee, an object
  // picked) — between polls, not just on them.
  let lastSig = '';
  let lastSync = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    if (page !== 'stage' || !S || document.hidden) return;
    const sig = (objSel || '') + '|' + [...sel].join(',');
    const now = Date.now();
    if (sig !== lastSig || now - lastSync > 200) { lastSig = sig; lastSync = now; spInspector(); }
  };
  requestAnimationFrame(tick);

  // A cold load straight onto #stage (the pop-out window, a bookmark): app.js's first
  // showPage ran before this file existed, so its call to stagePageShown was skipped.
  if (page === 'stage') stagePageShown('stage');
})();
