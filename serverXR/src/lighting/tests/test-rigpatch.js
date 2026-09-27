'use strict';
// Auto-patch (rigpatch.js): a room's lamps patched on a throwaway desk, over HTTP,
// the way a room calls it. Plain node, like the other suites, so the club machine can
// run it: node tests/test-rigpatch.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createDesk } = require('../desk');
const { profileNameFor } = require('../rigpatch');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

async function deskOn(existing) {
  const dir = existing || fs.mkdtempSync(path.join(os.tmpdir(), 'desk-rig-'));
  const desk = createDesk({ dataDir: dir, offline: true, log: () => {} });
  const server = http.createServer((q, r) => desk.handle(q, r));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const at = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, route, body) => {
    const r = await fetch(at + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return {
    desk, call, dir,
    close: () => { desk.close(); server.close(); },
    patch: (body) => call('POST', '/api/rig/patch', body),
    stop: () => { desk.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

const beam = (n, extra) => Object.assign({ key: `p:b${n}`, name: `beam ${n}`, code: 'UP-B380F', type: 'up-b380f', mode: '16ch', footprint: 16 }, extra || {});
const at = (a) => a.map((x) => `${x.key}=U${x.universe}.${x.address}`);

check('new lamps are patched at the next free address, universe 1 first', async () => {
  const d = await deskOn();
  const r = await d.patch({ project: 'p', lamps: [beam(1), beam(2), beam(3)] });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(at(r.body.assignments), ['p:b1=U1.1', 'p:b2=U1.17', 'p:b3=U1.33']);
  assert.deepStrictEqual(r.body.assignments.map((a) => a.index), [1, 2, 3]);
  // the desk has them, keyed, on its universe 0, with a 16-channel profile made for the mode
  const f = d.desk.state.fixtures.find((x) => x.rigKey === 'p:b2');
  assert.strictEqual(f.universe, 0);
  assert.strictEqual(f.profile, 'UP-B380F 16ch');
  assert.strictEqual(r.body.assignments[0].footprint, 16);
  d.stop();
});

check('running it again changes nothing (idempotent)', async () => {
  const d = await deskOn();
  const first = await d.patch({ project: 'p', lamps: [beam(1), beam(2)] });
  const lamps = first.body.assignments.map((a, i) => beam(i + 1, { universe: a.universe, address: a.address, index: a.index }));
  const again = await d.patch({ project: 'p', lamps });
  assert.deepStrictEqual(again.body.assignments.map((a) => a.how), ['kept', 'kept']);
  assert.strictEqual(d.desk.state.fixtures.length, 2);
  d.stop();
});

check('a copy carrying its original\'s address gets the next free one and a new index', async () => {
  const d = await deskOn();
  await d.patch({ project: 'p', lamps: [beam(1)] });
  const r = await d.patch({ project: 'p', lamps: [beam(1, { universe: 1, address: 1, index: 1 }), beam(2, { universe: 1, address: 1, index: 1 })] });
  const copy = r.body.assignments.find((a) => a.key === 'p:b2');
  assert.strictEqual(copy.how, 'copy');
  assert.strictEqual(copy.address, 17);
  assert.strictEqual(copy.index, 2);
  assert.strictEqual(r.body.flags.length, 0);
  d.stop();
});

check('a typed address that collides is refused and flagged, never resolved', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/fixtures/add', { profile: 'drgb', universe: 0, address: 10 });
  const r = await d.patch({ project: 'p', lamps: [beam(1, { universe: 1, address: 5 })] });
  assert.strictEqual(r.body.assignments.length, 0);
  assert.strictEqual(r.body.flags[0].code, 'overlap');
  assert.ok(/overlaps 1\.drgb at U1\.010/.test(r.body.flags[0].message), r.body.flags[0].message);
  assert.strictEqual(d.desk.state.fixtures.length, 1);
  d.stop();
});

check('a typed move goes through when free, and the room and desk disagreeing is flagged when not asked', async () => {
  const d = await deskOn();
  await d.patch({ project: 'p', lamps: [beam(1)] });
  const moved = await d.patch({ project: 'p', lamps: [beam(1, { universe: 2, address: 100, move: true })] });
  assert.deepStrictEqual(at(moved.body.assignments), ['p:b1=U2.100']);
  assert.strictEqual(moved.body.assignments[0].how, 'moved');
  const differs = await d.patch({ project: 'p', lamps: [beam(1, { universe: 1, address: 1 })] });
  assert.strictEqual(differs.body.flags[0].code, 'desk-differs');
  assert.strictEqual(d.desk.state.fixtures[0].address, 100);
  d.stop();
});

check('a lamp with no known mode is flagged, gets nothing, and loses a fixture it had', async () => {
  const d = await deskOn();
  await d.patch({ project: 'p', lamps: [beam(1)] });
  const r = await d.patch({ project: 'p', lamps: [beam(1, { footprint: null, mode: null }), { key: 'p:par', code: 'UP-PL5403', type: 'up-pl5403', footprint: null }] });
  assert.deepStrictEqual(r.body.flags.map((f) => f.code), ['mode-unknown', 'mode-unknown']);
  assert.deepStrictEqual(r.body.removed, ['p:b1']);
  assert.strictEqual(d.desk.state.fixtures.length, 0);
  d.stop();
});

check('a mode change reshapes the fixture where it stands, or is refused if it would collide', async () => {
  const d = await deskOn();
  const bsw = (n, mode, fp) => ({ key: `p:s${n}`, code: 'UP-250BSW', type: 'up-250bsw', mode, footprint: fp });
  const first = await d.patch({ project: 'p', lamps: [bsw(1, '24ch', 24), bsw(2, '24ch', 24)] });
  assert.deepStrictEqual(at(first.body.assignments), ['p:s1=U1.1', 'p:s2=U1.25']);
  const grow = await d.patch({ project: 'p', lamps: [bsw(1, '30ch', 30), bsw(2, '24ch', 24)] });
  assert.strictEqual(grow.body.flags[0].code, 'overlap');
  assert.strictEqual(d.desk.state.fixtures.find((f) => f.rigKey === 'p:s1').profile, 'UP-250BSW 24ch');
  const ok = await d.patch({ project: 'p', lamps: [bsw(2, '30ch', 30), bsw(1, '24ch', 24)] });
  assert.strictEqual(ok.body.assignments.find((a) => a.key === 'p:s2').how, 'mode-changed');
  assert.strictEqual(ok.body.assignments.find((a) => a.key === 'p:s2').footprint, 30);
  d.stop();
});

check('deleting a lamp removes its fixture when pruning, and never touches another room or a hand patch', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/fixtures/add', { profile: 'drgb', universe: 3 });
  await d.patch({ project: 'p', lamps: [beam(1), beam(2)] });
  await d.patch({ project: 'q', lamps: [{ key: 'q:x', code: 'UP-B380F', type: 'up-b380f', mode: '16ch', footprint: 16 }] });
  const r = await d.patch({ project: 'p', lamps: [beam(1, { universe: 1, address: 1 })], prune: true });
  assert.deepStrictEqual(r.body.removed, ['p:b2']);
  assert.deepStrictEqual(d.desk.state.fixtures.map((f) => f.rigKey || f.profile).sort(), ['drgb', 'p:b1', 'q:x']);
  const list = await d.call('GET', '/api/rig?project=p');
  assert.deepStrictEqual(list.body.fixtures.map((f) => f.key), ['p:b1']);
  d.stop();
});

check('a group is kept contiguous in the lowest universe with room for all of it', async () => {
  const d = await deskOn();
  const g = (id, code, fp, n) => Array.from({ length: n }, (_, i) => ({ key: `p:${id}${i}`, code, type: code.toLowerCase(), mode: `${fp}ch`, footprint: fp, group: id }));
  const lamps = [...g('stage', 'UP-B380F', 16, 8), ...g('cols', 'UP-B380F', 16, 10), ...g('truss', 'UP-250BSW', 24, 12), ...g('front', 'UP-HK1915', 21, 8)];
  const r = await d.patch({ project: 'p', lamps, group: true });
  const used = {};
  for (const a of r.body.assignments) {
    const u = used[a.universe] || (used[a.universe] = { lo: 512, hi: 0 });
    u.lo = Math.min(u.lo, a.address); u.hi = Math.max(u.hi, a.address + a.footprint - 1);
  }
  // 288 of beams in U1; the truss's 288 do not fit the 224 left, so U2; the bee-eyes' 168 do.
  assert.deepStrictEqual(used, { 1: { lo: 1, hi: 456 }, 2: { lo: 1, hi: 288 } });
  const truss = r.body.assignments.filter((a) => a.key.startsWith('p:truss'));
  assert.ok(truss.every((a) => a.universe === 2));
  assert.deepStrictEqual(truss.map((a) => a.address), truss.map((_, i) => 1 + i * 24));
  d.stop();
});

check('patch this group: a scattered group is laid out again as one block, indices kept', async () => {
  const d = await deskOn();
  const lamps = [beam(1), beam(2), beam(3)].map((l) => Object.assign(l, { group: 'g' }));
  await d.patch({ project: 'p', lamps: [lamps[0]] });
  await d.call('POST', '/api/fixtures/add', { profile: 'drgb' });       // 17-20, in the way
  const scattered = await d.patch({ project: 'p', lamps });
  assert.deepStrictEqual(scattered.body.assignments.map((a) => a.address), [1, 21, 37]);
  const block = await d.patch({ project: 'p', lamps: scattered.body.assignments.map((a, i) => Object.assign(beam(i + 1), { group: 'g', universe: a.universe, address: a.address, index: a.index })), group: true, repatch: true });
  assert.deepStrictEqual(block.body.assignments.map((a) => a.address), [21, 37, 53]);
  assert.deepStrictEqual(block.body.assignments.map((a) => a.index), scattered.body.assignments.map((a) => a.index));
  d.stop();
});

check('the rig key survives a save and a reload; a hand-patched fixture gains no key', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/fixtures/add', { profile: 'drgb' });
  await d.patch({ project: 'p', lamps: [beam(1)] });
  d.desk.writeShow();
  d.close();
  const saved = JSON.parse(fs.readFileSync(path.join(d.dir, 'show.json'), 'utf8'));
  assert.deepStrictEqual(saved.fixtures.map((f) => f.rigKey), [undefined, 'p:b1']);
  const again = await deskOn(d.dir);
  assert.deepStrictEqual(again.desk.state.fixtures.map((f) => f.rigKey), [undefined, 'p:b1']);
  assert.strictEqual(again.desk.state.fixtures[1].profile, 'UP-B380F 16ch');
  const kept = await again.patch({ project: 'p', lamps: [beam(1, { universe: 1, address: 5, index: 2 })] });
  assert.strictEqual(kept.body.assignments[0].how, 'kept');
  again.stop();
});

check('a bad request is refused whole', async () => {
  const d = await deskOn();
  assert.strictEqual((await d.patch({ lamps: [beam(1)] })).status, 400);
  assert.strictEqual((await d.patch({ project: 'p', lamps: [{ key: 'q:x', footprint: 1 }] })).status, 400);
  assert.strictEqual(profileNameFor('UP-B380F', '16ch'), 'UP-B380F 16ch');
  assert.strictEqual(profileNameFor('A very long rental code!!', '97ch').length, 24);
  d.stop();
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok  ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e.message).split("\n").slice(0, 14).join('\n       ')); }
  }
  console.log(`\nrigpatch: ${tests.length - failures}/${tests.length} passed`);
  process.exit(failures ? 1 : 0);
})();
