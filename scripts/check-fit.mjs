/**
 * check-fit.mjs — one command that fails when something visible does not fit.
 *
 * WHY: a chip cut to "Space: mai", or a phone page whose real content is pushed past the right edge, passes every
 * unit test, because jsdom has no layout. verify-surfaces.mjs looks for overflow past the viewport per device;
 * check-toolbar-overlap.mjs looks for sibling collisions in one bar. Neither looks for TEXT THAT IS CUT, and neither
 * walks the admin / Monitor sections at the sizes the owner really uses. This does.
 *
 * FAILS (exit 1) when, at any route x size, a visible element
 *   - clipped    its text is cut: scrollWidth > clientWidth + 1 with overflow hidden/clip or text-overflow ellipsis
 *   - ancestor   its box runs past an ancestor that clips (overflow hidden/clip), so the ancestor cuts it
 *   - edge       its box extends past the viewport's right edge (outside any scrolling container)
 *   - hscroll    the page, or a full-width scroller, scrolls horizontally
 * Mark an element (or an ancestor) `data-fit-ok` ONLY when the cut is on purpose (a long path that ends in an ellipsis
 * with its full text in a title). Each offender prints a selector, its text and the sizes.
 *
 * USAGE
 *   node scripts/check-fit.mjs                                  (base http://localhost:5173)
 *   node scripts/check-fit.mjs --base http://x.diiii.localhost --routes "/admin#monitor,/admin#estate" --sizes 1800x1000,372x900
 *   npm run check:fit
 *   node scripts/check-fit.mjs --routes /admin#monitor --inject ".preferences-topbar-main{overflow:hidden;width:300px}"   (must exit 1)
 * Needs a running di (use `di-dev up <tree>`; never npm run dev). Screenshots of offenders: --shots <dir>.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const BASE = arg('base', process.env.FIT_BASE || 'http://localhost:5173').replace(/\/$/, '')
const SIZES = arg('sizes', '1800x1000,1440x900,1536x864,390x844,372x900').split(',').map((s) => s.split('x').map(Number))
const ROUTES = arg('routes', [
  '/admin#manage', '/admin#opencall', '/admin#monitor', '/admin#monitor-full', '/admin#agents', '/admin#visitors',
  '/admin#overview', '/admin#system', '/admin#estate', '/', '/wiki',
].join(',')).split(',')
const SETTLE = Number(arg('settle', 2500))
const SHOTS = arg('shots', null)
// --inject "<css>": added to every page. Used to prove the check fails on a known fault (see the self-test in the PR).
const INJECT = arg('inject', null)

// Runs in the page. Returns the offenders; no side effects.
function collect() {
  const out = []
  const vw = window.innerWidth
  const clipKinds = new Set(['hidden', 'clip'])
  const scrollKinds = new Set(['auto', 'scroll'])
  const sel = (el) => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && parts.length < 4 && e !== document.body; e = e.parentElement) {
      let s = e.tagName.toLowerCase()
      if (e.id) { parts.unshift(`${s}#${e.id}`); break }
      const cls = String(e.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2)
      if (cls.length) s += '.' + cls.join('.')
      parts.unshift(s)
    }
    return parts.join(' > ')
  }
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const ownText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim())
  const seen = new Set()
  const add = (kind, el, extra) => {
    const key = kind + sel(el)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, selector: sel(el), text: txt(el), ...extra })
  }
  const root = document.scrollingElement || document.documentElement
  if (root.scrollWidth > vw + 1) add('hscroll', document.body, { detail: `document scrollWidth ${root.scrollWidth} > viewport ${vw}` })
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg, script, style, [data-fit-ok]')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 2 || r.height <= 2) continue // also drops 1px visually-hidden (sr-only) labels
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (cs.position === 'fixed' && cs.pointerEvents === 'none') continue
    const hasText = ownText(el) || (el.children.length === 0 && txt(el))
    // a full-width scroller that scrolls sideways IS a page that scrolls horizontally
    if (scrollKinds.has(cs.overflowX) && r.width >= vw - 1 && el.scrollWidth > el.clientWidth + 1) {
      add('hscroll', el, { detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` })
    }
    if (hasText && (clipKinds.has(cs.overflowX) || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1) {
      add('clipped', el, { detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` })
    }
    if (!hasText) continue
    // contained by a scroller? then it is reachable, not cut. contained by a clipper? check it fits.
    let scroller = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (scrollKinds.has(acs.overflowX)) { scroller = true; break }
      if (clipKinds.has(acs.overflowX)) {
        const ar = a.getBoundingClientRect()
        if (a.hasAttribute('data-fit-ok')) break
        if (r.right > ar.right + 1 && ar.width > 0) {
          add('ancestor', el, { detail: `right ${Math.round(r.right)} > clipping ${sel(a)} right ${Math.round(ar.right)}` })
        }
        break
      }
    }
    if (!scroller && r.right > vw + 1 && cs.position !== 'fixed') {
      add('edge', el, { detail: `right ${Math.round(r.right)} > viewport ${vw}` })
    }
  }
  return out
}

const browser = await chromium.launch()
let failures = 0, checked = 0
for (const route of ROUTES) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(SETTLE)
      if (INJECT) await page.addStyleTag({ content: INJECT })
      const found = await page.evaluate(collect)
      checked++
      if (found.length) {
        failures += found.length
        console.log(`FAIL ${route} @ ${w}x${h}: ${found.length} offender(s)`)
        for (const f of found.slice(0, 12)) console.log(`  [${f.kind}] ${f.selector} "${f.text}" ${f.detail}`)
        if (found.length > 12) console.log(`  ... ${found.length - 12} more`)
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${route.replace(/[^\w]+/g, '_')}-${w}.png`) }) }
      } else console.log(`ok   ${route} @ ${w}x${h}`)
    } catch (e) {
      failures++
      console.log(`FAIL ${route} @ ${w}x${h}: could not load (${e.message.split('\n')[0]})`)
    }
    await ctx.close()
  }
}
await browser.close()
console.log(`check-fit: ${checked} page-sizes checked, ${failures} offender(s)`)
process.exit(failures ? 1 : 0)
