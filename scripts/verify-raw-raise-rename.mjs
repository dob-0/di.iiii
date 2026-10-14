#!/usr/bin/env node
/**
 * verify-raw-raise-rename.mjs — real mouse + keyboard test, Raw canvas, DPR 1.25.
 *   A. Raise on release: a card dropped onto another stays on top (elementFromPoint
 *      after release), and moving it caused one updateNode op (no extra save).
 *   B. Rename guard: N opens the title field without taking the next key as the
 *      whole name (N then "o" must not leave the label "o"); Escape restores;
 *      N, type, Enter still renames.
 * Needs: di-dev up raw-followup --api scratch. Playwright page.mouse/keyboard only.
 * Usage: node scripts/verify-raw-raise-rename.mjs --base http://127.0.0.1:PORT --api http://127.0.0.1:PORT/serverXR
 */
import { chromium } from 'playwright'

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}
const BASE = arg('base', 'http://127.0.0.1:5314')
const API = arg('api', 'http://127.0.0.1:4306/serverXR')
const results = []
const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
// The scratch serverXR runs with auth disabled (the page shows "Auth Disabled"), so no
// sign-in is needed; the page's own anonymous session is the editor.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
const page = await context.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

// A project with four cards, made through the page's own session.
const projectId = `raise-${Date.now().toString(36)}`
const seeded = await page.evaluate(async ({ projectId }) => {
    const j = (r) => r.json().catch(() => ({}))
    const made = await fetch('/serverXR/api/spaces/main/projects', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: projectId, slug: projectId })
    })
    const doc = await j(await fetch(`/serverXR/api/projects/${projectId}/document`, { credentials: 'include' }))
    const card = (id, label, x, y) => ({ type: 'createNode', payload: { node: { id, typeId: 'value.number', label, values: {}, graphX: x, graphY: y } } })
    const wrote = await fetch(`/serverXR/api/projects/${projectId}/ops`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            baseVersion: Number(doc.version) || 0,
            ops: [card('n-bar', 'Bar', 40, 60), card('n-night', 'The night', 40, 260), card('n-pricing', 'Pricing', 320, 260), card('n-end', 'End', 600, 60)]
        })
    })
    return { made: made.status, wrote: wrote.status }
}, { projectId })
if (seeded.made >= 400 || seeded.wrote >= 400) throw new Error(`seeding failed ${JSON.stringify(seeded)}`)

const ops = []
page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/projects\/[^/]+\/ops/.test(r.url())) {
        try { ops.push(...(JSON.parse(r.postData() || '{}').ops || [])) } catch { /* not json */ }
    }
})
await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('[data-card-id="n-pricing"]').waitFor({ timeout: 30000 })
await page.waitForTimeout(1500)
// Zoom to about 82 % like the owner's screen, with the real "-" button.
for (let i = 0; i < 12; i += 1) {
    const label = await page.locator('.raw-graph-zoom-value').textContent().catch(() => '')
    if (Number.parseInt(label, 10) <= 85) break
    await page.getByLabel('Zoom out').click()
    await page.waitForTimeout(120)
}
// Select a card with a real click so the settings panel opens, as it was open for the owner.
await page.locator('[data-card-id="n-bar"] header').click()
await page.waitForTimeout(500)

const box = (id) => page.locator(`[data-card-id="${id}"]`).boundingBox()
const canvasRect = () => page.evaluate(() => {
    const c = document.querySelector('[data-card-id]').closest('[class*="raw-graph"]').parentElement
    const r = c.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
})
// The visible right edge: the left edge of the floating panel when one covers
// the canvas, else the window edge.
const visibleRight = () => page.evaluate(() => {
    let right = window.innerWidth
    for (const el of document.querySelectorAll('aside, [role="complementary"], [class*="settings"], [class*="inspector"]')) {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        if (r.width > 120 && r.height > 200 && (s.position === 'fixed' || s.position === 'absolute') && r.right >= window.innerWidth - 4 && r.left > window.innerWidth / 2) right = Math.min(right, r.left)
    }
    return right
})
console.log(`[verify-raw-drag] ${BASE}/main/raw/projects/${projectId}  DPR 1.25  1440x900`)


const topAt = (x, y) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-card-id]')?.getAttribute('data-card-id'), { x, y })
const labelOf = async (id) => (await page.locator(`[data-card-id="${id}"] header`).innerText()).trim()
console.log(`[verify-raw-raise-rename] ${BASE}/main/raw/projects/${projectId}  DPR 1.25  1440x900`)

// A. drag The night onto Pricing, release, look at what is on top at the overlap.
{
    const night = await box('n-night'), pricing = await box('n-pricing')
    ops.length = 0
    const sx = night.x + 40, sy = night.y + 14
    await page.mouse.move(sx, sy); await page.mouse.down()
    await page.mouse.move(sx + (pricing.x - night.x) + 30, sy, { steps: 30 })
    await page.mouse.up(); await page.waitForTimeout(800)
    const nb = await box('n-night')
    // centre of the rectangle the two cards share
    const pb0 = await box('n-pricing')
    const ox = (Math.max(nb.x, pb0.x) + Math.min(nb.x + nb.width, pb0.x + pb0.width)) / 2
    const oy = (Math.max(nb.y, pb0.y) + Math.min(nb.y + nb.height, pb0.y + pb0.height)) / 2
    console.log(`  info  overlap centre ${ox.toFixed(0)},${oy.toFixed(0)}; night ${JSON.stringify(nb)} pricing ${JSON.stringify(pb0)}`)
    const top = await topAt(ox, oy)
    console.log('  info  classes after release:', await page.evaluate(() => [...document.querySelectorAll('[data-card-id]')].map((c) => c.dataset.cardId + ':' + c.className.replace(/raw-graph-node-card|is-lod-\\w+/g, '').trim() + ':z' + getComputedStyle(c).zIndex).join(' | ')))
    const moveOps = ops.filter((o) => o.type === 'updateNode')
    check('A1. the card just moved is on top of the card it overlaps after release', top === 'n-night', `topmost at overlap: ${top}`)
    check('A2. one updateNode op for the drag, nothing more', moveOps.length === 1, `${moveOps.length} ops`)
    // click elsewhere card -> that one rises
    await page.locator('[data-card-id="n-pricing"] header').click({ position: { x: 150, y: 10 } }).catch(() => {})
    await page.waitForTimeout(300)
    const pb = await box('n-pricing')
    const top2 = await topAt(pb.x + 20, pb.y + 20)
    console.log(`  info  after selecting Pricing, topmost at its top-left: ${top2}`)
}

// B. rename guard.
{
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-card-id="n-bar"]').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    const before = await labelOf('n-bar')
    await page.locator('[data-card-id="n-bar"] header').click()
    await page.waitForTimeout(300)
    ops.length = 0
    await page.keyboard.press('n'); await page.waitForTimeout(200)
    await page.keyboard.press('o'); await page.waitForTimeout(200)
    const typed = await page.locator('.raw-property-title-input').inputValue().catch(() => '(no field)')
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    await page.mouse.click(700, 700); await page.waitForTimeout(800)
    const renames = ops.filter((o) => o.type === 'updateNode' && o.payload?.patch && 'label' in o.payload.patch)
    check('B1. N then one key does not make that key the whole name', typed !== 'o', `field after N,o: "${typed}"`)
    check('B2. Escape leaves the old name and writes no rename', renames.length === 0 && (await labelOf('n-bar')) === before, `label "${await labelOf('n-bar')}" (was "${before}")`)
    // keyboard rename still works: N, select all, type, Enter
    await page.locator('[data-card-id="n-bar"] header').click(); await page.waitForTimeout(400)
    await page.keyboard.press('n'); await page.waitForTimeout(300)
    console.log('  info  title field open for the second rename:', await page.locator('.raw-property-title-input').count())
    await page.keyboard.press('Control+a'); await page.keyboard.type('Bar two'); await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await page.screenshot({ path: process.env.SHOT || '/tmp/b3.png' })
    console.log('  info  cards after rename:', await page.evaluate(() => [...document.querySelectorAll('[data-card-id]')].map((c) => c.dataset.cardId + '=' + (c.querySelector('header')?.innerText || '(no header)').replace(/\n/g, ' / ')).join(' | ')))
    check('B3. N, Ctrl+A, type, Enter still renames', (await page.locator('[data-card-id="n-bar"]').innerText()).includes('Bar two'), 'see info line')
}
await browser.close()
const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
