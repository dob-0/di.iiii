'use strict';
// Show file: export, import and named snapshots (from the studio desk, 2026-09-24; ported
// into di's light desk 2026-11-23). Her ask: "the show file option to save show and then
// export".
//
//   Export     GET api/show/export — the loaded show as one file: the patch, fixture types,
//              scenes (follow times, colour effects, objects), containers, sets, colours,
//              stage objects and labels, the video layer, effects, LFOs, audio, MIDI maps,
//              looks and cues. Never a PIN or any secret, and never the output, DMX input
//              or network settings: those belong to the MACHINE, not to a show (see
//              normaliseOutput in desk.js). The page adds this browser's keyboard mappings.
//   Import     POST api/show/import {mode, show}
//                mode 'preview'  what the file holds and what each way of importing changes
//                     'replace'  everything from the file (master, blackout and what is held
//                                on the wire stay as they are)
//                     'add'      its scenes and containers join yours; clashing ids get new
//                                ones; nothing of yours changes
//                     'patch'    its lights and fixture types replace yours; scenes stay
//              A snapshot of the current show is taken FIRST, so every import can be undone
//              (restore that snapshot).
//   Snapshots  <show dir>/snapshots/*.json — named copies of the show ("before the gig"),
//              PER SHOW (the machine's own, and one folder in each space), written
//              atomically, at most SNAPSHOT_MAX (50; the oldest automatic ones go first).
//              Restore takes a snapshot of the current show first.
//
// ONE WAY IN. Every kind of import builds the show it wants as plain data and hands it to
// `replaceShow` (desk.js), which writes it as the show's file and loads it the way a switch
// of show does: every field through its own validator, fixture types registered before the
// fixtures, fades, chase and cues cancelled. There is no second loader here.
//
// `state` is never held: loading a show swaps the whole object, so every use asks
// `getState()` at the moment it runs.
//
// A show file is {format: 'studio-desk-show', version, exportedAt, desk, show, browser?}. The
// format name is the studio desk's, so a file moves both ways between the two desks. A bare
// show.json (a data folder's file, a backup) is accepted too.

const fs = require('fs');
const os = require('os');
const path = require('path');

const FORMAT = 'studio-desk-show';
const VERSION = 1;
// Never in a show file, whatever else puts them on the state one day.
const SECRET_KEYS = /^(access|pin|pinhash|secret|secrets|session|sessions|token|tokens|auth|password)$/i;
// Machine-only, whatever a file says: where light leaves this machine, what it listens to,
// the network settings. (`output` carries the DMX input config too: output.input.)
const MACHINE_KEYS = new Set(['output', 'input', 'net']);
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MODES = ['replace', 'add', 'patch'];

const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const rand = () => Math.random().toString(36).slice(2, 6);
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
// A show's name as a file name: letters, digits and dashes.
function slug(label) {
  const s = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'light';
}

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  try { fs.renameSync(tmp, file); }
  catch (e) {
    if (!LOCKED.has(e.code)) throw e;
    fs.writeFileSync(file, text);          // a locker that refuses a replace may allow a write
    try { fs.unlinkSync(tmp); } catch (e2) {}
  }
}

function counts(show) {
  const n = (k) => (Array.isArray(show && show[k]) ? show[k].length : 0);
  return {
    fixtures: n('fixtures'), scenes: n('scenes'), banks: n('banks'), sets: n('sets'),
    objects: n('objects'), markers: n('markers'), customProfiles: n('customProfiles'),
  };
}

// What a show file may never carry onto this machine: secrets and the machine's own wiring.
function withoutMachine(show) {
  const out = { ...show };
  for (const k of Object.keys(out)) if (SECRET_KEYS.test(k) || MACHINE_KEYS.has(k)) delete out[k];
  return out;
}

// What a file holds, or why it is not a show file. Refusals are written for a person.
function readDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { error: 'This is not a show file — it is not a JSON object' };
  }
  if (doc.format === FORMAT) {
    if (+doc.version > VERSION) return { error: `This show file comes from a newer desk (format ${doc.version}) — update this desk first` };
    if (!doc.show || typeof doc.show !== 'object' || Array.isArray(doc.show)) return { error: 'This show file is empty — there is no show in it' };
    if (!Array.isArray(doc.show.fixtures) || !Array.isArray(doc.show.scenes)) return { error: 'This show file is damaged — its lights or scenes are missing' };
    return {
      show: doc.show,
      meta: { kind: doc.kind === 'snapshot' ? 'snapshot' : 'export', name: doc.name || null, exportedAt: doc.exportedAt || doc.savedAt || null, desk: doc.desk || null },
      browser: doc.browser && typeof doc.browser === 'object' ? doc.browser : null,
    };
  }
  if (doc.desk === 'artnet-controller' && (doc.map || doc.scenes) && !Array.isArray(doc.fixtures)) {
    return { error: 'This is a keyboard-mapping file — import it under Keyboard mappings (the ⌨ button in the top bar)' };
  }
  if (Array.isArray(doc.fixtures) && Array.isArray(doc.scenes)) {
    return { show: doc, meta: { kind: 'show.json', name: null, exportedAt: null, desk: null }, browser: null };
  }
  if (doc.format) return { error: `This is a "${String(doc.format).slice(0, 40)}" file, not a show from this desk` };
  return { error: 'This file has no show in it — no lights and no scenes. Is it a show exported from this desk?' };
}

// getState()        the live state, read at the moment it is needed
// getShow()         {space, label, dir} of the loaded show (snapshots live in its dir)
// sanitizeScene     the desk's own scene validator (null for a damaged one)
// sanitizeBanks     the desk's own container validator
// replaceShow(disk, {keepChase})   the one way a show is replaced (desk.js)
function attachShowfile({ getState, getShow, sanitizeScene, sanitizeBanks, replaceShow, deskName }) {
  const snapDir = () => path.join(getShow().dir, 'snapshots');
  const MAX = Math.max(2, Number(process.env.SNAPSHOT_MAX || 50));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // The show as the desk would save it: enumerable state only (no live audio/pixels),
  // without the machine's wiring and without secrets.
  const showJson = () => withoutMachine(clone(getState()));
  const exportDoc = () => ({
    format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
    desk: { name: deskName || 'di.iiii light desk', host: os.hostname(), show: getShow().label || null },
    show: showJson(),
  });
  const exportName = () => `${slug(getShow().label)}-show-${stamp().slice(0, 4)}-${stamp().slice(4, 6)}-${stamp().slice(6, 8)}-${stamp().slice(9, 13)}.json`;

  // Scenes through the desk's own validator; damaged ones are counted, not imported.
  function cleanScenes(list) {
    const ok = []; let damaged = 0;
    for (const s of Array.isArray(list) ? list : []) {
      let c = null;
      try { c = sanitizeScene(s); } catch (e) { c = null; }
      if (c) ok.push(c); else damaged++;
    }
    return { ok, damaged };
  }

  const fixtureName = (f) => `${f.name || f.profile} (DMX ${f.address}${(f.universe | 0) ? ', universe ' + f.universe : ''})`;
  function lostFixtures(fileFixtures) {
    const keep = new Set((fileFixtures || []).map((f) => f && f.id));
    return getState().fixtures.filter((f) => !keep.has(f.id));
  }
  function lostWarnings(lost) {
    const w = [];
    if (!lost.length) return w;
    w.push(`${plural(lost.length, 'light')} on this desk ${lost.length === 1 ? 'is' : 'are'} not in the file and will be unpatched: ${lost.slice(0, 6).map(fixtureName).join(', ')}${lost.length > 6 ? ` +${lost.length - 6}` : ''}`);
    return w;
  }

  // ---- preview -----------------------------------------------------------------------
  function preview(r) {
    const state = getState();
    const f = counts(r.show), d = counts(state);
    const sc = cleanScenes(r.show.scenes);
    const deskIds = new Set(state.fixtures.map((x) => x.id));
    const fileIds = new Set((r.show.fixtures || []).map((x) => x && x.id));
    const refsMissing = (fixIds) => sc.ok.filter((s) => s.fixtures.some((x) => !fixIds.has(x.id))).length;
    const damagedLine = sc.damaged ? `${plural(sc.damaged, 'scene')} in the file ${sc.damaged === 1 ? 'is' : 'are'} damaged and will be left out` : null;
    const modes = {};

    // Replace everything
    {
      const lines = [
        `Replaces your ${plural(d.scenes, 'scene')}, ${plural(d.banks, 'container')} and ${plural(d.fixtures, 'light')} with its ${plural(f.scenes, 'scene')}, ${plural(f.banks, 'container')} and ${plural(f.fixtures, 'light')}`,
        'Sets, colours, stage objects and labels, looks, cues, MIDI maps, the video layer, effects, LFOs and audio come from the file too',
        'Master, blackout and what is held on the wire stay as they are; a running chase stops',
      ];
      const warnings = lostWarnings(lostFixtures(r.show.fixtures));
      if (damagedLine) warnings.push(damagedLine);
      modes.replace = { lines, warnings };
    }
    // Add scenes & containers only
    {
      const have = new Set(state.scenes.map((s) => s.id));
      const clash = sc.ok.filter((s) => have.has(s.id)).length;
      const names = new Set(state.banks.map((b) => b.name.toLowerCase()));
      const fileBanks = sanitizeBanks(r.show.banks || []);
      const nameClash = fileBanks.filter((b) => names.has(b.name.toLowerCase())).length;
      const lines = [`Adds ${plural(sc.ok.length, 'scene')} and ${plural(fileBanks.length, 'container')} to your ${plural(d.scenes, 'scene')} and ${plural(d.banks, 'container')} — nothing of yours changes`];
      if (clash) lines.push(`${plural(clash, 'scene')} already ${clash === 1 ? 'has its' : 'have their'} id here and get${clash === 1 ? 's' : ''} a new one`);
      if (nameClash) lines.push(`${plural(nameClash, 'container')} with a name you already use ${nameClash === 1 ? 'is' : 'are'} added as "… (imported)"`);
      const warnings = [];
      const missing = refsMissing(deskIds);
      if (missing) warnings.push(`${plural(missing, 'scene')} reference${missing === 1 ? 's' : ''} lights this desk doesn't have — ${missing === 1 ? 'it lights' : 'they light'} only what is patched here`);
      if (state.banks.length + fileBanks.length > 24) warnings.push(`A desk holds 24 containers — ${state.banks.length + fileBanks.length - 24} of the file's will not fit; their scenes land under Unfiled`);
      if (damagedLine) warnings.push(damagedLine);
      modes.add = { lines, warnings };
    }
    // Patch only
    {
      const lines = [`Replaces your ${plural(d.fixtures, 'light')} with its ${plural(f.fixtures, 'light')}${f.customProfiles ? ` — its ${plural(f.customProfiles, 'fixture type')} join yours` : ''}. Scenes, containers and everything else stay`];
      const warnings = lostWarnings(lostFixtures(r.show.fixtures));
      const yours = state.scenes.filter((s) => s.fixtures.some((x) => !fileIds.has(x.id))).length;
      if (yours) warnings.push(`${plural(yours, 'of your scenes', 'of your scenes')} use${yours === 1 ? 's' : ''} lights that are not in the new patch`);
      modes.patch = { lines, warnings };
    }
    return {
      ok: true, mode: 'preview',
      // Said once, for all three: a file never moves the machine's wiring.
      machine: 'Output, DMX input and network settings belong to this machine — a file never changes them.',
      file: { counts: f, meta: r.meta, hasBrowser: !!r.browser, damagedScenes: sc.damaged },
      desk: { counts: d },
      modes,
    };
  }

  // ---- building the show an import asks for -------------------------------------------------
  // Each returns the whole show as plain data; replaceShow loads it.

  // Only keys this desk's state has: a file cannot add keys of its own to the show.
  function known(file) {
    const allowed = new Set(Object.keys(getState()));
    const out = {};
    for (const k of Object.keys(withoutMachine(file))) if (allowed.has(k)) out[k] = file[k];
    return out;
  }

  function buildReplace(file) {
    const cur = clone(getState());
    const disk = known(file);
    // Live operating state stays: a file must not black out the rig by being opened.
    disk.master = cur.master;
    disk.blackout = cur.blackout;
    disk.raw = cur.raw;
    disk.rawOwners = cur.rawOwners;
    disk.activeScene = null;
    disk.chase = { ...(disk.chase && typeof disk.chase === 'object' ? disk.chase : {}), enabled: false };
    return disk;
  }

  function buildAdd(file) {
    const cur = clone(getState());
    const have = new Set(cur.scenes.map((s) => s.id));
    const idMap = new Map();
    const added = [];
    const newId = () => { let id; do { id = 'sc' + Date.now().toString(36) + rand(); } while (have.has(id)); return id; };
    for (const c of cleanScenes(file.scenes).ok) {
      const id = have.has(c.id) ? newId() : c.id;
      idMap.set(c.id, id);
      have.add(id);
      added.push({ ...c, id });
    }
    for (const c of added) if (c.followId && idMap.has(c.followId)) c.followId = idMap.get(c.followId);
    cur.scenes.push(...added);
    const bankIds = new Set(cur.banks.map((b) => b.id));
    const names = new Set(cur.banks.map((b) => b.name.toLowerCase()));
    const uniqueName = (base) => { let n = base, i = 2; while (names.has(n.toLowerCase())) n = `${base} ${i++}`; names.add(n.toLowerCase()); return n; };
    const newBanks = sanitizeBanks(file.banks || []).map((b) => {
      let id = b.id;
      while (bankIds.has(id)) id = 'bank' + Date.now().toString(36) + rand();
      bankIds.add(id);
      const name = names.has(b.name.toLowerCase()) ? uniqueName(b.name + ' (imported)') : (names.add(b.name.toLowerCase()), b.name);
      return { ...b, id, name, sceneIds: b.sceneIds.map((sid) => idMap.get(sid)).filter(Boolean) };
    });
    cur.banks = sanitizeBanks([...cur.banks, ...newBanks]);
    return { disk: cur, summary: `Added ${plural(added.length, 'scene')} and ${plural(newBanks.length, 'container')}` };
  }

  function buildPatch(file) {
    const cur = clone(getState());
    const fixtures = (file.fixtures || []).filter((f) => f && typeof f === 'object');
    cur.fixtures = fixtures;
    const ids = new Set(fixtures.map((f) => f.id));
    cur.groups = (Array.isArray(file.groups) ? file.groups : [])
      .filter((g) => g && typeof g === 'object' && Array.isArray(g.ids))
      .map((g) => ({ ...g, ids: g.ids.filter((id) => ids.has(id)) }))
      .filter((g) => g.ids.length);
    // Pixel strips are patch too, but only when the file knows about them.
    if (Array.isArray(file.strips)) cur.strips = file.strips;
    // The file's fixture types join yours (its version wins a clash by name).
    const byName = new Map((cur.customProfiles || []).map((p) => [p.name, p]));
    for (const p of Array.isArray(file.customProfiles) ? file.customProfiles : []) if (p && typeof p.name === 'string') byName.set(p.name, p);
    cur.customProfiles = [...byName.values()];
    return { disk: cur, summary: `Patch replaced — ${plural(fixtures.length, 'light')}` };
  }

  // ---- snapshots ---------------------------------------------------------------------------
  const listCache = new Map();   // file → {mtimeMs, meta}
  const fileOf = (id) => (typeof id === 'string' && /^snap-[A-Za-z0-9-]+$/.test(id) ? path.join(snapDir(), id + '.json') : null);

  function readSnapMeta(file) {
    const st = fs.statSync(file);
    const hit = listCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.meta;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const meta = {
      id: path.basename(file, '.json'), name: doc.name || 'Snapshot', auto: !!doc.auto,
      savedAt: doc.savedAt || new Date(st.mtimeMs).toISOString(), counts: doc.counts || counts(doc.show || {}), bytes: st.size,
    };
    listCache.set(file, { mtimeMs: st.mtimeMs, meta });
    return meta;
  }

  function listSnapshots() {
    const dir = snapDir();
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => /^snap-[A-Za-z0-9-]+\.json$/.test(n)); } catch (e) { return []; }
    const out = [];
    for (const n of names) {
      try { out.push(readSnapMeta(path.join(dir, n))); } catch (e) { /* a damaged one is left out of the list */ }
    }
    return out.sort((a, b) => (b.savedAt < a.savedAt ? -1 : b.savedAt > a.savedAt ? 1 : b.id.localeCompare(a.id)));
  }

  function prune() {
    const all = listSnapshots();                  // newest first
    let extra = all.length - MAX;
    if (extra <= 0) return;
    const oldestFirst = [...all].reverse();
    const order = [...oldestFirst.filter((s) => s.auto), ...oldestFirst.filter((s) => !s.auto)];
    for (const s of order) {
      if (extra <= 0) break;
      try { fs.unlinkSync(fileOf(s.id)); listCache.delete(fileOf(s.id)); extra--; } catch (e) {}
    }
  }

  function saveSnapshot(name, { auto = false } = {}) {
    fs.mkdirSync(snapDir(), { recursive: true });
    const show = showJson();
    const id = `snap-${stamp()}-${rand()}`;
    const doc = {
      format: FORMAT, version: VERSION, kind: 'snapshot',
      name: String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Snapshot',
      auto: !!auto, savedAt: new Date().toISOString(), counts: counts(show),
      desk: { name: deskName || 'di.iiii light desk', host: os.hostname(), show: getShow().label || null }, show,
    };
    writeAtomic(fileOf(id), JSON.stringify(doc));
    prune();
    return readSnapMeta(fileOf(id));
  }

  function readSnapshot(id) {
    const file = fileOf(id);
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  // ---- routes ----------------------------------------------------------------------------------
  function routes(json) {
    const fail = (res, e, code = 500) => json(res, { error: typeof e === 'string' ? e : `Could not do that: ${e.message}` }, code);
    const attach = (res, name, file) => res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${name}"`,
    });
    return {
      'GET /api/show/export': (req, res) => {
        const doc = exportDoc();
        const u = new URL(req.url, 'http://localhost');
        doc.name = exportName();
        if (u.searchParams.get('download')) {
          attach(res, doc.name);
          return res.end(JSON.stringify(doc));
        }
        json(res, doc);
      },
      'POST /api/show/import': (req, res, body) => {
        const mode = body && body.mode;
        if (mode !== 'preview' && !MODES.includes(mode)) return fail(res, 'Pick how to import: replace, add or patch', 400);
        const r = readDoc(body.show);
        if (r.error) return fail(res, r.error, 400);
        if (mode === 'preview') return json(res, preview(r));
        let backup;
        try { backup = saveSnapshot(`Before import (${mode === 'replace' ? 'replace everything' : mode === 'add' ? 'add scenes' : 'patch only'})`, { auto: true }); }
        catch (e) { return fail(res, `Could not save a snapshot first, so nothing was imported (${e.code || e.message})`); }
        try {
          let disk, summary, keepChase = true;
          if (mode === 'replace') { disk = buildReplace(r.show); keepChase = false; }
          else { const b = mode === 'add' ? buildAdd(r.show) : buildPatch(r.show); disk = b.disk; summary = b.summary; }
          replaceShow(disk, { keepChase });
          const st = getState();
          if (mode === 'replace') summary = `Show replaced — ${plural(st.scenes.length, 'scene')}, ${plural(st.banks.length, 'container')}, ${plural(st.fixtures.length, 'light')}`;
          json(res, { ok: true, mode, summary, undo: { id: backup.id }, counts: counts(st) });
        } catch (e) { fail(res, e, e.status || 500); }
      },
      'GET /api/snapshots': (req, res) => json(res, { ok: true, dir: snapDir(), max: MAX, snapshots: listSnapshots() }),
      'POST /api/snapshots': (req, res, body) => {
        try { const s = saveSnapshot(body && body.name, { auto: false }); json(res, { ok: true, snapshot: s, snapshots: listSnapshots() }); }
        catch (e) { fail(res, `Could not save the snapshot (${e.code || e.message})`); }
      },
      'POST /api/snapshots/restore': (req, res, body) => {
        const doc = readSnapshot(body && body.id);
        if (!doc) return fail(res, 'That snapshot is not there any more', 404);
        const r = readDoc(doc);
        if (r.error) return fail(res, r.error, 400);
        let backup;
        try { backup = saveSnapshot(`Before restoring "${doc.name || 'snapshot'}"`, { auto: true }); }
        catch (e) { return fail(res, `Could not save a snapshot first, so nothing was restored (${e.code || e.message})`); }
        try {
          replaceShow(buildReplace(r.show), { keepChase: false });
          json(res, { ok: true, name: doc.name, summary: `Restored "${doc.name || 'snapshot'}"`, undo: { id: backup.id }, counts: counts(getState()) });
        } catch (e) { fail(res, e, e.status || 500); }
      },
      'POST /api/snapshots/delete': (req, res, body) => {
        const file = fileOf(body && body.id);
        if (!file || !fs.existsSync(file)) return fail(res, 'That snapshot is not there any more', 404);
        try { fs.unlinkSync(file); listCache.delete(file); json(res, { ok: true, snapshots: listSnapshots() }); }
        catch (e) { fail(res, `Could not delete it (${e.code || e.message})`); }
      },
      'GET /api/snapshots/download': (req, res) => {
        const u = new URL(req.url, 'http://localhost');
        const id = u.searchParams.get('id');
        const file = fileOf(id);
        if (!file || !fs.existsSync(file)) return fail(res, 'That snapshot is not there any more', 404);
        attach(res, `${slug(getShow().label)}-${id}.json`);
        fs.createReadStream(file).pipe(res);
      },
    };
  }

  return { routes, exportDoc, readDoc, preview, saveSnapshot, listSnapshots, snapDir };
}

module.exports = { attachShowfile, readDoc, withoutMachine, FORMAT, VERSION };
