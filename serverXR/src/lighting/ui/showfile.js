'use strict';
/* global S, $, $$, say, post, esc, pullState, askThen, paintKeyPanel, sceneHotkeys:writable, deskKeymap:writable -- defined by app.js, loaded first */
// The Show file panel (from the studio desk, 2026-09-24; ported 2026-11-23) — her ask: "the show
// file option to save show and then export". Export the whole show as one file, import one back
// (with a preview of what changes, and Undo), and named snapshots kept beside the show.
//
// Opened from a "Show file" button in the top bar and one on Setup's Patch pane. The server half
// is showfile.js. Loaded after app.js; uses its globals (S, $, $$, esc, post, say, pullState,
// askThen) and, for this browser's key mappings, sceneHotkeys/deskKeymap — they live in
// localStorage, so the page (not the server) puts them in the file and takes them back out. MIDI
// maps are not here: di keeps them in the show, so the file carries them already. Addresses are
// relative (api/...): the page lives at /light/ and at /light/space/<id>/.
(() => {
  const BROWSER_KEYS = { sceneHotkeys: 'sceneHotkeys', deskKeymap: 'deskKeymap' };
  let open = false;
  let built = false;
  let pendingFile = null;      // {doc, name, preview} while an import waits for Apply
  let undo = null;             // {id, what, at} after an import or a restore
  let snaps = [];
  let snapDir = '';

  const plural = (n, one) => `${n} ${n === 1 ? one : one + 's'}`;
  const countLine = (c) => c ? `${plural(c.scenes, 'scene')} · ${plural(c.banks, 'container')} · ${plural(c.fixtures, 'light')}` : '';
  const pad = (n) => String(n).padStart(2, '0');
  const fileStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const when = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return d.toDateString() === new Date().toDateString() ? `today ${t}` : `${d.toDateString().slice(4, 10)} ${t}`;
  };

  function readBrowser() {
    const out = {};
    for (const [k, store] of Object.entries(BROWSER_KEYS)) {
      try { const v = JSON.parse(localStorage.getItem(store)); if (v && typeof v === 'object' && Object.keys(v).length) out[k] = v; } catch (e) { /* private window */ }
    }
    return Object.keys(out).length ? out : null;
  }
  // Put a file's mappings into this browser, and into the page's live copies so they work now.
  function writeBrowser(b) {
    if (!b) return 0;
    let n = 0;
    for (const [k, store] of Object.entries(BROWSER_KEYS)) {
      const v = b[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      try { localStorage.setItem(store, JSON.stringify(v)); n++; } catch (e) { continue; }
      try {
        if (k === 'sceneHotkeys' && typeof sceneHotkeys !== 'undefined') sceneHotkeys = v;
        if (k === 'deskKeymap' && typeof deskKeymap !== 'undefined') deskKeymap = v;
      } catch (e) { /* the page keeps its own on the next load */ }
    }
    try { if (typeof paintKeyPanel === 'function') paintKeyPanel(); } catch (e) {}
    return n;
  }

  // ---- export ---------------------------------------------------------------------------
  async function doExport() {
    let doc;
    try {
      const r = await fetch('api/show/export', { cache: 'no-store' });
      doc = await r.json();
      if (!r.ok || doc.error) throw new Error(doc.error || 'HTTP ' + r.status);
    } catch (e) { say(`Could not export the show — ${e.message}`, true); return; }
    const withBrowser = $('#sfExpBrowser') && $('#sfExpBrowser').checked;
    const b = withBrowser ? readBrowser() : null;
    if (b) doc.browser = b;
    const name = doc.name || `light-show-${fileStamp()}.json`;
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    const c = doc.show ? { scenes: (doc.show.scenes || []).length, banks: (doc.show.banks || []).length, fixtures: (doc.show.fixtures || []).length } : null;
    $('#sfExpDone').textContent = `Downloaded ${name} — ${countLine(c)}${b ? ' · with this browser\'s key mappings' : ''}. It is in your Downloads folder.`;
    say(`Show exported — ${name}`);
  }

  // ---- import -----------------------------------------------------------------------------
  async function pickFile(file) {
    let doc;
    try { doc = JSON.parse(await file.text()); }
    catch (e) { showRefusal(file.name, 'This is not a show file — it is not JSON'); return; }
    const r = await post('api/show/import', { mode: 'preview', show: doc });
    if (!r || r.error) { showRefusal(file.name, (r && r.error) || 'The desk did not answer'); return; }
    pendingFile = { doc, name: file.name, preview: r };
    paintPreview();
  }
  function showRefusal(name, why) {
    pendingFile = null;
    const box = $('#sfPreview');
    box.hidden = false;
    box.innerHTML = `<div class="sf-refused"><b>${esc(name)}</b><p>${esc(why)}</p></div>`;
    say(why, true);
  }
  function paintPreview() {
    const box = $('#sfPreview');
    if (!pendingFile) { box.hidden = true; box.innerHTML = ''; return; }
    const { preview: p, name } = pendingFile;
    const m = p.file.meta || {};
    const from = m.kind === 'show.json' ? 'a show file straight from a desk\'s data folder'
      : m.kind === 'snapshot' ? `a snapshot "${m.name || ''}"${m.exportedAt ? ' from ' + when(m.exportedAt) : ''}`
      : `exported ${when(m.exportedAt)}${m.desk && m.desk.host ? ' on ' + m.desk.host : ''}`;
    const mode = (k, label, hint) => {
      const x = p.modes[k];
      return `<label class="sf-mode"><input type="radio" name="sfMode" value="${k}"${k === 'add' ? ' checked' : ''}><span><b>${label}</b> <span class="muted">${hint}</span>
        <span class="sf-lines">${x.lines.map((l) => `<span>${esc(l)}</span>`).join('')}${(x.warnings || []).map((w) => `<span class="warn">${esc(w)}</span>`).join('')}</span></span></label>`;
    };
    box.hidden = false;
    box.innerHTML = `
      <div class="sf-file"><b>${esc(name)}</b><span class="muted">${esc(from)}</span><span>${esc(countLine(p.file.counts))}</span></div>
      ${mode('add', 'Add scenes & containers', '— yours stay, the file\'s join them')}
      ${mode('replace', 'Replace everything', '— the whole show from the file')}
      ${mode('patch', 'Patch only', '— its lights, your scenes')}
      <p class="sf-hint">${esc(p.machine || '')}</p>
      ${p.file.hasBrowser ? '<label class="sf-check"><input type="checkbox" id="sfWithBrowser" checked> Also this browser\'s key mappings from the file (with Replace everything)</label>' : ''}
      <div class="sf-row"><button class="sq accent" id="sfApply">Apply</button><button class="sq" id="sfCancel">Cancel</button><span class="muted">A snapshot of your show is saved first — Undo puts it back.</span></div>`;
    $('#sfCancel').addEventListener('click', () => { pendingFile = null; paintPreview(); say('Import cancelled — nothing changed'); });
    $('#sfApply').addEventListener('click', applyImport);
  }
  async function applyImport() {
    if (!pendingFile) return;
    const mode = ($('#sfPreview input[name="sfMode"]:checked') || {}).value || 'add';
    const withBrowser = mode === 'replace' && $('#sfWithBrowser') && $('#sfWithBrowser').checked;
    $('#sfApply').disabled = true;
    const r = await post('api/show/import', { mode, show: pendingFile.doc });
    if (!r || r.error) { say(`Import failed — ${(r && r.error) || 'the desk did not answer'}. Nothing changed.`, true); $('#sfApply').disabled = false; return; }
    const n = withBrowser ? writeBrowser(pendingFile.doc.browser) : 0;
    undo = { ...r.undo, what: `Imported ${pendingFile.name}`, at: Date.now() };
    pendingFile = null;
    paintPreview();
    say(`${r.summary}${n ? ' · key mappings taken' : ''} — Undo import is in the Show file panel`);
    paintUndo();
    await pullState();
    loadSnaps();
  }
  async function doUndo() {
    if (!undo) return;
    const u = undo;
    const r = await post('api/snapshots/restore', { id: u.id });
    if (!r || r.error) { say(`Undo failed — ${(r && r.error) || 'the desk did not answer'}`, true); return; }
    undo = null;
    paintUndo();
    say(`Undone — ${u.what.replace(/^Imported/, 'the show is back as it was before importing').replace(/^Restored/, 'back to before restoring')}`);
    await pullState();
    loadSnaps();
  }
  function paintUndo() {
    const el = $('#sfUndo');
    if (!el) return;
    el.hidden = !undo;
    if (undo) el.querySelector('.sf-undo-text').textContent = `${undo.what} at ${when(new Date(undo.at).toISOString())}`;
  }

  // ---- snapshots ----------------------------------------------------------------------------
  async function loadSnaps() {
    try {
      const r = await (await fetch('api/snapshots', { cache: 'no-store' })).json();
      if (r && r.ok) { snaps = r.snapshots; snapDir = r.dir; }
    } catch (e) { /* the status strip already says when the desk is unreachable */ }
    paintSnaps();
  }
  function paintSnaps() {
    const list = $('#sfSnaps');
    if (!list) return;
    $('#sfSnapDir').textContent = snapDir ? `Saved on this computer in ${snapDir}` : '';
    list.innerHTML = snaps.length ? snaps.map((s) => `
      <div class="sf-snap${s.auto ? ' auto' : ''}" data-id="${esc(s.id)}">
        <div class="sf-snap-txt"><b>${esc(s.name)}</b><span class="muted">${esc(when(s.savedAt))} · ${esc(countLine(s.counts))}${s.auto ? ' · automatic' : ''}</span></div>
        <button class="sq" data-act="restore" title="Put the show back to this snapshot — your current show is saved as a snapshot first">Restore</button>
        <a class="sq" data-act="download" href="api/snapshots/download?id=${encodeURIComponent(s.id)}" title="Download it as a show file">Download</a>
        <button class="sq" data-act="delete" title="Delete this snapshot">✕</button>
      </div>`).join('') : '<p class="muted sf-empty">No snapshots yet — save one before you change a lot.</p>';
  }
  async function saveSnap() {
    const name = $('#sfSnapName').value.trim() || `Snapshot ${fileStamp().replace(/-(\d\d)(\d\d)$/, ' $1:$2')}`;
    const r = await post('api/snapshots', { name });
    if (!r || r.error) { say(`Snapshot not saved — ${(r && r.error) || 'the desk did not answer'}`, true); return; }
    $('#sfSnapName').value = '';
    snaps = r.snapshots; paintSnaps();
    say(`Snapshot "${r.snapshot.name}" saved — ${countLine(r.snapshot.counts)}`);
  }
  async function snapAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.sf-snap');
    const id = row && row.dataset.id;
    const s = snaps.find((x) => x.id === id);
    if (!s) return;
    const act = btn.dataset.act;
    if (act === 'download') { say(`Downloading "${s.name}"`); return; }
    if (act === 'delete') {
      askThen(`Delete the snapshot "${s.name}"? This cannot be undone.`, 'Delete', async () => {
        const r = await post('api/snapshots/delete', { id });
        if (!r || r.error) { say(`Not deleted — ${(r && r.error) || 'the desk did not answer'}`, true); return; }
        snaps = r.snapshots; paintSnaps();
        say(`Snapshot "${s.name}" deleted`);
      });
      return;
    }
    if (act === 'restore') {
      const r = await post('api/snapshots/restore', { id });
      if (!r || r.error) { say(`Not restored — ${(r && r.error) || 'the desk did not answer'}. Nothing changed.`, true); return; }
      undo = { ...r.undo, what: `Restored "${s.name}"`, at: Date.now() };
      paintUndo();
      say(`${r.summary} — ${countLine(r.counts)} · Undo is in the Show file panel`);
      await pullState();
      loadSnaps();
    }
  }

  // ---- the panel -----------------------------------------------------------------------------
  function build() {
    const el = document.createElement('aside');
    el.className = 'sfpanel';
    el.id = 'showPanel';
    el.hidden = true;
    el.innerHTML = `
      <div class="sf-top"><h2>Show file</h2><span class="flex"></span><button class="sq" id="sfClose" title="Close (Esc)">✕</button></div>
      <div class="sf-body">
        <div class="sf-undo" id="sfUndo" hidden><span class="sf-undo-text"></span><button class="sq accent" id="sfUndoBtn">Undo</button></div>
        <section class="sf-sec">
          <h3>Export</h3>
          <p class="sf-hint">The whole show in one file: lights and where they stand, fixture types, scenes (with follow times and colour effects), containers, sets, colours, stage objects and labels, the video layer, effects, LFOs, audio, MIDI maps, looks and cues. Never a PIN, and never the output, DMX input or network settings: those belong to this machine.</p>
          <label class="sf-check"><input type="checkbox" id="sfExpBrowser" checked> With this browser's key mappings</label>
          <div class="sf-row"><button class="sq accent" id="sfExport">Download the show</button></div>
          <p class="sf-done muted" id="sfExpDone"></p>
        </section>
        <section class="sf-sec">
          <h3>Import</h3>
          <p class="sf-hint">A show exported from this desk or the studio desk, a snapshot, or a show.json from a desk's data folder. You see what changes before anything does.</p>
          <div class="sf-row"><button class="sq" id="sfPick">Choose a file…</button><input type="file" id="sfFile" accept=".json,application/json" hidden></div>
          <div class="sf-preview" id="sfPreview" hidden></div>
        </section>
        <section class="sf-sec">
          <h3>Snapshots</h3>
          <p class="sf-hint">A copy of the show as it is now, kept beside this show — "before the gig", "Rave night". Restoring saves the current show as a snapshot first.</p>
          <div class="sf-row"><input type="text" id="sfSnapName" placeholder="before the gig" maxlength="60" spellcheck="false"><button class="sq accent" id="sfSnapSave">Save snapshot</button></div>
          <div class="sf-snaps" id="sfSnaps"></div>
          <p class="muted sf-dir" id="sfSnapDir"></p>
        </section>
      </div>`;
    document.body.appendChild(el);
    $('#sfClose').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape' && !e.defaultPrevented) setOpen(false); });
    // Typing a name must not fire the desk's key bindings (scene keys, B, digits, Delete).
    el.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select')) {
        e.stopPropagation();
        if (e.key === 'Enter' && e.target.id === 'sfSnapName') saveSnap();
      }
    });
    $('#sfExport').addEventListener('click', doExport);
    $('#sfPick').addEventListener('click', () => $('#sfFile').click());
    $('#sfFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) pickFile(f); e.target.value = ''; });
    $('#sfSnapSave').addEventListener('click', saveSnap);
    $('#sfSnaps').addEventListener('click', snapAction);
    $('#sfUndoBtn').addEventListener('click', doUndo);
    built = true;
  }

  function setOpen(v) {
    open = v;
    if (v && !built) build();
    const el = $('#showPanel');
    if (el) el.hidden = !v;
    for (const b of $$('.sfOpen')) b.classList.toggle('is-active', v);
    if (v) { paintUndo(); loadSnaps(); }
  }

  function init() {
    for (const sel of ['#showBtn', '#showBtnSetup']) {
      const b = $(sel);
      if (b) b.addEventListener('click', () => setOpen(!open));
    }
    window.ShowFile = { open: () => setOpen(true), close: () => setOpen(false), undo: () => undo };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
