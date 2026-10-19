'use strict';
// The switch rule of ui/dmxfeed.js: stream on -> no poll; stream silent 2 s -> poll resumes;
// stream back -> poll stops. A fake clock and a fake EventSource, no network.
// Run with: node serverXR/src/lighting/tests/test-dmxfeed.js

const assert = require('assert');
const { createFeed, applyFrame, same, BACKOFF } = require('../ui/dmxfeed');

function rig(extra = {}) {
  let t = 0, id = 0;
  const timers = new Map();
  const log = { polls: 0, paints: 0, opens: 0 };
  const sources = [];
  let pollAnswer = { 0: [1, 2, 3] };
  const api = {
    now: () => t,
    setTimeout: (fn, ms) => { timers.set(++id, { fn, at: t + ms, every: 0 }); return id; },
    setInterval: (fn, ms) => { timers.set(++id, { fn, at: t + ms, every: ms }); return id; },
    clearTimeout: (h) => timers.delete(h),
    clearInterval: (h) => timers.delete(h),
    open: () => {
      const l = {};
      const es = { readyState: 1, closed: false, addEventListener: (n, f) => { l[n] = f; }, close() { this.closed = true; this.readyState = 2; }, emit: (n, ev) => l[n] && l[n](ev) };
      sources.push(es); log.opens++;
      return es;
    },
    poll: async () => { log.polls++; return JSON.parse(JSON.stringify(pollAnswer)); },
    onUpdate: () => { log.paints++; },
    ...extra,
  };
  const feed = createFeed(api);
  const advance = async (ms) => {
    const end = t + ms;
    for (;;) {
      let next = null;
      for (const [h, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [h, x];
      if (!next) break;
      t = next[1].at;
      if (next[1].every) next[1].at += next[1].every; else timers.delete(next[0]);
      next[1].fn();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    }
    t = end;
    await Promise.resolve(); await Promise.resolve();
  };
  const frame = (es, d, k = 0) => es.emit('frame', { data: JSON.stringify({ s: 1, t, k, d }) });
  return { feed, log, sources, advance, frame, setPoll: (v) => { pollAnswer = v; } };
}

const tests = [];
const check = (n, fn) => tests.push({ n, fn });

check('applyFrame writes runs into whole universes and says whether anything changed', () => {
  const dmx = {};
  assert.ok(applyFrame(dmx, { d: [[0, 0, new Array(512).fill(0)]] }));
  assert.ok(applyFrame(dmx, { d: [[0, 10, [5, 6]]] }));
  assert.deepStrictEqual(dmx[0].slice(9, 13), [0, 5, 6, 0]);
  assert.ok(!applyFrame(dmx, { d: [[0, 10, [5, 6]]] }), 'the same values are no change');
  assert.ok(same({ 0: [1] }, { 0: [1] }) && !same({ 0: [1] }, { 0: [2] }));
});

check('stream off (cap false or no EventSource): the poll runs and no stream is opened', async () => {
  const r = rig();
  r.feed.setAllowed(false);
  r.feed.start();
  await r.advance(1000);
  assert.strictEqual(r.log.opens, 0);
  assert.ok(r.log.polls >= 9, 'about 10 polls a second, got ' + r.log.polls);
});

check('stream on -> the first frame stops the poll, and frames paint with no poll', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  assert.strictEqual(r.log.opens, 1);
  const es = r.sources[0];
  r.frame(es, [[0, 0, new Array(512).fill(7)]], 1);
  assert.strictEqual(r.feed.mode, 'stream');
  const polled = r.log.polls;
  for (let i = 0; i < 20; i++) { await r.advance(100); r.frame(es, [[0, i, [i + 1]]]); }
  assert.strictEqual(r.log.polls, polled, 'no poll while frames arrive');
  assert.ok(r.log.paints >= 15, 'frames painted, got ' + r.log.paints);
  assert.strictEqual(r.feed.dmx[0][3], 4);
});

check('stream silent 2 s and the desk has changed -> the poll resumes, the stream is closed and retried with back-off', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  const es = r.sources[0];
  r.frame(es, [[0, 0, new Array(512).fill(0)]], 1);
  const before = r.log.polls;
  r.setPoll({ 0: new Array(512).fill(9) });             // the desk moved while the stream said nothing
  await r.advance(2100);
  assert.ok(r.log.polls > before, 'poll resumed');
  assert.strictEqual(r.feed.mode, 'poll');
  assert.ok(es.closed, 'a stalled stream is closed');
  assert.strictEqual(r.feed.dmx[0][5], 9, 'the poll painted the desk\'s frame');
  await r.advance(BACKOFF[0] + 100);
  assert.strictEqual(r.log.opens, 2, 'retried after the first back-off');
  r.sources[1].addEventListener; r.frame(r.sources[1], [[0, 0, [1]]], 1);
  assert.strictEqual(r.feed.mode, 'stream', 'stream back -> poll stops');
  const p = r.log.polls;
  await r.advance(1000);
  assert.strictEqual(r.log.polls, p, 'no polling once the stream is back');
});

check('stream silent because the desk is idle (poll equals what we hold, stream open) -> trusted again, poll stops', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  const es = r.sources[0];
  r.setPoll({ 0: [1, 2, 3] });
  r.frame(es, [[0, 0, [1, 2, 3]]], 1);
  r.feed.dmx = { 0: [1, 2, 3] };
  await r.advance(2100);
  const p = r.log.polls;
  assert.strictEqual(r.feed.mode, 'stream', 'idle desk: back on the stream');
  assert.ok(!es.closed);
  await r.advance(1500);
  assert.strictEqual(r.log.polls, p, 'and no polling');
});

check('a stream error resumes the poll and retries with growing back-off', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  r.frame(r.sources[0], [[0, 0, [1]]], 1);
  r.sources[0].emit('error', {});
  assert.strictEqual(r.feed.mode, 'poll');
  const p = r.log.polls;
  await r.advance(500);
  assert.ok(r.log.polls > p, 'polling again');
  await r.advance(600);
  assert.strictEqual(r.log.opens, 2, 'retry after ~1 s');
  r.sources[1].emit('error', {});
  await r.advance(1500);
  assert.strictEqual(r.log.opens, 2, 'the second wait is longer (2 s)');
  await r.advance(700);
  assert.strictEqual(r.log.opens, 3);
});

check('a stream that never sends a first frame is closed and retried', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  await r.advance(2100);
  assert.ok(r.sources[0].closed);
  assert.ok(r.log.polls > 10, 'meanwhile the poll served');
  await r.advance(1100);
  assert.strictEqual(r.log.opens, 2);
});

check('caps.stream turned off closes the stream and the poll carries on; pause stops everything', async () => {
  const r = rig();
  r.feed.start(); r.feed.setAllowed(true);
  r.frame(r.sources[0], [[0, 0, [1]]], 1);
  r.feed.setAllowed(false);
  assert.ok(r.sources[0].closed);
  const p = r.log.polls;
  await r.advance(500);
  assert.ok(r.log.polls > p);
  r.feed.pause();
  const q = r.log.polls;
  await r.advance(2000);
  assert.strictEqual(r.log.polls, q, 'a hidden page does not poll');
  assert.strictEqual(r.log.opens, 1);
});

(async () => {
  let failures = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ok   ' + t.n); } catch (e) { failures++; console.log('  FAIL ' + t.n + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log(failures ? `\n  ${failures} failing` : '\n  all passing');
  process.exit(failures ? 1 : 0);
})();
