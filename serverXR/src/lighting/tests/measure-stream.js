'use strict';
/* global window */
// Measures what one open desk page costs the desk: requests to api/dmx and api/dmx/stream
// per 10 s, and SSE frames per second. Standalone desk on an ephemeral port (offline, empty
// data folder), headless Chromium through Playwright, requests counted at the page.
//   BEFORE = the desk says caps.stream:false (api/state is rewritten in the page), so the
//            page polls api/dmx at 10 Hz as it did before the stream existed.
//   AFTER  = the desk as it is (no caps: the stream is on).
// Each is measured twice: IDLE (nothing moving; the stream is silent by design) and MOVING
// (fx `pulse` on 8 RGB fixtures, so frames flow at the desk's rate).
// Run: node serverXR/src/lighting/tests/measure-stream.js   (needs the global `playwright`)

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createDesk } = require('../desk');

const WINDOW_MS = 10000;
const SETTLE_MS = 3000;

async function post(base, route, body) {
  const r = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

async function measure(chromium, base, label, caps) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const counts = { dmx: 0, stream: 0, state: 0 };
  page.on('request', (rq) => {
    const u = new URL(rq.url()).pathname;
    if (u === '/api/dmx') counts.dmx++;
    else if (u === '/api/dmx/stream') counts.stream++;
    else if (u === '/api/state') counts.state++;
  });
  if (caps) {
    await page.route('**/api/state', async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      j.caps = Object.assign({}, j.caps, caps);
      await route.fulfill({ response: res, json: j });
    });
  }
  await page.addInitScript(() => {
    window.__sse = 0;
    const E = window.EventSource;
    window.EventSource = function (u, o) {
      const es = new E(u, o);
      es.addEventListener('frame', () => { window.__sse++; });
      return es;
    };
    window.EventSource.prototype = E.prototype;
  });
  await page.goto(base + '/');
  await page.waitForTimeout(SETTLE_MS);
  const c0 = { ...counts };
  const s0 = await page.evaluate(() => window.__sse);
  await page.waitForTimeout(WINDOW_MS);
  const c1 = { ...counts };
  const s1 = await page.evaluate(() => window.__sse);
  await page.screenshot({ path: path.join(os.tmpdir(), 'measure-stream-' + label.replace(/\W+/g, '-') + '.png') });
  await browser.close();
  return { label, dmx: c1.dmx - c0.dmx, stream: c1.stream - c0.stream, state: c1.state - c0.state, sseFps: (s1 - s0) / (WINDOW_MS / 1000) };
}

(async () => {
  const { chromium } = require('playwright');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-measure-'));
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: null, outputEnabledDefault: false, listen: () => ({ lan: false, addresses: [] }) });
  const server = http.createServer((req, res) => desk.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const rows = [];
  try {
    await post(base, '/api/fixtures/add', { profile: 'rgb', count: 8 });
    for (const [moving, fx] of [[false, { mode: 'none', enabled: false }], [true, { mode: 'pulse', enabled: true, bpm: 120, depth: 100 }]]) {
      await post(base, '/api/fx', fx);
      rows.push({ ...(await measure(chromium, base, (moving ? 'moving' : 'idle') + ' / before (caps.stream false)', { stream: false })), moving });
      rows.push({ ...(await measure(chromium, base, (moving ? 'moving' : 'idle') + ' / after (stream on)', null)), moving });
    }
  } finally {
    try { desk.close && desk.close(); } catch (e) { /* ignore */ }
    server.close();
  }
  console.log('per 10 s window after a ' + SETTLE_MS / 1000 + ' s settle; one page; chromium headless; requests counted with page.on("request")');
  console.log('label'.padEnd(40) + 'api/dmx'.padStart(9) + 'stream'.padStart(8) + 'api/state'.padStart(11) + 'SSE frames/s'.padStart(14));
  for (const r of rows) console.log(r.label.padEnd(40) + String(r.dmx).padStart(9) + String(r.stream).padStart(8) + String(r.state).padStart(11) + r.sseFps.toFixed(1).padStart(14));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
