#!/usr/bin/env node
// DRIVE the mapper's desk and read every result back from the SERVER rather
// than from the page — fire cues by key, drag a corner into a neighbour to
// prove the snap, duplicate, paste, mask, export.
//
//   node scripts/map-tools-check.mjs <out-dir> [base] [api] [space] [project]
//
// This is the script that found the two silent failures in the tools: a
// Duplicate that did nothing because a copied id overwrote the generated one,
// and a camera branch made unreachable by a `!ref` fallback. Neither showed up
// in a screenshot, because in both cases the wall looked fine.
import { chromium } from 'playwright'

const [OUT, BASE = 'http://127.0.0.1:5199', API = 'http://127.0.0.1:4098', SPACE = 'dilijan', PROJECT = 'the-wall'] = process.argv.slice(2)
if (!OUT) {
    console.error('usage: node scripts/map-tools-check.mjs <out-dir> [base] [api] [space] [project]')
    process.exit(1)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/${SPACE}/map/${PROJECT}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)

const state = async () => {
    const r = await page.request.get(`${API}/api/projects/${PROJECT}/document`)
    return (await r.json()).document.mappingState
}

// --- cue firing ------------------------------------------------------
await page.keyboard.press('9')                                  // Blackout
await page.waitForTimeout(1200)
let s = await state()
console.log(`cue 9 (Blackout): fade=${s.fade} opacities=${s.surfaces.map((x) => x.opacity).join(',')}`)

await page.keyboard.press('2')                                  // The work
await page.waitForTimeout(1200)
s = await state()
console.log(`cue 2 (The work):  fade=${s.fade} opacities=${s.surfaces.map((x) => x.opacity).join(',')}`)

// --- snapping + guides ------------------------------------------------
await page.locator('.map-surface-row').nth(2).locator('.map-surface-name').click()
await page.waitForTimeout(400)
const before = (await state()).surfaces[2].corners[0]
// Drag ԳՈՌ's top-left toward ԺԱՆԱ's top-left, which is at a known x.
const neighbourX = (await state()).surfaces[1].corners[0][0]
const stage = await page.locator('.map-stage').boundingBox()
const handle = await page.locator('.map-overlay-handle circle').first().boundingBox()
await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
await page.mouse.down()
await page.mouse.move(stage.x + (neighbourX * stage.width) + 3, handle.y + handle.height / 2, { steps: 14 })
const guides = await page.locator('.map-guide').count()
await page.mouse.up()
await page.waitForTimeout(1200)
const after = (await state()).surfaces[2].corners[0]
console.log(`snap: guides drawn while dragging = ${guides}`)
console.log(`snap: x ${before[0].toFixed(5)} -> ${after[0].toFixed(5)}, neighbour is ${neighbourX.toFixed(5)}, snapped = ${Math.abs(after[0] - neighbourX) < 1e-9}`)

// --- duplicate + copy/paste look --------------------------------------
const countBefore = (await state()).surfaces.length
await page.locator('.map-panel-right button', { hasText: 'Duplicate' }).click()
await page.waitForTimeout(1200)
console.log(`duplicate: ${countBefore} -> ${(await state()).surfaces.length} surfaces`)

await page.locator('.map-panel-right button', { hasText: 'Copy' }).first().click()
await page.locator('.map-surface-row').first().locator('.map-surface-name').click()
await page.waitForTimeout(400)
await page.locator('.map-panel-right button', { hasText: 'Paste look' }).click()
await page.waitForTimeout(1200)
s = await state()
console.log(`paste look: surface 0 hue=${s.surfaces[0].hue} blend=${s.surfaces[0].blend} corners kept = ${s.surfaces[0].corners[0][0].toFixed(4)}`)

// --- mask from outline -------------------------------------------------
await page.locator('.map-panel-right button', { hasText: 'Mask from outline' }).click()
await page.waitForTimeout(1200)
console.log(`mask from outline: ${(await state()).surfaces[0].mask.length} points`)

// --- export ------------------------------------------------------------
await page.locator('.map-panel-left button', { hasText: 'Export' }).click()
await page.waitForTimeout(600)
const exported = await page.locator('.map-transfer-text').inputValue()
console.log(`export: ${exported.length} chars, parses = ${(() => { try { return Array.isArray(JSON.parse(exported).surfaces) } catch { return false } })()}`)
await page.locator('.map-transfer button', { hasText: 'Close' }).click()

await page.screenshot({ path: `${OUT}/map-tools.png` })
if (errors.length) console.log('page errors:', errors.slice(0, 4).join(' | '))
await browser.close()
