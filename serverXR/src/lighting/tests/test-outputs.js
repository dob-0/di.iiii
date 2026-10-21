'use strict';
// The output bus (outputStatus.js): every route says ok | unreachable | off, with a reason, and the
// desk puts that on /api/state and /api/summary; plus the show backup taken before a show is replaced.
// Plain node, like the other suites:  node tests/test-outputs.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { routeStatus, busStatus, ERROR_FRESH_MS, NODE_QUIET_MS, SERIAL_STALL_MS } = require('../outputStatus');
const { backupShowFile, KEEP } = require('../showBackup');
const { createDesk } = require('../desk');

let failures = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }
const NOW = 1_000_000;

check('a switched-off route says off, not unreachable', () => {
  const r = routeStatus({ driver: 'artnet', enabled: false, ready: false });
  assert.strictEqual(r.status, 'off');
  assert.match(r.reason, /switched off/);
});

check('an ENTTEC that is not open is unreachable and asks if it is plugged in', () => {
  const r = routeStatus({ driver: 'enttec', enabled: true, serial: { port: '/dev/ttyUSB0', connected: false, lastError: null } });
  assert.strictEqual(r.status, 'unreachable');
  assert.match(r.reason, /ttyUSB0 is not open.*plugged in/);
  assert.strictEqual(routeStatus({ driver: 'enttec', enabled: true, serial: null, serialPort: '/dev/ttyUSB9' }).status, 'unreachable');
});

check('an open ENTTEC is ok until frames stall, then unreachable', () => {
  const s = { port: '/dev/ttyUSB0', connected: true, ageMs: 40 };
  assert.strictEqual(routeStatus({ driver: 'enttec', enabled: true, serial: s }).status, 'ok');
  const stalled = routeStatus({ driver: 'enttec', enabled: true, serial: { ...s, ageMs: SERIAL_STALL_MS + 1 } });
  assert.strictEqual(stalled.status, 'unreachable');
  assert.match(stalled.reason, /no frame left/);
});

check('Art-Net and sACN: a socket that is not ready, or a fresh send error, is unreachable', () => {
  for (const driver of ['artnet', 'sacn']) {
    assert.strictEqual(routeStatus({ driver, enabled: true, ready: false }, [], NOW).status, 'unreachable');
    const failed = routeStatus({ driver, enabled: true, ready: true, lastError: '10.9.9.9: EHOSTUNREACH', lastErrorAt: NOW - 1000 }, [], NOW);
    assert.strictEqual(failed.status, 'unreachable');
    assert.match(failed.reason, /EHOSTUNREACH/);
    assert.strictEqual(routeStatus({ driver, enabled: true, ready: true }, [], NOW).status, 'ok');
  }
});

check('an old send error does not hold the route red forever', () => {
  const r = routeStatus({ driver: 'artnet', enabled: true, ready: true, lastError: '10.9.9.9: EHOSTUNREACH', lastErrorAt: NOW - ERROR_FRESH_MS - 1 }, [], NOW);
  assert.strictEqual(r.status, 'ok');
});

check('an Art-Net node that answered and went quiet is unreachable; one that never answered is not', () => {
  const route = { driver: 'artnet', enabled: true, ready: true, targets: ['10.0.0.5', '10.0.0.6'] };
  const quiet = routeStatus(route, [{ ip: '10.0.0.5', ageMs: NODE_QUIET_MS + 5000 }], NOW);
  assert.strictEqual(quiet.status, 'unreachable');
  assert.match(quiet.reason, /10\.0\.0\.5 answered before/);
  assert.strictEqual(routeStatus(route, [], NOW).status, 'ok', 'silence from a node that never spoke proves nothing');
  assert.strictEqual(routeStatus(route, [{ ip: '10.0.0.5', ageMs: 500 }], NOW).status, 'ok');
});

check('the bus word is the worst route; every route keeps its own line', () => {
  const bus = busStatus([
    { id: 'main', driver: 'artnet', enabled: true, ready: true },
    { id: 'x1', name: 'Widget', driver: 'enttec', enabled: true, serial: { port: '/dev/ttyUSB1', connected: false } },
    { id: 'x2', driver: 'sacn', enabled: false },
  ], [], NOW);
  assert.strictEqual(bus.status, 'unreachable');
  assert.deepStrictEqual(bus.unreachable, ['x1']);
  assert.deepStrictEqual(bus.routes.map((r) => r.status), ['ok', 'unreachable', 'off']);
  assert.strictEqual(busStatus([{ driver: 'artnet', enabled: false }]).status, 'off');
  assert.strictEqual(busStatus([{ driver: 'artnet', enabled: true, ready: true }]).status, 'ok');
});

async function deskOn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-out-'));
  const desk = createDesk({
    dataDir: dir, offline: true, log: () => {},
    spaces: { dir: (id) => path.join(dir, 'spaces', id, 'lighting'), find: async (id) => ({ label: id }) },
  });
  const server = http.createServer((q, r) => desk.handle(q, r));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const at = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, route, body) => {
    const r = await fetch(at + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { call, dir, stop: () => { desk.close(); server.close(); } };
}

check('the desk puts the bus on /api/state: a dead extra device makes it unreachable, a good one does not', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/output', { enabled: true, driver: 'artnet' });
  const before = (await d.call('GET', '/api/state')).body.status.bus;
  assert.strictEqual(before.status, 'ok');
  const added = await d.call('POST', '/api/output/send', { driver: 'enttec', serialPort: '/dev/ttyDEAD0', enabled: true, universes: [0], name: 'Dead widget' });
  assert.ok(added.status < 300, JSON.stringify(added.body));
  const after = (await d.call('GET', '/api/state')).body;
  assert.strictEqual(after.status.bus.status, 'unreachable');
  const bad = after.status.bus.routes.find((r) => r.status === 'unreachable');
  assert.strictEqual(bad.name, 'Dead widget');
  assert.match(bad.reason, /not open/);
  assert.strictEqual(after.status.bus.routes[0].status, 'ok');
  d.stop();
});

check('switching the output off says off on the bus and on the summary', async () => {
  const d = await deskOn();
  await d.call('POST', '/api/output', { enabled: false });
  const s = (await d.call('GET', '/api/summary')).body;
  assert.strictEqual(s.output.bus.status, 'off');
  d.stop();
});

check('backupShowFile copies beside the show, tags the reason, keeps the newest ' + KEEP, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-bak-'));
  const file = path.join(dir, 'show.json');
  assert.strictEqual(backupShowFile(file, 'x'), null, 'no show, no backup');
  fs.writeFileSync(file, '{"fixtures":[1]}');
  const first = backupShowFile(file, 'before reset!', new Date('2026-01-01T00:00:00Z'));
  assert.match(path.basename(first), /^show-2026-01-01T00-00-00-000Z-before-reset-\.json$/);
  assert.strictEqual(fs.readFileSync(first, 'utf8'), '{"fixtures":[1]}');
  for (let i = 0; i < KEEP + 3; i++) backupShowFile(file, 'n', new Date(Date.UTC(2026, 1, 1, 0, 0, i)));
  const kept = fs.readdirSync(path.join(dir, 'backups'));
  assert.strictEqual(kept.length, KEEP);
  assert.ok(!kept.some((f) => f.includes('2026-01-01')), 'oldest dropped first');
});

check('leaving a show for another backs it up first', async () => {
  const d = await deskOn();
  fs.writeFileSync(path.join(d.dir, 'show.json'), '{"fixtures":[],"scenes":[],"looks":[]}');
  const opened = await d.call('POST', '/api/show/open', { space: 'lab', live: true });
  assert.strictEqual(opened.status, 200, JSON.stringify(opened.body));
  const backups = fs.readdirSync(path.join(d.dir, 'backups'));
  assert.ok(backups.some((f) => f.endsWith('-before-switch.json')), backups.join());
  d.stop();
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok  ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log(`\noutputs: ${tests.length - failures}/${tests.length} passed`);
  process.exit(failures ? 1 : 0);
})();
