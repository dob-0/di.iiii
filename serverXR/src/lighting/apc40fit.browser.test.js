/* global window, document -- the page functions run inside the browser */
// The drawn APC40 must fit its pane at every window width (owner 2026-11-27: at 710x780 css px, dpr 1.667, the drawing
// was cut off at both sides and 3300 px tall because the Labelled view panned at 1.1x). A real layout, so this runs
// in headless Chromium (playwright). Set DI_APC_FIT_CHROMIUM=<path> to use a given browser binary. Without playwright
// or a browser the test is SKIPPED with a loud warning, never silently passed; CI installs playwright (root devDependency).
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const ui = path.join(here, 'ui')
const req = createRequire(import.meta.url)

let chromium = null
for (const id of [process.env.DI_APC_FIT_PLAYWRIGHT, 'playwright', 'playwright-core', path.join(here, '../../../node_modules/playwright'), path.join(here, '../../../node_modules/playwright-core')]) {
  if (!id) continue
  try { chromium = req(id).chromium; if (chromium) break } catch { /* try the next */ }
}
const exe = process.env.DI_APC_FIT_CHROMIUM || undefined
let browser = null
let why = ''
beforeAll(async () => {
  if (!chromium) { why = 'playwright is not installed'; return }
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}) } catch (e) { why = 'no Chromium: ' + String(e.message).split('\n')[0] }
  if (!browser) console.warn('!! apc40fit.browser.test.js SKIPPED (' + why + '): the fit is NOT checked')
}, 60000)
afterAll(async () => { if (browser) await browser.close() })

const SIZES = [[360, 800, 2], [390, 844, 3], [710, 780, 1.667], [1000, 800, 1], [1280, 800, 1], [1920, 1080, 1], [2560, 1300, 1]]
const VIEWS = ['default', 'labelled', 'real']   // the owner's saved choice (localStorage deskApcView) must not bring the pan back

async function open(w, h, dpr, view) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.addInitScript((v) => { if (v !== 'default') try { localStorage.setItem('deskApcView', v) } catch { /* storage blocked */ } }, view)
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div style="display:flex;flex-direction:column;padding:8px"><section class="pane miapcpane"><div class="pane-head"><h2>APC40 mkII</h2></div><div class="midibody"><div id="miApc"></div></div></section></div>')
  await page.addStyleTag({ path: path.join(ui, 'style.css') })
  for (const f of ['outputPatch.js', 'midiCues.js', 'midiPatch.js', 'apc40draw.js']) await page.addScriptTag({ path: path.join(ui, f) })
  await page.evaluate(() => {
    const mc = window.deskMidiCues
    const looks = Array.from({ length: 40 }, (_, i) => ({ id: 'l' + i, name: 'Look ' + (i + 1) }))
    const keys = ['cuego', 'cueback', 'cuestop', 'master'].concat(mc.lookPadTargets().map((t) => t.key))
    const map = Object.fromEntries(mc.apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
    window.apc = window.deskApc40Draw.create(document.getElementById('miApc'), { press() {}, send() {}, armed: () => false })
    window.apc.update({ map, cues: { list: [] }, state: {}, looks, order: null, bright: {}, page: 0, activeId: 'l2' })
  })
  await page.waitForTimeout(400)
  return { ctx, page, errs }
}

describe('the drawn APC40 fits the pane at every width', () => {
  for (const view of VIEWS) for (const [w, h, dpr] of SIZES) {
    it(`${w}x${h} @${dpr}, view ${view}: no horizontal clipping or scroll, readable, one screen`, async (ctx) => {
      if (!browser) return ctx.skip()
      const { ctx: c, page, errs } = await open(w, h, dpr, view)
      try {
        const m = await page.evaluate(() => {
          const pane = document.querySelector('.miapcpane').getBoundingClientRect()
          const apc = document.querySelector('.apc40')
          const panel = document.querySelector('.apcp').getBoundingClientRect()
          const wrap = document.querySelector('.apcwrap')
          const rep = window.apc.report()
          // every drawn element must lie inside the panel box (no control drawn outside its unit)
          const out = [...document.querySelectorAll('.apcp > div')].filter((e) => e.getClientRects().length).filter((e) => {
            const r = e.getBoundingClientRect(); return r.left < panel.left - 1 || r.right > panel.right + 1
          }).length
          // no two PADS overlap (the 40 look pads are the controls that carry a name)
          const pads = [...document.querySelectorAll('.apcp .pad')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect())
          let overlap = 0
          for (let a = 0; a < pads.length; a++) for (let b = a + 1; b < pads.length; b++) { const p = pads[a], q = pads[b]; if (p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1) overlap++ }
          return {
            panel: [panel.left, panel.right], pane: [pane.left, pane.right], pan: apc.classList.contains('pan'),
            docScroll: document.documentElement.scrollWidth, vw: window.innerWidth, wrapScroll: wrap.scrollLeft,
            panelH: panel.height, docH: document.documentElement.scrollHeight, out, overlap, pads: pads.length,
            cut: rep.cut, outside: rep.outside, minPx: rep.minPx, labels: rep.labels,
          }
        })
        expect(errs).toEqual([])
        expect(m.pan).toBe(false)
        expect(m.panel[0]).toBeGreaterThanOrEqual(m.pane[0] - 1)
        expect(m.panel[1]).toBeLessThanOrEqual(m.pane[1] + 1)
        expect(m.docScroll).toBeLessThanOrEqual(m.vw)
        expect(m.wrapScroll).toBe(0)
        expect(m.out).toBe(0)
        expect(m.outside).toBe(0)
        expect(m.cut).toBe(0)
        expect(m.overlap).toBe(0)
        // pad names or numbers that stay drawn are at least 11 css px on the narrow panes (only pad numbers are drawn there), 7.5 on wide ones (printed captions, scaled with the unit)
        if (m.labels) expect(m.minPx).toBeGreaterThanOrEqual(w < 1000 ? 11 : 7.5)
        // one screen, not a 3300 px page: the drawing itself is no taller than the viewport at phone and tile widths
        if (w <= 1000) expect(m.panelH).toBeLessThanOrEqual(h)
        expect(m.docH).toBeLessThan(2600)
      } finally { await c.close() }
    }, 30000)
  }
})
