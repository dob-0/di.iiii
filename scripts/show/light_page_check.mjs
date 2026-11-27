#!/usr/bin/env node
// light_page_check.mjs: a read-only picture check of the light desk's Touch minimap (owner N7040/N7110, PR #1384; moved into di N7279.7).
// It opens the light page of a SCRATCH desk in headless Chromium with no GPU (nothing on his screens, no load on the graphics card).
// It only looks: it clicks nothing but the Touch page tab and never writes to the desk. The live desk is refused (exit 2).
// Per size it checks: every light inside the box (0 cut), the rig fills at least half of the box, and a size that comes
// again after a squeeze brings the rig back to its first size within 2 px (before #1384 the 33 lights stayed one 8 px square).
// Usage: node scripts/show/light_page_check.mjs --url URL --out DIR [--sizes 1536x864,844x390,1536x864,766x830] [--expect N | --show SHOW.json]
// Exit 0 = every size passed, 1 = one failed (named), 2 = usage or refused host.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_SIZES = '1536x864,844x390,1536x864,766x830'
export const MIN_FILL = 50
export const BACK_PX = 2

// Only a scratch desk may be looked at: 127.0.0.1, localhost, or a <name>-test.diiii.localhost test copy.
export function hostCheck(urlStr) {
  let u
  try { u = new URL(urlStr) } catch { return { ok: false, reason: `not a URL: ${urlStr}` } }
  const h = u.hostname.toLowerCase()
  if (h === 'diiii.localhost') return { ok: false, reason: 'refused: diiii.localhost is the live desk' }
  if (h === '127.0.0.1' || h === 'localhost' || /^[a-z0-9-]+-test\.diiii\.localhost$/.test(h)) return { ok: true, reason: '' }
  return { ok: false, reason: `refused: host ${h} is not 127.0.0.1, localhost or a *-test.diiii.localhost copy` }
}

export function parseSizes(str) {
  return String(str).split(',').map((s) => {
    const m = /^(\d+)x(\d+)$/.exec(s.trim())
    if (!m) throw new Error(`bad size "${s}", want WxH`)
    return { width: +m[1], height: +m[2] }
  })
}

// The light count a show file holds: its fixtures (a top-level "show" key is unwrapped).
export function countFixtures(doc) {
  const d = doc && typeof doc === 'object' && !Array.isArray(doc) && doc.show && typeof doc.show === 'object' ? doc.show : doc
  const f = d && d.fixtures
  if (Array.isArray(f)) return f.length
  if (f && typeof f === 'object') return Object.keys(f).length
  throw new Error('no fixtures in the show file')
}

// Pure fit math. stage = {left,top,right,bottom,width,height}; items = [{id,left,top,right,bottom}] (boxes with size 0 are left out).
export function fitFromBoxes(stage, items) {
  const bs = items.filter((b) => b.right - b.left > 0 && b.bottom - b.top > 0)
  if (!bs.length) return { box: [Math.round(stage.width), Math.round(stage.height)], lights: 0, cut: 0, rig: [0, 0], fill: 0 }
  const x0 = Math.min(...bs.map((b) => b.left)), x1 = Math.max(...bs.map((b) => b.right))
  const y0 = Math.min(...bs.map((b) => b.top)), y1 = Math.max(...bs.map((b) => b.bottom))
  const cut = bs.filter((b) => b.left < stage.left - 0.5 || b.right > stage.right + 0.5 || b.top < stage.top - 0.5 || b.bottom > stage.bottom + 0.5).length
  return {
    box: [Math.round(stage.width), Math.round(stage.height)],
    lights: new Set(bs.map((b) => b.id)).size, cut,
    rig: [Math.round(x1 - x0), Math.round(y1 - y0)],
    fill: Math.round(100 * Math.max((x1 - x0) / stage.width, (y1 - y0) / stage.height)),
  }
}

export function returnOk(first, again) {
  return Math.abs(first.rig[0] - again.rig[0]) <= BACK_PX && Math.abs(first.rig[1] - again.rig[1]) <= BACK_PX
}

// results = [{label, size:'WxH', m}] in run order. A size seen again is checked against its first run.
export function judge(results, expect) {
  const fails = []
  const firstOf = new Map()
  for (const r of results) {
    const { m, label } = r
    if (m.lights < expect) fails.push(`${label}: ${m.lights} lights, expected at least ${expect}`)
    if (m.cut !== 0) fails.push(`${label}: ${m.cut} light(s) cut by the box edge`)
    if (m.fill < MIN_FILL) fails.push(`${label}: rig fills ${m.fill}% of the box, needs at least ${MIN_FILL}%`)
    if (firstOf.has(r.size)) {
      const first = firstOf.get(r.size)
      if (!returnOk(first.m, m)) fails.push(`${label}: back at ${r.size} the rig is ${m.rig.join('x')} px, first it was ${first.m.rig.join('x')} px (more than ${BACK_PX} px apart)`)
    } else firstOf.set(r.size, r)
  }
  return { ok: fails.length === 0, fails }
}

export function parseArgs(argv) {
  const o = { sizes: DEFAULT_SIZES }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (['--url', '--out', '--sizes', '--expect', '--show'].includes(k)) {
      if (i + 1 >= argv.length) throw new Error(`${k} needs a value`)
      o[k.slice(2)] = argv[++i]
    } else throw new Error(`unknown argument ${k}`)
  }
  if (!o.url) throw new Error('--url is required')
  if (!o.out) throw new Error('--out is required')
  if (o.expect === undefined && !o.show) throw new Error('one of --expect N or --show SHOW.json is required')
  if (o.expect !== undefined && !/^[1-9]\d*$/.test(o.expect)) throw new Error('--expect wants a positive whole number')
  return o
}

async function main() {
  let o
  try { o = parseArgs(process.argv.slice(2)) } catch (e) {
    console.error(`usage error: ${e.message}. Usage: node scripts/show/light_page_check.mjs --url URL --out DIR [--sizes WxH,...] [--expect N | --show SHOW.json]`)
    return 2
  }
  const hc = hostCheck(o.url)
  if (!hc.ok) { console.error(hc.reason); return 2 }
  let expect, sizes
  try {
    expect = o.expect !== undefined ? +o.expect : countFixtures(JSON.parse(fs.readFileSync(o.show, 'utf8')))
    sizes = parseSizes(o.sizes)
  } catch (e) { console.error(`usage error: ${e.message}`); return 2 }
  fs.mkdirSync(o.out, { recursive: true })
  const lines = []
  const say = (s) => { lines.push(s); console.log(s) }
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] })
  const results = []
  try {
    const ctx = await browser.newContext({ viewport: sizes[0], deviceScaleFactor: 5 / 3 })
    const page = await ctx.newPage()
    await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (!(await page.locator('main.page[data-page="touch"]').isVisible())) await page.click('.page-tab[data-page="touch"]')
    // a page that never shows enough lights is measured anyway, so the verdict names the count (exit 1), not a timeout
    await page.waitForFunction((n) => new Set([...document.querySelectorAll('#touchStage .stage [data-id]')].map((e) => e.dataset.id)).size >= n, expect, { timeout: 20000 }).catch(() => {})
    for (let i = 0; i < sizes.length; i++) {
      const sz = sizes[i], size = `${sz.width}x${sz.height}`, label = `${i + 1}-${size}`
      if (i > 0) await page.setViewportSize(sz)
      await page.waitForTimeout(900)
      const raw = await page.evaluate(() => {
        const st = document.querySelector('#touchStage .stage')
        const r = st.getBoundingClientRect()
        const items = [...st.querySelectorAll('[data-id]')].map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.id, left: b.left, top: b.top, right: b.right, bottom: b.bottom } })
        return { stage: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, items }
      })
      const m = fitFromBoxes(raw.stage, raw.items)
      await page.screenshot({ path: path.join(o.out, `${label}.png`) })
      say(`${label}: box ${m.box.join('x')}, ${m.lights} lights, ${m.cut} cut, rig ${m.rig.join('x')} px, fills ${m.fill}% of the box`)
      results.push({ label, size, m })
    }
  } finally { await browser.close() }
  const v = judge(results, expect)
  if (v.ok) say(`PASS: ${results.length} of ${results.length} sizes show all ${results[0].m.lights} lights (expected ${expect}) inside the box, filling at least half of it, and a repeated size gives the same rig within ${BACK_PX} px`)
  else { for (const f of v.fails) say(`FAIL ${f}`); say(`FAIL: ${v.fails.length} problem(s); see the lines above`) }
  fs.writeFileSync(path.join(o.out, 'run.txt'), lines.join('\n') + '\n')
  return v.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e.stack || e.message); process.exit(2) })
}
