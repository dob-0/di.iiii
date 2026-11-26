#!/usr/bin/env node
// live_load.mjs: add a suite's looks AFTER the looks already on the live desk, then load ONE cue list.
// (di show desk tools, 2026-11-26). The looks already on the desk are never wiped or replaced.
//
// Usage: node live_load.mjs <looks.json> <cues.json> [--base http://diiii.localhost/light] [--apply] [--go]
//   <looks.json>  a file with .looks[]  (a suite file)
//   <cues.json>   a file with .cues {project, loop, autoplay, list[]}  (a review file or the suite file)
//   default       DRY RUN: reads the desk, checks names and cue targets, prints what it would do. Writes nothing.
//   --apply       saves a desk snapshot first (its id is the undo), adds each look, loads the cue list, and reads the counts back
//   --go          after --apply: ONE plain GO with no cue number. A number would turn autoplay off (cuerun.js go(index)).
//   --looks-only  after --apply: add/replace the looks only; the cue list (and a running list) is not touched.
//                 The desk reads a playing cue's look by id each frame (desk.js layer lookup), so a replaced look shows at once.
// Undo (one command): curl -s -X POST <base>/api/snapshots/restore -H 'content-type: application/json' -d '{"id":"<snapshot id>"}'
//   The desk saves its own backup before it restores, so the undo can itself be undone.
// Exit codes: 0 ok, 1 a desk call failed (the undo line is printed), 2 refused before any write.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const valued = new Set(['--base', '--replace-prefix']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (files.length !== 2) { console.error('usage: node live_load.mjs <looks.json> <cues.json> [--base URL] [--replace-prefix P] [--apply] [--go]'); process.exit(2); }
const base = opt('--base', 'http://diiii.localhost/light').replace(/\/$/, '');
const apply = flag('--apply'), go = flag('--go'), looksOnly = flag('--looks-only');
const looks = JSON.parse(readFileSync(files[0], 'utf8')).looks;
const cues = JSON.parse(readFileSync(files[1], 'utf8')).cues;

async function call(method, path, body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  let j = null; try { j = await r.json(); } catch { /* not json */ }
  return { status: r.status, body: j };
}
const refuse = (m) => { console.log('REFUSED: ' + m); process.exit(2); };
// The desk stores a look through its own sanitizer. It drops the suite's paper fields (notes, tints, concept, logic,
// poses, rule; seen on a throwaway desk 2026-11-26) and may add defaults. So "the same look" means every field the desk
// kept has the file's value. Dropped fields and added defaults are not compared.
const same = (file, desk) => {
  if (desk === undefined) return true;
  if (Array.isArray(file)) return Array.isArray(desk) && desk.length === file.length && file.every((v, i) => same(v, desk[i]));
  if (file && typeof file === 'object') return !!desk && typeof desk === 'object' && Object.keys(file).every((k) => same(file[k], desk[k]));
  return file === desk;
};
// --replace-prefix <p>: a look whose id starts with <p> may be REPLACED when its content changed (our own earlier load).
// Any other id that is already on the desk with other content is refused, so the looks from before are never replaced.
const replacePrefix = opt('--replace-prefix', null);

if (!Array.isArray(looks) || !looks.length) refuse('no looks in ' + files[0]);
if (!cues || !Array.isArray(cues.list) || !cues.list.length) refuse('no cue list in ' + files[1]);

const before = await call('GET', '/api/looks');
if (before.status !== 200) refuse(`GET /api/looks answered ${before.status}`);
const live = before.body.looks || before.body;
const liveById = new Map(live.map((l) => [l.id, l]));
const toAdd = [], identical = [], clash = [], replaced = [];
for (const l of looks) {
  if (!liveById.has(l.id)) toAdd.push(l);
  else if (same(l, liveById.get(l.id))) identical.push(l.id);
  else if (replacePrefix && l.id.startsWith(replacePrefix)) { toAdd.push(l); replaced.push(l.id); }
  else clash.push(l.id);
}
if (clash.length) refuse(`${clash.length} look ids already on the desk with other content (never replaced${replacePrefix ? '' : '; --replace-prefix allows our own'}): ${clash.slice(0, 5).join(', ')}`);
const known = new Set([...liveById.keys(), ...looks.map((l) => l.id)]);
const orphans = cues.list.filter((c) => !known.has(c.lookId)).map((c) => c.lookId);
if (orphans.length) refuse(`${orphans.length} cues point at looks that will not be on the desk: ${orphans.slice(0, 5).join(', ')}`);
const holds = cues.list.reduce((s, c) => s + (Number(c.hold) || 0), 0);
console.log(`desk now: ${live.length} looks. plan: add ${toAdd.length - replaced.length}, replace ${replaced.length}, already there and identical ${identical.length}; ${looksOnly ? 'the cue list is not touched (looks only)' : `then load cue list "${cues.project}" with ${cues.list.length} cues (holds ${holds} s, loop ${cues.loop === true}, autoplay ${cues.autoplay === true})${go ? ', then one plain GO' : ''}`}.`);
if (!apply) { console.log('dry run: nothing written. Add --apply to load.'); process.exit(0); }

const snap = await call('POST', '/api/snapshots', { name: `Before ${cues.project} (${new Date().toISOString().slice(0, 16)})` });
const snapId = snap.body && snap.body.snapshot && snap.body.snapshot.id;
if (snap.status !== 200 || !snapId) { console.log(`FAILED: the desk snapshot answered ${snap.status}; nothing was written.`); process.exit(1); }
const undo = `undo: curl -s -X POST ${base}/api/snapshots/restore -H 'content-type: application/json' -d '{"id":"${snapId}"}'`;
const fail = (m) => { console.log('FAILED: ' + m); console.log(undo); process.exit(1); };

let added = 0;
for (const look of toAdd) {
  const r = await call('POST', '/api/looks/add', { look });
  if (r.status !== 200 || !r.body || !r.body.ok) fail(`look ${look.id} answered ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  added++;
}
const after = await call('GET', '/api/looks');
const nAfter = (after.body.looks || after.body).length;
if (nAfter !== live.length + added - replaced.length) fail(`the desk holds ${nAfter} looks, expected ${live.length + added - replaced.length}`);
if (looksOnly) {
  console.log(`loaded: ${added - replaced.length} of ${toAdd.length - replaced.length} looks added, ${replaced.length} replaced, the desk holds ${nAfter} looks; the cue list was not touched.`);
  console.log(`snapshot: ${snapId}`); console.log(undo); process.exit(0);
}

const loaded = await call('POST', '/api/cues/load', cues);
const c = loaded.body && loaded.body.cues;
if (loaded.status !== 200 || !c) fail(`cues/load answered ${loaded.status} ${JSON.stringify(loaded.body).slice(0, 160)}`);
const missing = Array.isArray(c.missing) ? c.missing.length : Number(c.missing) || 0;
const n = Array.isArray(c.list) ? c.list.length : c.n;
if (n !== cues.list.length || missing) fail(`the cue list holds ${n} cues with ${missing} missing, expected ${cues.list.length} and 0`);

let state = '';
if (go) {
  const g = await call('POST', '/api/cues/go', {});
  if (g.status !== 200) fail(`GO answered ${g.status} ${JSON.stringify(g.body).slice(0, 160)}`);
  const s = (await call('GET', '/api/cues')).body.cues;
  state = `; GO: running ${s.running}, autoplay ${s.autoplay}, cue ${s.index + 1} of ${s.list.length} "${s.name}"`;
}
console.log(`loaded: ${added - replaced.length} of ${toAdd.length - replaced.length} looks added, ${replaced.length} replaced, the desk holds ${nAfter} looks; cue list "${c.project}" holds ${n} cues, ${missing} missing${state}.`);
console.log(`snapshot: ${snapId}`);
console.log(undo);
