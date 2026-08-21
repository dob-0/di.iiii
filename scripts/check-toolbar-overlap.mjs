/**
 * check-toolbar-overlap.mjs — a class of bug verify-surfaces.mjs cannot see:
 * sibling elements that never escape the viewport, but collide with each
 * other. verify-surfaces checks "does anything overflow the viewport"; this
 * checks "do these direct children's boxes intersect", which is what a
 * center-flex hint pill overlapping a fixed-width button cluster actually is.
 *
 * Drives a route through real interaction (not just a bare page load) so it
 * can reach dynamic toolbar states — e.g. Raw's topbar only carries content
 * once a node exists, and its center slot swaps between a hint pill and a
 * breadcrumb trail depending on nav depth.
 *
 * USAGE
 *   node scripts/check-toolbar-overlap.mjs --route /open/raw --container .raw-topbar --children ".raw-topbar-left,.raw-topbar-center,.raw-topbar-right"
 *   node scripts/check-toolbar-overlap.mjs --base http://localhost:5173 --route /open/raw --widths 1440,900,700,390
 *
 * Exit code is non-zero if any width shows an overlap.
 */
import { chromium } from 'playwright'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const BASE = arg('base', 'http://localhost:5173')
const ROUTE = arg('route', '/open/raw')
const CHILD_SELECTOR = arg('children', '.raw-topbar-left,.raw-topbar-center,.raw-topbar-right')
const WIDTHS = arg('widths', '1440,900,889,700,390').split(',').map(Number)

const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  // Raw's chrome is hidden by default — zen is the default for a new workspace
  // (docs/architecture/RAW_WORKSPACE.md). Without turning it off, every selector
  // below matches an EMPTY bar: this script reported "0 children checked ... PASS"
  // on a topbar change, green while asserting nothing. The empty-state guard at
  // the bottom now makes that impossible, and this makes the common case work.
  await context.addInitScript(() => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('dii.raw.zen.')) window.localStorage.removeItem(key)
      }
      window.localStorage.setItem('dii.raw.zen.default', 'off')
    } catch { /* private mode — the guard below still catches an empty bar */ }
  })
  const page = await context.newPage()
  // domcontentloaded, not networkidle: a project-bearing editor holds a socket
  // open, so networkidle never fires and the check times out instead of running.
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // seed real toolbar content: place a node so the topbar leaves its empty state
  await page.mouse.dblclick(500, 300).catch(() => {})
  await page.waitForTimeout(250)
  await page.keyboard.type('Number').catch(() => {})
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter').catch(() => {})
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(200)

  let failures = []
  let measuredAnything = false
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(150)
    // Zero-width boxes are not "children checked" — a display:none slot cannot
    // overlap anything, and counting it hides an empty bar behind a real number.
    const rects = (await page.$$eval(CHILD_SELECTOR, els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }))).filter(r => r.width > 0)
    if (rects.length) measuredAnything = true
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (intersects(rects[i], rects[j])) {
          failures.push(`width ${w}px: child ${i} overlaps child ${j}`)
        }
      }
    }
    console.log(`${w}px: ${rects.length} children checked, ${failures.length} overlaps so far`)
  }

  await browser.close()

  if (failures.length) {
    console.error('\nFAIL — overlaps found:')
    failures.forEach(f => console.error(`  ${f}`))
    process.exit(1)
  }

  // The check that makes the rest of it mean something. This script once reported
  // "0 children checked ... PASS" on a real topbar change, because Raw's chrome is
  // hidden by default — a green run asserting nothing, on a check src/raw/AGENTS.md
  // REQUIRES for every topbar change. A guard that cannot fail is decoration.
  if (!measuredAnything) {
    console.error(`\nFAIL — nothing to measure: "${CHILD_SELECTOR}" matched no visible box at any width.`)
    console.error(`  The bar is probably hidden (Raw is zen by default), or the selector/route is wrong.`)
    console.error(`  Route was ${BASE}${ROUTE}. A pass here would assert nothing.`)
    process.exit(1)
  }

  console.log('\nPASS — no sibling overlap at any tested width')
}

main()
