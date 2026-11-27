// Readability check of the drawn APC40 (apc40draw.js): headless Chromium, no window, against a SCRATCH desk on loopback
// (ARTNET_OFFLINE=1, own data dir; never diiii.localhost or a shared desk). At each size it loads the 100-row map
// (reikaMap.fixture.json), pages through every look page and measures, as RENDERED on screen (computed font-size x the stage's
// real scale, read from the DOM, not from the component's own report):
//   - the smallest pad name and the smallest leader label: must be >= FLOOR (11 px)
//   - pads cut (a name or its short form still overflowing its pad), leader labels cut
//   - how many pads show the short form (full name is then the pad title and the PADS list row)
// Under 1000 px wide (606x780 is the owner's light window) the whole unit is fitted to the width like the di music page: the drawing must be visible, FIRST in the pane, whole (no sideways pan), every pad number >= 11 px, 0 cut, 0 duplicates, 0 labels under bars.
// Exit 1 when any floor/cut check fails. Pictures: <out>/readable-<w>x<h>-page<N>.png (the pane, scrolled) + -full.png.
// usage: PW_FROM=<dir with node_modules/playwright> node apc40-readable-check.mjs <http://127.0.0.1:PORT/> <out dir> [WxH ...]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { checkSimTarget, checkDeskAnswers } from './simGuard.mjs'
const require = createRequire((process.env.PW_FROM || process.cwd()) + '/')
const { chromium } = require('playwright')
const FLOOR = 11
const base = process.argv[2]
const out = process.argv[3]
const sizes = (process.argv.length > 4 ? process.argv.slice(4) : ['1534x830', '1536x864', '606x780', '662x830']).map((s) => s.split('x').map(Number))
{
  let u
  try { u = new URL(base) } catch { console.error('not a URL: ' + base); process.exit(2) }
  if (u.hostname !== '127.0.0.1' || !u.port) { console.error('refused: only a scratch desk at 127.0.0.1:<port> (never diiii.localhost or a shared desk)'); process.exit(2) }
}
{ // the same guard as apc40-full-sim.mjs and pressLatency.mjs: a scratch tree that answers, never the live desk's port (#1401 R2-I1)
  let ls = ''; try { ls = execFileSync('di-dev', ['ls'], { encoding: 'utf8' }) } catch { /* the guard then refuses */ }
  const why = checkSimTarget(base, ls); if (why) { console.error(why); process.exit(2) }
  const why2 = await checkDeskAnswers(base); if (why2) { console.error(why2); process.exit(2) }
}
fs.mkdirSync(out, { recursive: true })
const api = async (p, body) => (await fetch(base + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json()
const map = JSON.parse(fs.readFileSync(new URL('../reikaMap.fixture.json', import.meta.url), 'utf8'))
await api('api/midi', { midi: { maps: map.maps } })

const browser = await chromium.launch({ headless: true })
let fail = 0
const rows = []
for (const [w, h, view] of sizes.flatMap(([w, h]) => [[w, h, 'labelled'], [w, h, 'real']])) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((v) => { try { localStorage.setItem('deskApcView', v) } catch (e) { /* none */ } }, view)
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
    await page.evaluate(() => { window.scrollTo(0, 0); for (let e = document.querySelector('.apcwrap'); e; e = e.parentElement) { e.scrollTop = 0; if (e.classList.contains('apcwrap')) e.scrollLeft = 0 } })   // every measure starts from the unscrolled first view
    const m = await page.evaluate((pageNo) => {
      const stage = document.querySelector('.apcstage'), k = stage.getBoundingClientRect().width / stage.offsetWidth
      const px = (e) => parseFloat(getComputedStyle(e).fontSize) * k
      const pads = [...document.querySelectorAll('.apcp .pad')].filter((p) => p.firstChild && p.firstChild.textContent)
      const lbs = pads.map((p) => p.firstChild)
      const cl = [...document.querySelectorAll('.apcstage .cl')].filter((e) => e.style.display !== 'none' && getComputedStyle(e).display !== 'none')
      const padPx = lbs.map(px), clPx = cl.map(px)
      const cut = lbs.filter((l) => l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight).length
      const clCut = cl.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length
      const short = pads.filter((p) => p.firstChild.dataset.short).length
      const noTitle = pads.filter((p) => p.firstChild.dataset.short && !/\S/.test(p.title || '')).length
      const list = document.querySelectorAll('ol.padlist li').length
      // first view: opens unscrolled, the pane heading + both pad-order buttons are on screen, no leader label is under a bar
      const wrap = document.querySelector('.midiwrap'), vh = window.innerHeight
      const inView = (e) => { const r = e.getBoundingClientRect(); return !!e && r.top >= 0 && r.bottom <= vh && r.height > 0 }
      const head = document.querySelector('.miapcpane .pane-head h2'), btns = [...document.querySelectorAll('.miapcpane .pane-head button')]
      const firstView = { scrollTop: wrap ? Math.round(wrap.scrollTop) : -1, heading: !!head && inView(head), orderButtons: btns.length, orderButtonsInView: btns.filter(inView).length }
      const tops = cl.filter((e) => e.classList.contains('top'))
      const bars = [...document.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e).position; return (c === 'sticky' || c === 'fixed') && e.getBoundingClientRect().height > 0 && !e.closest('.apcstage') }).map((e) => e.getBoundingClientRect())
      const underBar = cl.filter((e) => { const r = e.getBoundingClientRect(); return (r.top < 0 && e.classList.contains('top')) || bars.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom - 1 && r.bottom > b.top + 1) }).map((e) => e.textContent.slice(0, 20))
      // short forms: two different looks on one page never show the same text
      const seen = new Map(), dup = []
      for (const p of pads) { const t = p.firstChild.textContent.trim(); const full = p.title || ''; if (seen.has(t) && seen.get(t) !== full) dup.push(t); seen.set(t, full) }
      // the drawing is on screen, and is the FIRST thing in the pane body (before every table), also when the pane is narrow
      const aw = document.querySelector('.apcwrap'), side = document.querySelector('.apcside'), pb = document.querySelector('.miapcpane .midibody')
      const ar = aw ? aw.getBoundingClientRect() : null
      const drawing = { visible: !!aw && getComputedStyle(aw).display !== 'none' && ar.width > 100 && ar.height > 100,
        first: !!aw && !!side && !!pb && pb.querySelector('table, ol') === side.querySelector('table, ol') && !!(aw.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(aw.compareDocumentPosition(pb.querySelector('table, ol')) & Node.DOCUMENT_POSITION_FOLLOWING),
        overview: !!document.querySelector('.apc40.overview'), pan: !!document.querySelector('.apc40.pan'),
        whole: !!aw && ar.left >= 0 && ar.right <= window.innerWidth + 1 && document.querySelector('.apcstage').getBoundingClientRect().right <= ar.right + 1 && getComputedStyle(aw).overflowX !== 'auto' }   // the whole unit, no sideways pan
      const sw = [...document.querySelectorAll('.apcview button')]
      const switchOk = sw.length === 2 && sw.every(inView) && sw.filter((b) => b.getAttribute('aria-pressed') === 'true').length === 1
      // overlaps (as drawn, in screen px): the logos, the crossfader (track, cap, end stops), A/B, every label (.pl) and every control must not intersect
      const ap0 = document.querySelector('.apcp'), kids = [...ap0.children].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' })
      const cls = (e) => e.className && e.className.baseVal === undefined ? String(e.className) : ''
      const isX = (e) => /\b(logo|akai|xf|xab|xt)\b/.test(cls(e)), isLab = (e) => /\bpl\b/.test(cls(e))
      const nm = (e) => cls(e).trim().replace(/\s+/g, '.') + (e.textContent ? '"' + e.textContent.trim().slice(0, 8) + '"' : '')
      const hit = (a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1 }
      const overlaps = []
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if ((isX(a) || isX(b) || (isLab(a) && isLab(b))) && hit(a, b)) overlaps.push(nm(a) + ' x ' + nm(b)) }
      return { overlaps, overlapChecked: kids.length, switchOk, drawing, scale: Math.round(k * 1000) / 1000, pads: pads.length, padMin: Math.min(...padPx), clN: cl.length, clMin: cl.length ? Math.min(...clPx) : null, cut, clCut, short, noTitle, list, firstView, underBar, dup, topLabels: tops.length }
    }, pg + 1)
    const ok = m.padMin >= FLOOR - 0.05 && (m.clMin == null || m.clMin >= FLOOR - 0.05) && m.cut === 0 && m.clCut === 0 && m.noTitle === 0 && m.list === m.pads && m.firstView.scrollTop === 0 && m.firstView.heading && m.firstView.orderButtons >= 2 && m.firstView.orderButtonsInView === m.firstView.orderButtons && m.underBar.length === 0 && m.dup.length === 0 && m.overlaps.length === 0 && m.drawing.visible && m.drawing.first && (view === 'real' ? m.drawing.whole && m.drawing.overview && m.clN === 0 : m.drawing.overview === false && m.clN > 0 && m.drawing.pan === (w < 1000)) && m.switchOk
    if (!ok) fail++
    rows.push({ size: w + 'x' + h + ' ' + view, page: pg + 1, ...m, ok })
    console.log((ok ? 'PASS ' : 'FAIL ') + w + 'x' + h + ' ' + view + ' page ' + (pg + 1) + '  ' + JSON.stringify(m))
    await page.screenshot({ path: path.join(out, `readable-${w}x${h}-${view}-page${pg + 1}.png`) })
    if (rows[rows.length - 1].drawing.pan) {   // Labelled, narrow: the Left / Right buttons reach both ends of the pan box
      const sl = () => page.evaluate(() => Math.round(document.querySelector('.apcwrap').scrollLeft)), reach = []
      for (let n = 0; n < 6; n++) { await page.getByRole('button', { name: /^Right/ }).click(); await page.waitForTimeout(900); reach.push(await sl()); if (reach.length > 1 && reach.at(-1) === reach.at(-2)) break }
      const atEnd = await page.evaluate(() => { const b = document.querySelector('.apcwrap'); return b.scrollLeft + b.clientWidth >= b.scrollWidth - 2 || b.scrollLeft + b.clientWidth >= document.querySelector('.apcstage').getBoundingClientRect().right - b.getBoundingClientRect().left + b.scrollLeft - 2 })
      await page.locator('.apcwrap').screenshot({ path: path.join(out, `readable-${w}x${h}-${view}-page${pg + 1}-pan-end.png`) })
      for (let n = 0; n < 6 && (await sl()) > 0; n++) { await page.getByRole('button', { name: /Left/ }).click(); await page.waitForTimeout(900) }
      const left = await sl(), jumpOk = reach.at(-1) > 100 && atEnd && left === 0
      console.log((jumpOk ? 'PASS' : 'FAIL') + ' pan buttons ' + w + 'x' + h + ' steps ' + JSON.stringify(reach) + ', end ' + atEnd + ', back ' + left)
      if (!jumpOk) fail++
    }
    // The pane scrolls inside the page: a tall window for the whole pane's picture (width, hence scale, unchanged).
    const paneH = await page.evaluate(() => Math.ceil(document.querySelector('.miapcpane').getBoundingClientRect().height))
    await page.setViewportSize({ width: w, height: Math.min(8000, paneH + 160) })
    await page.waitForTimeout(500)
    await page.locator('.miapcpane').screenshot({ path: path.join(out, `readable-${w}x${h}-${view}-page${pg + 1}-full.png`) })
    await page.setViewportSize({ width: w, height: h })
  }
  await ctx.close()
}
await browser.close()
for (const [w, h, view] of sizes.flatMap(([w, h]) => [[w, h, 'labelled'], [w, h, 'real']])) {
  const r = rows.filter((x) => x.size === w + 'x' + h + ' ' + view)
  console.log(`MIN ${w}x${h} ${view}: pad name ${Math.min(...r.map((x) => x.padMin)).toFixed(1)} px, leader label ${r.every((x) => x.clMin == null) ? 'none drawn' : Math.min(...r.map((x) => x.clMin ?? 99)).toFixed(1) + ' px'}, scale ${r[0].scale}, short-form pads ${r.reduce((a, x) => a + x.short, 0)}`)
}
console.log(fail ? 'FAIL: ' + fail + ' check(s) failed' : 'PASS: every pad name and leader label >= ' + FLOOR + ' px on screen, nothing cut')
process.exit(fail ? 1 : 0)
