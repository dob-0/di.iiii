/**
 * check-box-escape.mjs — a class of bug the other two surface checks cannot see: a box that stays
 * inside the viewport but runs out of ITS OWN cell, so it lies under the neighbour (the Agent
 * sessions directory rows ran under "Session detail", 2026-11-17: `width: 100%` + padding on a
 * content-box div, 24 px too wide at every screen width).
 *
 *   verify-surfaces.mjs       does anything leave the VIEWPORT
 *   check-toolbar-overlap.mjs do NAMED siblings intersect
 *   this script               does ANY box leave its PARENT's content box sideways
 *
 * A box is flagged when it is in flow (not fixed/absolute/sticky), its parent does not clip or
 * scroll on purpose (overflow other than visible), it is not transformed or animated, and its left or right edge is more than 2 px
 * outside the parent's content box. Only the outermost offender of a chain is reported.
 *
 * USAGE (run on the agent screen, never the owner's display):
 *   di-test-browser run scripts/check-box-escape.mjs -- --base http://monitor.diiii.localhost --routes /admin
 *   node scripts/check-box-escape.mjs --base http://localhost:5173 --routes /,/wiki --widths 1440,700,390
 *   --click "Monitor,Agent sessions"   click each named control after load and check again (admin sections)
 *
 * With DI_TEST_CDP set (di-test-browser run) it drives that browser; otherwise it launches one.
 * Exit code is 1 when any page shows an escape, so it can gate a change. It prints how many boxes it
 * looked at per page: a page that checked 0 boxes is a failure, never a pass.
 */
import { chromium } from 'playwright'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const BASE = arg('base', 'http://localhost:5173')
const ROUTES = arg('routes', '/').split(',').filter(Boolean)
const WIDTHS = arg('widths', '1440,1000,700,390').split(',').map(Number)
const CLICKS = arg('click', '').split(',').filter(Boolean)
const TOLERANCE = 2

/** Runs inside the page. Returns { checked, escapes: [{ path, by, side }] }. */
function audit(tolerance) {
  const describe = (el) => {
    const parts = []
    for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement) {
      const cls = String(n.className?.baseVal ?? n.className ?? '').split(/\s+/).filter(Boolean)[0]
      parts.unshift(`${n.tagName.toLowerCase()}${cls ? '.' + cls : ''}`)
    }
    return parts.join(' > ')
  }
  const flagged = new Set()
  const escapes = []
  let checked = 0
  for (const el of document.body.querySelectorAll('*')) {
    const parent = el.parentElement
    // a visually hidden layer (1-2 px, clipped) is meant to hold content that spills out of it
    let hidden = false
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const b = n.getBoundingClientRect()
      if (b.width <= 2 && b.height <= 2 && getComputedStyle(n).overflow !== 'visible') { hidden = true; break }
    }
    if (hidden) continue
    if (!parent || parent === document.body || el.closest('svg') || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue
    const cs = getComputedStyle(el)
    if (['fixed', 'absolute', 'sticky'].includes(cs.position) || cs.display === 'none' || cs.display === 'contents') continue
    // a transformed or animated box (a pulse, a flip) is drawn bigger or shifted on purpose
    if (cs.transform !== 'none' || cs.animationName !== 'none') continue
    const ps = getComputedStyle(parent)
    if (ps.display === 'contents' || ps.display === 'inline' || ps.overflowX !== 'visible') continue
    const r = el.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || p.width === 0) continue
    checked += 1
    const left = p.left + parseFloat(ps.borderLeftWidth) + parseFloat(ps.paddingLeft)
    const right = p.right - parseFloat(ps.borderRightWidth) - parseFloat(ps.paddingRight)
    const by = Math.max(r.right - right, left - r.left)
    if (by > tolerance && !flagged.has(parent)) {
      flagged.add(el)
      escapes.push({ path: describe(el), by: Math.round(by), side: r.right - right >= left - r.left ? 'right' : 'left' })
    }
  }
  return { checked, escapes }
}

async function main() {
  const cdp = process.env.DI_TEST_CDP
  const browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch()
  const context = cdp ? browser.contexts()[0] : await browser.newContext()
  const page = await context.newPage()
  let bad = 0
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      // 'load' + a pause: the app keeps a live socket open, so the network never goes idle
      await page.goto(`${BASE}${route}`, { waitUntil: 'load' })
      await page.waitForTimeout(3000)
      for (const label of ['', ...CLICKS]) {
        if (label) {
          const target = page.getByText(label, { exact: true }).first()
          if (!(await target.count())) { console.log(`XX ${route} ${width}px  "${label}" not found`); bad += 1; continue }
          await target.click()
          await page.waitForTimeout(1500)
        }
        const { checked, escapes } = await page.evaluate(audit, TOLERANCE)
        const failed = escapes.length > 0 || checked === 0
        if (failed) bad += 1
        console.log(`${failed ? 'XX' : 'ok'} ${route} ${String(width).padStart(4)}px ${(label || '(page)').padEnd(18)} boxes=${checked} escapes=${escapes.length}`)
        for (const e of escapes.slice(0, 8)) console.log(`     ${e.side} +${e.by}px  ${e.path}`)
      }
    }
  }
  await page.close()
  await browser.close()
  console.log(bad ? `FAIL: ${bad} page state(s) with a box outside its cell` : 'PASS: no box outside its cell')
  process.exit(bad ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(2) })
