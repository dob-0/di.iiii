// The page half of the press latency bench: what a pad press costs inside the desk page.
//   DESK_URL=http://127.0.0.1:4327/light/space/reika/ di-test-browser run serverXR/src/lighting/tools/pressLatencyPage.cjs
// Runs on a SCRATCH desk with output off. It arms the page, puts a fake APC40 output on it, and presses look pad k through
// the page's own midiSend (the call the pad handler makes). Per press it records:
//   queue    midiSend -> the POST api/looks/fire leaves the page (the 40 ms timer, and any earlier press still in flight)
//   reply    the POST leaves -> its answer
//   led      midiSend -> the first pad light the page sends to the (fake) controller
// OUT=file.json writes the numbers. AUTOPLAY=1 sends the autoplay-off call first (the old pad: two requests); AUTOPLAY=fold sends one fire with autoplayOff:true.
const { chromium } = require('playwright-core');
const fs = require('fs');
const URL_ = process.env.DESK_URL;
const N = Number(process.env.N || 20);
const GAP = Number(process.env.GAP || 2200);
const BURST = Number(process.env.BURST || 4);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const stat = (a) => ({ n: a.length, median: +pct(a, 0.5).toFixed(1), p95: +pct(a, 0.95).toFixed(1), max: +Math.max(...a).toFixed(1) });

(async () => {
  const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof S !== 'undefined' && S && Array.isArray(S.looks) && S.looks.length > 3, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(async ({ N, GAP, BURST, AUTOPLAY }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const log = { fetch: [], led: [] };
    const realFetch = window.fetch.bind(window);
    window.fetch = (u, o) => {
      const rec = { url: String(u), method: (o && o.method) || 'GET', t0: performance.now() };
      log.fetch.push(rec);
      return realFetch(u, o).then((r) => { rec.t1 = performance.now(); return r; });
    };
    midiArmed = true;
    midiLedOut = { send: (m) => log.led.push({ t: performance.now(), m: Array.from(m) }) };
    midiLedSent.clear();
    midiPaintLights();
    await wait(300);
    const ids = looksOf().slice(0, 8).map((l) => l.id);
    const queue = [], reply = [], led = [], burstLast = [];
    for (let i = 0; i < N + 2; i++) {
      const k = i % ids.length;
      log.fetch.length = 0; log.led.length = 0;
      const t0 = performance.now();
      if (AUTOPLAY === '1') midiSend('api/cues/autoplay', { autoplay: false }, 'lookpad:autoplayoff');
      midiSend('api/looks/fire', AUTOPLAY === 'fold' ? { id: ids[k], autoplayOff: true } : { id: ids[k] }, 'lookpad:' + k, true);
      await wait(GAP);
      if (i < 2) continue;
      const f = log.fetch.find((x) => /looks\/fire$/.test(x.url));
      if (f && f.t1) { queue.push(f.t0 - t0); reply.push(f.t1 - f.t0); }
      const l = log.led.find((x) => x.t >= t0);
      if (l) led.push(l.t - t0);
    }
    for (let i = 0; i < 5; i++) {
      log.fetch.length = 0;
      const t0 = performance.now();
      for (let j = 0; j < BURST; j++) { midiSend('api/looks/fire', { id: ids[(i + j) % ids.length] }, 'lookpad:' + ((i + j) % ids.length), true); await wait(30); }
      await wait(GAP);
      const fs_ = log.fetch.filter((x) => /looks\/fire$/.test(x.url) && x.t1);
      if (fs_.length) burstLast.push(Math.max(...fs_.map((x) => x.t1)) - t0);
    }
    return { queue, reply, led, burstLast, ledSeen: led.length };
  }, { N, GAP, BURST, AUTOPLAY: process.env.AUTOPLAY || '' });
  const out = {
    url: URL_, autoplay: process.env.AUTOPLAY || 'off',
    'page queue: midiSend to POST leaving': res.queue.length ? stat(res.queue) : null,
    'POST reply (wire + server)': res.reply.length ? stat(res.reply) : null,
    'pad light: midiSend to first light sent': res.led.length ? stat(res.led) : { n: 0, note: 'no light sent within ' + GAP + ' ms' },
    [`burst of ${BURST} pads 30 ms apart: first press to last reply`]: res.burstLast.length ? stat(res.burstLast) : null,
  };
  console.log(JSON.stringify(out, null, 1));
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
