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
  const page = await browser.newPage()
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'networkidle' })

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
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(150)
    const rects = await page.$$eval(CHILD_SELECTOR, els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }))
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
  console.log('\nPASS — no sibling overlap at any tested width')
}

main()
