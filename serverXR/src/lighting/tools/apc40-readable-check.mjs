// Readability check of the drawn APC40 (apc40draw.js): headless Chromium, no window, against a SCRATCH desk on loopback
// (ARTNET_OFFLINE=1, own data dir; never diiii.localhost or a shared desk). At each size it loads the 100-row map
// (reikaMap.fixture.json), pages through every look page and measures, as RENDERED on screen (computed font-size x the stage's
// real scale, read from the DOM, not from the component's own report):
//   - the smallest pad name and the smallest leader label: must be >= FLOOR (11 px)
//   - pads cut (a name or its short form still overflowing its pad), leader labels cut
//   - how many pads show the short form (full name is then the pad title and the PADS list row)
// Exit 1 when any floor/cut check fails. Pictures: <out>/readable-<w>x<h>-page<N>.png (the pane, scrolled) + -full.png.
// usage: PW_FROM=<dir with node_modules/playwright> node apc40-readable-check.mjs <http://127.0.0.1:PORT/> <out dir> [WxH ...]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire((process.env.PW_FROM || process.cwd()) + '/')
const { chromium } = require('playwright')
const FLOOR = 11
const base = process.argv[2]
const out = process.argv[3]
const sizes = (process.argv.length > 4 ? process.argv.slice(4) : ['1534x830', '1536x864']).map((s) => s.split('x').map(Number))
{
  let u
  try { u = new URL(base) } catch { console.error('not a URL: ' + base); process.exit(2) }
  if (u.hostname !== '127.0.0.1' || !u.port) { console.error('refused: only a scratch desk at 127.0.0.1:<port> (never diiii.localhost or a shared desk)'); process.exit(2) }
}
fs.mkdirSync(out, { recursive: true })
const api = async (p, body) => (await fetch(base + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json()
const map = JSON.parse(fs.readFileSync(new URL('../reikaMap.fixture.json', import.meta.url), 'utf8'))
await api('api/midi', { midi: { maps: map.maps } })

const browser = await chromium.launch({ headless: true })
let fail = 0
const rows = []
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript(() => {
    const input = { id: 'apc', name: 'APC40 mkII', manufacturer: 'Akai', state: 'connected', type: 'input', onmidimessage: null }
    const output = { id: 'apc-out', name: 'APC40 mkII', manufacturer: 'Akai', state: 'connected', type: 'output', send() {} }
    const access = { inputs: new Map([['apc', input]]), outputs: new Map([['apc-out', output]]), onstatechange: null, sysexEnabled: false }
    navigator.requestMIDIAccess = () => Promise.resolve(access)
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { console.log('PAGE ERROR ' + e.message); fail++ })
  await page.goto(base + '#midi')
  await page.waitForSelector('.apcp .pad', { timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.waitForFunction(() => typeof S !== 'undefined' && S && S.looks && S.looks.length, null, { timeout: 30000 })
  const pages = await page.evaluate(() => Math.max(1, Math.ceil((S.looks || []).length / 40)))
  for (let pg = 0; pg < pages; pg++) {
    if (pg > 0) { await page.evaluate(() => midiLookPageStep(1)); await page.waitForTimeout(500) }
    const m = await page.evaluate((pageNo) => {
      const stage = document.querySelector('.apcstage'), k = stage.getBoundingClientRect().width / stage.offsetWidth
      const px = (e) => parseFloat(getComputedStyle(e).fontSize) * k
      const pads = [...document.querySelectorAll('.apcp .pad')].filter((p) => p.firstChild && p.firstChild.textContent)
      const lbs = pads.map((p) => p.firstChild)
      const cl = [...document.querySelectorAll('.apcstage .cl')].filter((e) => e.style.display !== 'none')
      const padPx = lbs.map(px), clPx = cl.map(px)
      const cut = lbs.filter((l) => l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight).length
      const clCut = cl.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length
      const short = pads.filter((p) => p.firstChild.dataset.short).length
      const noTitle = pads.filter((p) => p.firstChild.dataset.short && !/\S/.test(p.title || '')).length
      const list = document.querySelectorAll('ol.padlist li').length
      return { scale: Math.round(k * 1000) / 1000, pads: pads.length, padMin: Math.min(...padPx), clN: cl.length, clMin: cl.length ? Math.min(...clPx) : null, cut, clCut, short, noTitle, list }
    }, pg + 1)
    const ok = m.padMin >= FLOOR - 0.05 && (m.clMin == null || m.clMin >= FLOOR - 0.05) && m.cut === 0 && m.clCut === 0 && m.noTitle === 0 && m.list === m.pads
    if (!ok) fail++
    rows.push({ size: w + 'x' + h, page: pg + 1, ...m, ok })
    console.log((ok ? 'PASS ' : 'FAIL ') + w + 'x' + h + ' page ' + (pg + 1) + '  ' + JSON.stringify(m))
    await page.locator('#miApc').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(out, `readable-${w}x${h}-page${pg + 1}.png`) })
    // The pane scrolls inside the page: a tall window for the whole pane's picture (width, hence scale, unchanged).
    const paneH = await page.evaluate(() => Math.ceil(document.querySelector('.miapcpane').getBoundingClientRect().height))
    await page.setViewportSize({ width: w, height: Math.min(8000, paneH + 160) })
    await page.waitForTimeout(500)
    await page.locator('.miapcpane').screenshot({ path: path.join(out, `readable-${w}x${h}-page${pg + 1}-full.png`) })
    await page.setViewportSize({ width: w, height: h })
  }
  await ctx.close()
}
await browser.close()
for (const [w, h] of sizes) {
  const r = rows.filter((x) => x.size === w + 'x' + h)
  console.log(`MIN ${w}x${h}: pad name ${Math.min(...r.map((x) => x.padMin)).toFixed(1)} px, leader label ${Math.min(...r.map((x) => x.clMin ?? 99)).toFixed(1)} px, scale ${r[0].scale}, short-form pads ${r.reduce((a, x) => a + x.short, 0)}`)
}
console.log(fail ? 'FAIL: ' + fail + ' check(s) failed' : 'PASS: every pad name and leader label >= ' + FLOOR + ' px on screen, nothing cut')
process.exit(fail ? 1 : 0)
