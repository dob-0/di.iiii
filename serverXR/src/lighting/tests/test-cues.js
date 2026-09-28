'use strict';
// The cue runner (cuerun.js): a project's cue list played by the desk, one clock.
// Two desks in turn over one throwaway show directory (the second is the restart),
// each on its own ephemeral HTTP port, offline. Holds are tens of milliseconds.
// Run with: node serverXR/src/lighting/tests/test-cues.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createDesk } = require('../desk');
const { sanitizeCues } = require('../cuerun');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(dir) {
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} });
  const server = http.createServer((req, res) => desk.handle(req, res));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = 'http://127.0.0.1:' + server.address().port;
    const api = async (method, route, body) => {
      const r = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    };
    resolve({
      desk, base,
      GET: (r) => api('GET', r),
      POST: (r, b) => api('POST', r, b || {}),
      stop: () => new Promise((done) => { desk.close(); server.close(() => done()); }),
    });
  }));
}

// A look's id on the cue layer, now.
async function onLayer(d) {
  const { body } = await d.GET('/api/dmx');
  return body.looks.find((l) => l.layer === 'cue') || null;
}

const LOOKS = ['a', 'b', 'c'].map((id) => ({ id: 'rig-' + id, name: id.toUpperCase(), kind: 'all', fixtures: [], steps: [{ values: {} }] }));
const list = (hold) => LOOKS.map((l, i) => ({ id: 'cue-' + i, name: l.name, lookId: l.id, hold, fade: 2 }));

let d;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cues-test-'));

check('sanitizeCues bounds the list and drops a cue with no look', () => {
  const c = sanitizeCues({ project: 'p', list: [{ name: 'x' }, { lookId: 'rig-a', hold: 99999, fade: -3, name: 'y'.repeat(200) }], index: 5, running: true });
  assert.strictEqual(c.list.length, 1);
  assert.strictEqual(c.list[0].hold, 3600);
  assert.strictEqual(c.list[0].fade, 0);
  assert.strictEqual(c.list[0].name.length, 60);
  assert.strictEqual(c.index, -1, 'an index past the list is none');
  assert.strictEqual(c.running, false, 'not running with no cue');
  assert.strictEqual(sanitizeCues({ list: new Array(500).fill({ lookId: 'x' }) }).list.length, 200);
});

check('load + GO fires cue 1 and advances on its hold; /api/dmx carries fadeMs, since, from and the cue summary', async () => {
  for (const look of LOOKS) await d.POST('/api/looks/add', { look });
  const r = await d.POST('/api/cues/load', { project: 'moxir-hall-minimal', list: list(0.08), loop: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await d.POST('/api/cues/go', {})).status, 200);
  let l = await onLayer(d);
  assert.strictEqual(l.lookId, 'rig-a');
  assert.strictEqual(l.fadeMs, 2000);
  assert.ok(l.since >= 0 && l.since < 80, 'since is ms since it was put there');
  await sleep(110);
  l = await onLayer(d);
  assert.strictEqual(l.lookId, 'rig-b', 'moved on by itself');
  assert.strictEqual(l.from, 'rig-a', 'says what it replaced');
  const { body } = await d.GET('/api/dmx');
  assert.strictEqual(body.cues.project, 'moxir-hall-minimal');
  assert.strictEqual(body.cues.index, 1);
  assert.strictEqual(body.cues.n, 3);
  assert.strictEqual(body.cues.name, 'B');
  assert.strictEqual(body.cues.running, true);
  assert.ok(body.cues.nextInMs > 0 && body.cues.nextInMs <= 80);
  const sum = await d.GET('/api/summary');
  assert.strictEqual(sum.body.cues.index, 1, 'the summary says where the list is');
});

check('loop off: stops after the last cue\'s hold, the look stays', async () => {
  await sleep(250);
  const { body } = await d.GET('/api/cues');
  assert.strictEqual(body.cues.index, 2);
  assert.strictEqual(body.cues.running, false);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-c');
  assert.strictEqual(d.desk.state.cues.running, false);
});

check('loop on: the last cue goes back to cue 1', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0.06), loop: true });
  await d.POST('/api/cues/go', { index: 2 });
  await sleep(90);
  const { body } = await d.GET('/api/cues');
  assert.strictEqual(body.cues.index, 0, 'wrapped to cue 1');
  assert.strictEqual(body.cues.running, true);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-a');
  await d.POST('/api/cues/stop');
});

check('GO past the end with loop on goes to cue 1; with loop off it stops', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0), loop: true });
  await d.POST('/api/cues/go', { index: 2 });
  await d.POST('/api/cues/go', {});
  assert.strictEqual((await d.GET('/api/cues')).body.cues.index, 0);
  await d.POST('/api/cues/loop', { loop: false });
  await d.POST('/api/cues/go', { index: 2 });
  const r = await d.POST('/api/cues/go', {});
  assert.strictEqual(r.body.ended, true);
  assert.strictEqual(r.body.cues.running, false);
});

check('STOP cancels the pending cue; the look stays', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0.05), loop: true });
  await d.POST('/api/cues/go', { index: 0 });
  const r = await d.POST('/api/cues/stop');
  assert.strictEqual(r.body.cues.running, false);
  assert.strictEqual(r.body.cues.nextInMs, null);
  await sleep(90);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-a', 'nothing fired after STOP');
});

check('two clients pressing GO at once leave ONE clock: no double fire', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0.1), loop: true });
  const fires = [];
  const was = d.desk.state.layers.find((l) => l.id === 'cue');
  let last = was && was.firedAt;
  const watch = setInterval(() => {
    const layer = d.desk.state.layers.find((l) => l.id === 'cue');
    if (layer && layer.firedAt !== last) { last = layer.firedAt; fires.push(layer.lookId); }
  }, 5);
  await Promise.all([d.POST('/api/cues/go', { index: 0 }), d.POST('/api/cues/go', { index: 0 })]);
  await sleep(350);
  clearInterval(watch);
  await d.POST('/api/cues/stop');
  // The GOs put cue 1 up (twice, maybe in the same millisecond); then ONE advance per
  // 100 ms hold: about 3 in 350 ms. Two clocks would give about 6, each cue twice.
  const after = fires.slice(fires.indexOf('rig-b'));
  assert.ok(after.length >= 2 && after.length <= 4, 'one clock: ' + fires.join(','));
  assert.deepStrictEqual(after, ['rig-b', 'rig-c', 'rig-a', 'rig-b'].slice(0, after.length), 'in order, each once: ' + fires.join(','));
});

check('a hold of 0 waits for GO', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0), loop: true });
  await d.POST('/api/cues/go', { index: 0 });
  await sleep(60);
  const { body } = await d.GET('/api/cues');
  assert.strictEqual(body.cues.index, 0);
  assert.strictEqual(body.cues.running, true);
  assert.strictEqual(body.cues.nextInMs, null);
});

check('BACK fires the cue before', async () => {
  await d.POST('/api/cues/go', { index: 2 });
  await d.POST('/api/cues/back');
  assert.strictEqual((await onLayer(d)).lookId, 'rig-b');
});

check('blackout stops the list (the panic key)', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(0.05), loop: true });
  await d.POST('/api/cues/go', { index: 0 });
  await d.POST('/api/master', { blackout: true });
  const { body } = await d.GET('/api/cues');
  assert.strictEqual(body.cues.running, false);
  await sleep(90);
  assert.strictEqual(d.desk.state.layers.find((l) => l.id === 'cue').lookId, 'rig-a');
  await d.POST('/api/master', { blackout: false });
});

check('a cue whose look is not on the desk is noted, and the loop does not stall', async () => {
  const withMissing = [list(0.05)[0], { id: 'gone', name: 'Gone', lookId: 'rig-gone', hold: 0.05, fade: 0 }, list(0.05)[1]];
  await d.POST('/api/cues/load', { project: 'p', list: withMissing, loop: true });
  await d.POST('/api/cues/go', { index: 0 });
  await sleep(75);
  const mid = await d.GET('/api/cues');
  assert.strictEqual(mid.body.cues.index, 1);
  assert.deepStrictEqual(mid.body.cues.missing, ['rig-gone']);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-a', 'the layer is left as it was');
  await sleep(60);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-b', 'and the list went on');
  await d.POST('/api/cues/stop');
});

check('load with keepIndex keeps the running cue (a hold edited mid-show)', async () => {
  await d.POST('/api/cues/load', { project: 'p', list: list(5), loop: true });
  await d.POST('/api/cues/go', { index: 1 });
  const r = await d.POST('/api/cues/load', { project: 'p', list: list(4), loop: true, keepIndex: true });
  assert.strictEqual(r.body.kept, true);
  assert.strictEqual(r.body.cues.index, 1);
  assert.strictEqual(r.body.cues.running, true);
  assert.ok(r.body.cues.nextInMs <= 4000);
  const other = await d.POST('/api/cues/load', { project: 'q', list: list(4), keepIndex: true });
  assert.strictEqual(other.body.cues.running, false, 'another project\'s list starts stopped');
});

check('a desk restarted mid-show resumes the list where it was', async () => {
  await d.POST('/api/cues/load', { project: 'moxir-hall-minimal', list: list(0.08), loop: true });
  await d.POST('/api/cues/go', { index: 1 });
  await d.stop(); // close() saves the show
  d = await start(dir);
  const { body } = await d.GET('/api/cues');
  assert.strictEqual(body.cues.project, 'moxir-hall-minimal');
  assert.strictEqual(body.cues.running, true);
  assert.strictEqual(body.cues.index, 1);
  assert.strictEqual((await onLayer(d)).lookId, 'rig-b', 'the current look is back on');
  await sleep(110);
  assert.strictEqual((await d.GET('/api/cues')).body.cues.index, 2, 'and the clock runs again');
  await d.POST('/api/cues/stop');
});

(async () => {
  d = await start(dir);
  try {
    for (const t of tests) {
      try { await t.fn(); console.log('  ok   ' + t.name); }
      catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + e.message); }
    }
  } finally {
    await d.stop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('');
  console.log(failures ? '  ' + failures + ' failing' : '  all passing');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
