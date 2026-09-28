'use strict';
/* global deskNow, S, CueCore, $, esc, popScene, popAt, closeBindPop, post, say, pullState, showPage, $$ -- defined by app.js, loaded first */
// [cues] Follow times on the page (studio, 2026-09-24). The server runs the sequence
// (cues.js); this file only edits a scene's follow and shows what is running:
//   - "Follow…" in the scene's right-click menu: wait N s after the fade, then go on to
//     the next scene in its container (default) or any scene; "Stop here" clears it
//   - a small "→ 3s" badge on every tile whose scene has a follow (Control, Stage, Touch)
//   - the running step: its tile outlined, the next one dashed, and "Step 2 of 3 · next in
//     2.4s" beside the transport and in a top-bar pill on every page
//   - Go jumps to the next step while a sequence runs; ❚❚ stops it (and the chase, as before)
// Uses app.js's globals (S, $, $$, esc, post, say, pullState, popScene, popAt,
// closeBindPop, showPage, isTypingTarget), cuecore.js's CueCore (loaded before this file)
// and objects.js's deskNow() when present.
(() => {
  // The desk's clock, not this browser's: the countdown runs to a time the SERVER set, and
  // a phone's clock can be seconds out. objects.js's deskNow() when it is loaded; otherwise
  // the `now` stamped on the last /api/state, carried forward from when it arrived.
  let skewOf = null, skew = 0;
  const nowDesk = () => {
    if (typeof deskNow === 'function') return deskNow();
    if (S && S !== skewOf && Number.isFinite(S.now)) { skewOf = S; skew = S.now - Date.now(); }
    return Date.now() + skew;
  };
  const secs = (ms) => {
    const s = ms / 1000;
    return (s < 10 && s % 1 ? s.toFixed(1) : String(Math.round(s))) + 's';
  };
  const sceneById = (id) => (S && S.scenes.find((s) => s.id === id)) || null;
  const hasBanks = () => !!(S && Array.isArray(S.banks) && S.banks.length);
  const containerOf = (id) => ((S && S.banks) || []).find((b) => b.sceneIds.includes(id)) || null;
  // Where a follow goes on to — cuecore.js, the very answer the server steps by: the
  // scene's followId, else the next in its container, or the next in the library on a
  // desk with no containers.
  const nextOf = (sc, followId = sc && sc.followId) =>
    sceneById(CueCore.followNextId(S ? S.scenes : [], S && S.banks, sc, followId));

  // ---- the menu item and its editor ----------------------------------------------------
  const fadeItem = $('#miFade');
  const mi = document.createElement('button');
  mi.className = 'popitem'; mi.id = 'miFollow'; mi.textContent = 'Follow…';
  mi.title = 'Make this scene run on by itself: wait after its fade, then go on to the next';
  if (fadeItem) fadeItem.after(mi);

  const pop = document.createElement('div');
  pop.id = 'followPop';
  pop.className = 'bindpop followpop';
  pop.hidden = true;
  pop.innerHTML = `
    <div class="bindname" id="fpName"></div>
    <div class="fp-body">
      <label class="fp-row">Wait <input type="number" id="fpWait" min="0" max="600" step="0.5"> s after its fade</label>
      <label class="fp-row">then <select id="fpNext"></select></label>
      <p class="fp-hint" id="fpHint"></p>
      <div class="fp-btns">
        <button class="sq accent" id="fpSave">Save</button>
        <button class="sq" id="fpStop" title="This scene ends its sequence — no follow">Stop here</button>
        <button class="sq" id="fpCancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(pop);
  let editing = null;   // the scene being edited

  function fillNext(sc) {
    const sel = $('#fpNext');
    const b = hasBanks() ? containerOf(sc.id) : null;
    const dflt = nextOf(sc, null);
    const pool = b ? b.sceneIds.map(sceneById).filter(Boolean) : S.scenes;
    // With no containers at all, the default is simply the next scene in the library.
    const where = hasBanks() ? (b ? `the next in ${esc(b.name)}` : null) : 'the next scene';
    sel.innerHTML = `<option value="">${where ? `${where}${dflt ? ` (${esc(dflt.name)})` : ' — none, it is the last'}` : 'the next — none, it is in no container'}</option>`
      + pool.map((s) => `<option value="${esc(s.id)}">${s.id === sc.id ? esc(s.name) + ' (itself — a loop)' : esc(s.name)}</option>`).join('');
    sel.value = sc.followId && sceneById(sc.followId) ? sc.followId : '';
  }
  function paintHint() {
    if (!editing) return;
    const wait = Math.max(0, +$('#fpWait').value || 0);
    const nxt = nextOf(editing, $('#fpNext').value || null);
    const fade = (+editing.fadeMs || 0) / 1000;
    $('#fpHint').textContent = nxt
      ? `Press "${editing.name}" and "${nxt.name}" starts ${secs((fade + wait) * 1000)} later (its ${secs(fade * 1000)} fade + ${secs(wait * 1000)} wait).`
      : hasBanks() ? 'Nothing to go on to — pick a scene, or file this one in a container with a scene after it.'
        : 'Nothing to go on to — it is the last scene; pick one to go on to.';
    $('#fpHint').classList.toggle('bad', !nxt);
    $('#fpSave').disabled = !nxt;
  }
  function openFollow(sc, at) {
    editing = sc;
    $('#fpName').textContent = `Follow — ${sc.name}`;
    $('#fpWait').value = sc.followMs != null ? +(sc.followMs / 1000).toFixed(2) : 3;
    fillNext(sc);
    $('#fpStop').hidden = sc.followMs == null;
    paintHint();
    pop.hidden = false;
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) + 'px';
    $('#fpWait').focus(); $('#fpWait').select();
  }
  function closeFollow() { pop.hidden = true; editing = null; }

  mi.addEventListener('click', () => {
    const sc = popScene();
    const at = { ...popAt };
    closeBindPop();
    if (sc) openFollow(sc, at);
  });
  $('#fpWait').addEventListener('input', paintHint);
  $('#fpNext').addEventListener('change', paintHint);
  $('#fpCancel').addEventListener('click', closeFollow);
  function saveFollow() {
    const sc = editing;
    if (!sc) return;
    const wait = Math.max(0, Math.round((+$('#fpWait').value || 0) * 1000));
    const followId = $('#fpNext').value || null;
    const nxt = nextOf(sc, followId);
    if (!nxt) return;
    closeFollow();
    post('api/scenes/follow', { id: sc.id, followMs: wait, followId }).then((r) => {
      if (r && r.error) say(`follow not saved — ${r.error}`, true);
      else say(`"${sc.name}" goes on to "${nxt.name}" ${secs(wait)} after its fade`);
      pullState();
    });
  }
  $('#fpSave').addEventListener('click', saveFollow);
  pop.addEventListener('keydown', (e) => {
    e.stopPropagation();   // typing a time must not fire the desk's key bindings
    if (e.key === 'Enter') { e.preventDefault(); saveFollow(); }
    if (e.key === 'Escape') closeFollow();
  });
  $('#fpStop').addEventListener('click', () => {
    const sc = editing;
    closeFollow();
    if (!sc) return;
    post('api/scenes/follow', { id: sc.id, followMs: null }).then((r) => {
      if (r && r.error) say(`follow not cleared — ${r.error}`, true);
      else say(`"${sc.name}" now ends its sequence — no follow`);
      pullState();
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target)) closeFollow();
  }, true);

  // ---- Go and Stop act on a running sequence -----------------------------------------------
  // Capture listeners on the buttons themselves run before app.js's own: Go steps the
  // sequence instead of the library while one runs; ❚❚ stops the sequence as well as the chase.
  const running = () => !!(S && S.cue && S.cue.running);
  const go = $('#goBtn');
  if (go) go.addEventListener('click', (e) => {
    if (!running()) return;
    e.stopImmediatePropagation();
    post('api/cue', { action: 'go' }).then((r) => {
      if (r && r.error) say(`next step did not fire — ${r.error}`, true);
      else say('Next step');
      pullState();
    });
  }, true);
  const pause = $('#chasePause');
  if (pause) {
    pause.title = 'Stop the chase, and any follow sequence';
    pause.addEventListener('click', () => {
      if (!running()) return;
      post('api/cue', { action: 'stop' }).then(() => { say('Follow sequence stopped — the look holds'); pullState(); });
    }, true);
  }

  // ---- what is running: status beside the transport, a pill in the top bar ---------------
  const bar = $('.transport');   // di.iiii's scene transport
  const status = document.createElement('span');
  status.className = 'cuestatus';
  status.id = 'cueStatus';
  status.hidden = true;
  status.innerHTML = '<span class="cs-text"></span><button class="sq small" id="cueStop" title="Stop the sequence — the look holds">Stop</button>';
  if (bar) bar.after(status);
  status.querySelector('#cueStop').addEventListener('click', () =>
    post('api/cue', { action: 'stop' }).then(() => { say('Follow sequence stopped — the look holds'); pullState(); }));
  const pills = $('.pills');
  const pill = document.createElement('button');
  pill.id = 'cuePill'; pill.className = 'fxpill cuepill'; pill.hidden = true;
  pill.title = 'A follow sequence is running — go to the Control page to see or stop it';
  if (pills) pills.prepend(pill);
  pill.addEventListener('click', () => { location.hash = 'control'; showPage('control'); });

  const REASON = {
    finished: 'Sequence finished — the last step holds',
    stopped: 'Sequence stopped',
    'another scene was picked': 'Sequence ended — another scene was picked',
    'the chase started': 'Sequence ended — the chase took over',
    'its scene was deleted': 'Sequence ended — a scene in it was deleted',
  };

  function paint() {
    if (!S) return;
    const cue = S.cue || {};
    const on = !!cue.running;
    // Tiles: badge + running outlines. Tiles are rebuilt by app.js from time to time, so
    // the badge is re-added whenever it has gone.
    for (const el of $$('.bankrow[data-id], .tbtn[data-id]')) {   // di.iiii's scene rows and phone tiles
      const sc = sceneById(el.dataset.id);
      const has = !!sc && sc.followMs != null;
      let b = el.querySelector(':scope > .cuebadge');
      if (has) {
        const nxt = nextOf(sc);
        const txt = `→ ${secs(sc.followMs)}`;
        if (!b) { b = document.createElement('i'); b.className = 'cuebadge'; el.appendChild(b); }
        if (b.textContent !== txt) b.textContent = txt;
        b.title = nxt ? `Goes on to "${nxt.name}" ${secs(sc.followMs)} after its fade` : 'Has a follow but nothing to go on to';
        b.classList.toggle('dead', !nxt);
      } else if (b) b.remove();
      el.classList.toggle('cuerun', on && cue.sceneId === el.dataset.id);
      el.classList.toggle('cuenext', on && cue.nextId === el.dataset.id);
    }
    // Status: the step, the total, and a live countdown on the desk's own clock.
    let text = '';
    if (on) {
      const left = Math.max(0, (cue.nextAt || 0) - nowDesk());
      const cur = sceneById(cue.sceneId);
      text = `Step ${cue.step} of ${cue.total}${cue.loops ? ' · loops' : ''} · next in ${secs(Math.ceil(left / 100) * 100)}${cur ? ' · ' + cur.name : ''}`;
    } else if (cue.last && nowDesk() - cue.last.at < 6000) {
      text = REASON[cue.last.reason] || 'Sequence ended';
    }
    status.hidden = !text;
    status.classList.toggle('live', on);
    const t = status.querySelector('.cs-text');
    if (t.textContent !== text) t.textContent = text;
    status.querySelector('#cueStop').hidden = !on;
    pill.hidden = !on;
    const ptxt = on ? `Follow · step ${cue.step}/${cue.total}` : '';
    if (pill.textContent !== ptxt) pill.textContent = ptxt;
  }
  setInterval(paint, 200);
})();
