'use strict';
/* global window, document */
// The "This node" fold (caps.node, plan step D5) in a real browser.
//   1. The standalone desk as it is (no caps): the fold is hidden and the page never asks
//      the node's own routes.
//   2. A node: by default the vizzz.di simulator (`python3 tools/simulate_node.py --port 8088`
//      in a vizzz.di checkout), given as NODE_URL. The page's own files (/, *.js, *.css) are
//      served from this checkout's ui/ so the fold under test is this one; every other request
//      (api/*, status, the console routes) goes to the simulator, which answers as the
//      firmware does. Without NODE_URL, or when it does not answer: the standalone desk with
//      api/state rewritten to caps.node:true and the node routes stubbed at the page. The run
//      says which one it used.
// Screenshots (desktop 1280x800, phone 390x844) go to SHOTS_DIR when it is set.
// Run: NODE_URL=http://127.0.0.1:8088 node serverXR/src/lighting/tests/test-node-section.js
//      (needs the global `playwright`; npm run test:desk-node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { createDesk } = require('../desk');

const UI = path.join(__dirname, '..', 'ui');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const CHROME = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let failures = 0;
let oks = 0;
async function check(name, fn) {
  try { await fn(); oks++; console.log('  ok  ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : e)); }
}
// A node answers the contract's class-c routes 404 on purpose (api-contract.json); the page
// already asks some of them (api/midi at load) whatever the caps say. Not this fold's errors.
const CLASS_C = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api-contract.json'), 'utf8')).entries.filter((e) => e.class === 'c').map((e) => '/' + e.path));
const NODE_PATHS = /^\/(status|peers|node\/manifest|wifi\/scan|netmode\/set|wifi\/set|wifi\/forget|mode\/set|mode\/fallback|artnet\/set|artout\/peer|safety\/set|panic|announce|node\/set|reboot|factory-reset)$/;

async function reachable(url) {
  try { const r = await fetch(url + '/status', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch (e) { return false; }
}

// A stand-in node for when no simulator answers: the same shapes, kept in memory.
function stubNode() {
  const s = { ap_ip: '192.168.4.1', sta_ip: '10.0.0.20', sta: true, sta_ssid: 'lab-net', wl_status: 3, ssid: 'node-ap', name: 'node-1',
    net_mode: 0, net: 0, subnet: 0, uni: 0, uni15: 0, mode: 2, artnet_active: false, sacn_active: false, usb_active: false,
    ao: false, ao_target: 'broadcast', burn_safe: false, safe_ceiling: 245, safe_slew_step: 18, artnet_fallback_to_web: true,
    heap_free: 180000, heap_max_block: 110000 };
  return {
    s,
    answer(p, q) {
      if (p === '/status') return [200, s];
      if (p === '/peers') return [200, { peers: [{ ip: '10.0.0.51', name: 'peer-1', uni: 1, age: 1200 }], count: 1 }];
      if (p === '/node/manifest') return [200, { firmware: { tag: 'stub' } }];
      if (p === '/wifi/scan') return [200, { scanning: false, networks: [{ ssid: 'lab-net', rssi: -50, enc: 3 }] }];
      if (p === '/safety/set') { s.burn_safe = q.get('burn') === '1'; s.safe_ceiling = s.burn_safe ? 96 : 245; s.safe_slew_step = s.burn_safe ? 8 : 18; }
      if (p === '/mode/set') s.mode = +q.get('m');
      if (p === '/artnet/set') { s.net = +q.get('net'); s.subnet = +q.get('subnet'); s.uni = +q.get('uni'); s.uni15 = (s.net << 8) | (s.subnet << 4) | s.uni; }
      if (p === '/node/set') { s.name = q.get('name'); s.ssid = q.get('ap_ssid'); }
      return [204, null];
    },
  };
}

async function main() {
  const { chromium } = require('playwright');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-node-'));
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: null, outputEnabledDefault: false, listen: () => ({ lan: false, addresses: [] }), log: () => {} });
  const server = http.createServer((req, res) => desk.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const deskBase = 'http://127.0.0.1:' + server.address().port;
  const nodeUrl = (process.env.NODE_URL || '').replace(/\/$/, '');
  const useSim = !!nodeUrl && await reachable(nodeUrl);
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    // ---------- 1. a machine: no caps ----------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const asked = [];
      page.on('request', (rq) => { const p = new URL(rq.url()).pathname; if (NODE_PATHS.test(p)) asked.push(p); });
      await page.goto(deskBase + '/#setup');
      await page.waitForTimeout(2500);
      await check('on a machine (no caps) the "This node" fold is hidden', async () => {
        assert.ok(await page.$eval('#ndDetails', (el) => el.classList.contains('capoff')), 'no .capoff on the fold');
        assert.strictEqual(await page.isVisible('#ndDetails'), false);
      });
      await check('and the page never asks a node route', async () => assert.deepStrictEqual(asked, []));
      await page.close();
    }

    // ---------- 2. a node ----------
    const base = useSim ? nodeUrl : deskBase;
    const stub = useSim ? null : stubNode();
    console.log(useSim ? '  (node: simulator at ' + nodeUrl + ', page files from this checkout)' : '  (node: STUB — standalone desk with caps.node rewritten; no simulator answered' + (nodeUrl ? ' at ' + nodeUrl : '') + ')');
    const ctxFor = async (viewport) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 3 : 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
      const posts = [];
      const errors = [];
      ctx.on('request', (rq) => { const u = new URL(rq.url()); if (rq.method() === 'POST' && NODE_PATHS.test(u.pathname)) posts.push({ path: u.pathname, query: u.search, header: rq.headers()['x-vizzz-console'], body: rq.postData(), ctype: rq.headers()['content-type'] }); });
      await ctx.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
        if (/^[a-z]+\.(js|css|html)$/.test(file) && fs.existsSync(path.join(UI, file))) {
          return route.fulfill({ status: 200, contentType: MIME[path.extname(file)], body: fs.readFileSync(path.join(UI, file)) });
        }
        if (!useSim && u.pathname === '/api/state') {
          const res = await route.fetch(); const j = await res.json();
          j.caps = Object.assign({}, j.caps, { node: true });
          return route.fulfill({ response: res, json: j });
        }
        if (!useSim && NODE_PATHS.test(u.pathname)) {
          const q = new URLSearchParams(route.request().method() === 'POST' && route.request().postData() ? route.request().postData() : u.search);
          if (route.request().method() === 'POST' && route.request().headers()['x-vizzz-console'] !== '1') return route.fulfill({ status: 403, json: { error: 'console route' } });
          const [code, body] = stub.answer(u.pathname, q);
          return body ? route.fulfill({ status: code, json: body }) : route.fulfill({ status: code, body: '' });
        }
        if (useSim && u.pathname === '/peers' && process.env.SHOTS_DIR) {
          // For the committed screenshots only: the simulator names its two fake peers after the
          // product; the picture must not carry a product name. Addresses and the rest are real.
          const res = await route.fetch(); const j = await res.json();
          (j.peers || []).forEach((p, i) => { p.name = 'peer-' + (i + 1); });
          return route.fulfill({ response: res, json: j });
        }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('response', (r) => { if (r.status() >= 400 && !CLASS_C.has(new URL(r.url()).pathname)) errors.push(r.status() + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); });
      return { ctx, page, posts, errors };
    };
    const statusNow = async () => (useSim ? (await fetch(nodeUrl + '/status')).json() : stub.s);

    const { ctx, page, posts, errors } = await ctxFor({ width: 1280, height: 800 });
    const statusAsks = [];
    page.on('request', (rq) => { if (new URL(rq.url()).pathname === '/status') statusAsks.push(Date.now()); });
    await page.goto(base + '/#setup');
    await page.waitForSelector('#ndDetails:not(.capoff)', { timeout: 8000 });
    await page.waitForFunction(() => !/not reached/.test(document.querySelector('#ndSummary').textContent), null, { timeout: 5000 });

    await check('with caps.node the fold shows on Setup, and its summary names the node from /status', async () => {
      assert.ok(await page.isVisible('#ndDetails'));
      const st = await statusNow();
      const sum = await page.textContent('#ndSummary');
      assert.ok(sum.startsWith(st.name), 'summary "' + sum + '" does not start with the node name');
    });
    await check('/status is read on the Setup page\'s one-second tick (no second timer)', async () => {
      const t0 = Date.now(); const n0 = statusAsks.length;
      await page.waitForTimeout(5000);
      const n = statusAsks.filter((t) => t >= t0).length || statusAsks.length - n0;
      assert.ok(n >= 4 && n <= 6, n + ' status reads in 5 s');
    });

    await page.click('#ndDetails > summary');
    await page.waitForFunction(() => document.querySelectorAll('#ndPeers .ndrow').length > 0, null, { timeout: 5000 });
    await check('opening it shows the peer table from /peers and the firmware string', async () => {
      const rows = await page.$$eval('#ndPeers .ndrow', (r) => r.length);
      assert.ok(rows >= 1, rows + ' peer rows');
      const health = await page.textContent('#ndHealth');
      assert.ok(/firmware \S+/.test(health) && !/firmware not reported/.test(health), health);
      assert.ok(/uptime not reported by this node/.test(health), 'uptime must say it is not reported: ' + health);
    });

    await check('burn-safe: one press, POST safety/set with the console header, the numbers follow', async () => {
      const before = (await statusNow()).burn_safe;
      await page.click('#ndBurn');
      await page.waitForFunction((b) => document.querySelector('#ndBurn').textContent === (b ? 'Burn-safe is OFF' : 'Burn-safe is ON'), before, { timeout: 4000 });
      const p = posts.filter((x) => x.path === '/safety/set').pop();
      assert.ok(p && p.header === '1', 'no X-Vizzz-Console: 1');
      assert.strictEqual(p.query, '?burn=' + (before ? '0' : '1'));
      assert.strictEqual((await statusNow()).burn_safe, !before);
      const nums = await page.textContent('#ndBurnNums');
      assert.ok(nums.includes('ceiling ' + (await statusNow()).safe_ceiling), nums);
    });
    await check('source mode: the select calls mode/set and the node reports it', async () => {
      await page.selectOption('#ndMode', '1');
      await page.waitForTimeout(600);
      assert.strictEqual((await statusNow()).mode, 1);
      await page.selectOption('#ndMode', '2');
      await page.waitForTimeout(600);
      assert.strictEqual((await statusNow()).mode, 2);
    });
    await check('Art-Net port-address 0:1:2 lands as 18, sACN 19 shown', async () => {
      await page.fill('#ndArtNet', '0'); await page.fill('#ndArtSub', '1'); await page.fill('#ndArtUni', '2');
      await page.click('#ndArtSet');
      await page.waitForFunction(() => /port-address 18 · sACN universe 19/.test(document.querySelector('#ndArtNote').textContent), null, { timeout: 4000 });
      assert.strictEqual((await statusNow()).uni15, 18);
    });
    await check('Wi-Fi: scan lists networks; a 5-character password is refused before anything is sent', async () => {
      await page.click('#ndScan');
      await page.waitForFunction(() => document.querySelectorAll('#ndNets .ndrow').length > 0, null, { timeout: 4000 });
      await page.click('#ndNets .ndrow');
      const n0 = posts.filter((x) => x.path === '/wifi/set').length;
      await page.fill('#ndPass', 'short');
      await page.click('#ndJoin');
      await page.waitForTimeout(300);
      assert.strictEqual(posts.filter((x) => x.path === '/wifi/set').length, n0, 'a refused password was sent');
      await page.fill('#ndPass', 'a-long-enough-pass');
      await page.click('#ndJoin');
      await page.waitForTimeout(600);
      const p = posts.filter((x) => x.path === '/wifi/set').pop();
      assert.ok(p && p.header === '1' && /x-www-form-urlencoded/.test(p.ctype || ''), 'wifi/set must be a form POST with the console header');
      assert.ok(/ssid=/.test(p.body) && /pass=a-long-enough-pass/.test(p.body), p && p.body);
      assert.strictEqual(await page.inputValue('#ndPass'), '', 'the password field is cleared after a join');
    });
    await check('name: node/set as a form body, the summary follows', async () => {
      await page.fill('#ndName', 'node-1'); await page.fill('#ndApSsid', 'node-1-ap');
      await page.click('#ndNameSet');
      await page.waitForFunction(() => document.querySelector('#ndSummary').textContent.startsWith('node-1'), null, { timeout: 4000 });
      assert.strictEqual((await statusNow()).name, 'node-1');
    });
    await check('factory reset asks through the desk bar: one press sends nothing, Cancel sends nothing, the bar button sends it once', async () => {
      const n = () => posts.filter((x) => x.path === '/factory-reset').length;
      await page.click('#ndFactory');
      await page.waitForSelector('#deskAsk');
      await page.waitForTimeout(500);
      assert.strictEqual(n(), 0, 'opening the bar sent factory-reset');
      assert.ok(/cannot be undone/.test(await page.textContent('#deskAskText')), await page.textContent('#deskAskText'));
      assert.strictEqual(await page.evaluate(() => document.activeElement.className), 'deskask-no', 'Cancel has the focus');
      await page.click('#deskAsk .deskask-no');
      await page.waitForTimeout(300);
      assert.strictEqual(await page.$('#deskAsk'), null, 'Cancel closes the bar');
      assert.strictEqual(n(), 0, 'Cancel sent factory-reset');
      await page.click('#ndFactory');
      await page.waitForSelector('#deskAsk');
      await page.waitForTimeout(500);
      await page.click('#deskAsk .deskask-yes');
      await page.waitForTimeout(500);
      assert.strictEqual(n(), 1, 'the bar button sends it once');
      assert.strictEqual(posts.filter((x) => x.path === '/factory-reset')[0].header, '1');
      assert.strictEqual(posts.filter((x) => x.path === '/reboot').length, 0, 'restart was never fired');
    });
    await check('restart asks too, and Esc says no', async () => {
      await page.click('#ndReboot');
      await page.waitForSelector('#deskAsk');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert.strictEqual(await page.$('#deskAsk'), null, 'Esc closes the bar');
      assert.strictEqual(posts.filter((x) => x.path === '/reboot').length, 0, 'Esc sent restart');
    });
    await check('Discover sends announce and reads the table again', async () => {
      await page.click('#ndDiscover');
      await page.waitForTimeout(500);
      assert.ok(posts.some((x) => x.path === '/announce' && x.header === '1'));
    });
    await check('every POST the fold sent carried X-Vizzz-Console: 1, and no console errors', async () => {
      assert.ok(posts.length > 0);
      assert.deepStrictEqual(posts.filter((x) => x.header !== '1').map((x) => x.path), []);
      assert.deepStrictEqual(errors, []);
    });
    // Put the burn-safe back where the simulator started, for the screenshots and the next run.
    if ((await statusNow()).burn_safe) { await page.click('#ndBurn'); await page.waitForTimeout(600); }
    await ctx.close();

    if (process.env.SHOTS_DIR) {
      fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
      for (const [label, viewport] of [['desktop-1280x800', { width: 1280, height: 800 }], ['phone-390x844', { width: 390, height: 844 }]]) {
        const s = await ctxFor(viewport);
        await s.page.goto(base + '/#setup');
        await s.page.waitForSelector('#ndDetails:not(.capoff)', { timeout: 8000 });
        await s.page.click('#ndDetails > summary');
        await s.page.waitForFunction(() => document.querySelectorAll('#ndPeers .ndrow').length > 0, null, { timeout: 5000 });
        await s.page.click('#ndScan');
        await s.page.waitForTimeout(1500);
        await s.page.evaluate(() => document.querySelector('#ndDetails').scrollIntoView());
        const file = path.join(process.env.SHOTS_DIR, 'desk-this-node-' + label + '.png');
        // The screen as a person sees it with the fold scrolled to the top; on a phone also the
        // fold itself, top to bottom (a full-page phone shot is 12 000 px tall and unreadable).
        await s.page.screenshot({ path: file });
        if (viewport.width < 500) await s.page.locator('#ndDetails').screenshot({ path: file.replace('.png', '-fold.png') });
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await check(label + ': no sideways scroll (' + overflow + ' px)', async () => assert.ok(overflow <= 0, overflow + ' px wider than the screen'));
        console.log('  shot ' + file);
        await s.ctx.close();
      }
    }
  } finally {
    await browser.close();
    try { desk.close && desk.close(); } catch (e) { /* ignore */ }
    server.close();
  }
  console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing (' + oks + ' ok, node: ' + (useSim ? 'simulator' : 'stub') + ')\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
