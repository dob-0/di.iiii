#!/usr/bin/env node
/**
 * verify-raw-drag.mjs — real-pointer test of dragging a card on the Raw canvas.
 *
 * Why it exists (owner, 2026-10-05: "do the real human test, not the value
 * changes"): the drag bugs found with a real mouse on dev were invisible to
 * unit tests, because they live in the pointer -> viewport -> op path. Every
 * move here is Playwright page.mouse.down/move/up with `steps`, in Chromium
 * at deviceScaleFactor 1.25 (the owner's screen). Nothing calls a handler or
 * sets a value; the only reads are the card's bounding box on screen and the
 * server's own op log (POST /ops requests, counted at the network).
 *
 * Checks (each prints PASS/FAIL, exit 1 on any FAIL):
 *   1. Dragging right toward the edge moves the card RIGHT on screen and never
 *      under the right-hand floating panel (the visible canvas edge).
 *   2. A drag sends at most ONE updateNode op, and none identical to the last.
 *   3. The held card is on top of the cards it passes over (elementFromPoint).
 *
 * Needs a running app: di-dev up <tree> --api scratch  (never npm run dev).
 * Usage: node scripts/verify-raw-drag.mjs --base http://127.0.0.1:5314 --api http://127.0.0.1:4306/serverXR
 */
import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { person } from '../.claude/skills/run-di-iiii/driver.mjs'

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

const user = `dragger${Date.now().toString(36)}`
// The scratch server's own database (di-dev: ~/.cache/di-dev/<tree>/data); the
// driver's account() would look in this checkout's serverXR/data instead.
const DB = arg('db', `${process.env.HOME}/.cache/di-dev/raw-drag/data/di.db`)
const registered = await fetch(`${API}/api/auth/password/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: 'driver-passphrase-9x', displayName: user })
})
if (!registered.ok) throw new Error(`register ${registered.status}`)
{
    const db = new DatabaseSync(DB)
    db.prepare('update users set spaces = ? where username = ?').run(JSON.stringify(['main']), user)
    db.close()
}
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
await context.close()
const page = await person(browser, { as: user })
await page.setViewportSize({ width: 1440, height: 900 })

// A project with four cards, made through the page's own session.
const projectId = `drag-${Date.now().toString(36)}`
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
await page.screenshot({ path: '/tmp/claude-1000/raw-drag-before.png' })

const dragCard = async (id, dx, dy, { steps = 40, hold = 900 } = {}) => {
    const b = await box(id)
    const sx = b.x + 40, sy = b.y + 14
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + dx, sy + dy, { steps })
    await page.waitForTimeout(hold)
    return { sx, sy, release: () => page.mouse.up() }
}

// 3. on top while held: drag The night over Pricing and read what is under the pointer's card.
{
    const held = await dragCard('n-night', 300, 0, { steps: 30, hold: 300 })
    const nb = await box('n-night')
    const probe = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-card-id]')?.getAttribute('data-card-id'), { x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 })
    await held.release()
    await page.waitForTimeout(500)
    check('3. a held card is on top of the card it passes over', probe === 'n-night', `topmost at its centre: ${probe}`)
}

// 1 + 2. Drag Pricing right by 520 px toward the edge, hold, release; count ops.
{
    const before = await box('n-pricing')
    const edge = await visibleRight()
    ops.length = 0
    const held = await dragCard('n-pricing', 520, 0, { steps: 40, hold: 1200 })
    const opsWhileHeld = ops.length
    await held.release()
    await page.waitForTimeout(1000)
    const after = await box('n-pricing')
    const moveOps = ops.filter((o) => o.type === 'updateNode')
    const sig = moveOps.map((o) => JSON.stringify(o.payload))
    const dup = sig.filter((s, i) => i > 0 && s === sig[i - 1]).length
    check('1a. dragging right moves the card right on screen', after.x > before.x + 100, `x ${before.x.toFixed(0)} -> ${after.x.toFixed(0)}`)
    check('1b. the card stops before the visible right edge (panel)', after.x + 24 <= edge + 1, `left ${after.x.toFixed(0)}, edge ${edge.toFixed(0)}`)
    check('2a. at most one updateNode op for the whole drag', moveOps.length <= 1, `${moveOps.length} ops (${opsWhileHeld} while held)`)
    check('2b. no op identical to the one before', dup === 0, `${dup} repeats`)
    await page.screenshot({ path: '/tmp/claude-1000/raw-drag-after.png' })
}

// 1c. Carry a card to the window edge, pointer held in the edge band, and watch the pan.
{
    const before = await box('n-end')
    const edge = await visibleRight()
    ops.length = 0
    const startX = before.x + 40
    const held = await dragCard('n-end', 1430 - startX, 500, { steps: 40, hold: 1500 })
    const mid = await box('n-end')
    await held.release()
    await page.waitForTimeout(800)
    const after = await box('n-end')
    console.log(`  info  edge drag: x ${before.x.toFixed(0)} -> held ${mid.x.toFixed(0)} -> dropped ${after.x.toFixed(0)}; visible edge ${edge.toFixed(0)}; ops ${ops.length}`)
    check('1c. carried to the edge, the card ends RIGHT of where it began, never left', after.x > before.x, `x ${before.x.toFixed(0)} -> ${after.x.toFixed(0)}`)
    check('1d. the dropped card is not under the panel or past the visible edge', after.x + 24 <= edge + 1, `left ${after.x.toFixed(0)}, edge ${edge.toFixed(0)}`)
    await page.screenshot({ path: '/tmp/claude-1000/raw-drag-edge.png' })
}

// 5. A lone letter typed with a card selected must not rename it (owner saw "o").
{
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-card-id="n-bar"]').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    ops.length = 0
    await page.locator('[data-card-id="n-bar"] header').click()
    await page.waitForTimeout(300)
    for (const key of ['o', 'x', 'a']) { await page.keyboard.press(key); await page.waitForTimeout(150) }
    await page.mouse.click(700, 700)
    await page.waitForTimeout(800)
    const renames = ops.filter((o) => o.type === 'updateNode' && o.payload?.patch && 'label' in o.payload.patch)
    check('5. typing letters with a card selected writes no rename', renames.length === 0, JSON.stringify(renames.map((o) => o.payload.patch)))
    ops.length = 0
    await page.locator('[data-card-id="n-bar"] header').click()
    await page.keyboard.press('n')
    await page.keyboard.press('o')
    await page.mouse.click(700, 700)
    await page.waitForTimeout(800)
    console.log(`  info  N then o (N is the documented rename key): ${JSON.stringify(ops.filter((o) => o.type === 'updateNode').map((o) => o.payload.patch))}`)
}
await browser.close()
const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
