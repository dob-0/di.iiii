#!/usr/bin/env node
/**
 * verify-raw-resize.mjs — real-pointer test of resizing a card on the Raw canvas.
 *
 * Every move is Playwright page.mouse.down/move/up with `steps` (Chromium, DPR 1.25,
 * 1440x900); nothing calls a handler. Reads: the card's box on screen, the number of
 * content lines drawn, and the server's op stream (POST /ops, counted at the network).
 *
 *   A. a square handle sits in the card's bottom-right corner (no rounding)
 *   B. dragging it by (dx, dy) screen px grows the card by (dx, dy) on screen at
 *      three zoom levels (zoom-correct)
 *   C. ONE updateNode op for the whole resize, carrying values.cardSize
 *   D. a taller text card draws more of its content (fewer "+ N more")
 *   E. a drag far inward stops at a minimum that keeps title + ports readable
 *   F. double-click on the handle gives the auto size back and writes one op
 *   G. the size is still there after a reload (the server kept it)
 *
 * Needs: di-dev up <tree> --api scratch.
 * Usage: node scripts/verify-raw-resize.mjs --base http://127.0.0.1:5314 --api http://127.0.0.1:4306/serverXR
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
const DB = arg('db', `${process.env.HOME}/.cache/di-dev/raw-drag/data/di.db`)
const SHOTS = '/tmp/claude-1000'
const results = []
const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol

const user = `sizer${Date.now().toString(36)}`
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
// Sign in with the driver, then carry the session into a context at the owner's
// screen: 1440x900, device pixel ratio 1.25 (the driver's own is 2).
const signedIn = await person(browser, { as: user })
const state = await signedIn.context().storageState()
await signedIn.context().close()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25, storageState: state })
const p = await context.newPage()
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

const projectId = `size-${Date.now().toString(36)}`
const longText = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of the programme text`).join('\n')
await p.evaluate(async ({ projectId, longText }) => {
    const send = (url, body) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    await send('/serverXR/api/spaces/main/projects', { title: projectId, slug: projectId })
    const doc = await (await fetch(`/serverXR/api/projects/${projectId}/document`, { credentials: 'include' })).json()
    const node = (id, typeId, label, x, y, values = {}) => ({ type: 'createNode', payload: { node: { id, typeId, label, values, graphX: x, graphY: y } } })
    await send(`/serverXR/api/projects/${projectId}/ops`, {
        baseVersion: Number(doc.version) || 0,
        ops: [node('n-num', 'value.number', 'Price', 40, 40), node('n-text', 'view.text', 'Programme', 340, 40, { content: longText })]
    })
}, { projectId, longText })

const ops = []
p.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/projects\/[^/]+\/ops/.test(r.url())) {
        try { ops.push(...(JSON.parse(r.postData() || '{}').ops || [])) } catch { /* not json */ }
    }
})
const open = async () => {
    await p.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await p.locator('[data-card-id="n-text"]').waitFor({ timeout: 30000 })
    await p.waitForTimeout(1500)
}
await open()
const card = (id) => p.locator(`[data-card-id="${id}"]`)
const box = (id) => card(id).boundingBox()
const handle = (id) => card(id).locator('.raw-graph-node-resize')
const zoomNow = async () => Number.parseInt(await p.locator('.raw-graph-zoom-value').textContent(), 10) / 100
const contentLines = (id) => card(id).locator('.raw-graph-node-content-line:not(.is-more)').count()
console.log(`[verify-raw-resize] ${BASE}/main/raw/projects/${projectId}  DPR 1.25  1440x900`)

// A
const hCount = await handle('n-num').count()
const hBox = hCount ? await handle('n-num').boundingBox() : null
const cBox = await box('n-num')
check('A. a resize handle is in the card\'s bottom-right corner', hCount === 1 && hBox && hBox.x + hBox.width >= cBox.x + cBox.width - 2 && hBox.y + hBox.height >= cBox.y + cBox.height - 2, hCount ? `handle ${hBox.width.toFixed(0)}x${hBox.height.toFixed(0)}` : 'no .raw-graph-node-resize')
if (!hCount) { await p.screenshot({ path: `${SHOTS}/raw-resize-before.png` }); console.log('\nFAILED (no handle)'); await browser.close(); process.exit(1) }
const radius = await handle('n-num').evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0)
check('A2. the handle is a rectangle (radius 0 to 2 px)', radius <= 2, `${radius}px`)

const dragHandle = async (id, dx, dy, steps = 30) => {
    const b = await handle(id).boundingBox()
    const sx = b.x + b.width / 2, sy = b.y + b.height / 2
    await p.mouse.move(sx, sy)
    await p.mouse.down()
    await p.mouse.move(sx + dx, sy + dy, { steps })
    await p.waitForTimeout(250)
    await p.mouse.up()
    await p.waitForTimeout(700)
}

await p.screenshot({ path: `${SHOTS}/raw-resize-before.png` })
// B + C at three zoom levels, on the number card
for (const target of [0.82, 1.0, 1.53]) {
    // move toward the target zoom with the real zoom buttons
    for (let i = 0; i < 30; i += 1) {
        const z = await zoomNow()
        if (Math.abs(z - target) < 0.045) break
        await p.getByLabel(z < target ? 'Zoom in' : 'Zoom out').click()
        await p.waitForTimeout(80)
    }
    await card('n-num').scrollIntoViewIfNeeded().catch(() => {})
    const z = await zoomNow()
    const before = await box('n-num')
    ops.length = 0
    await dragHandle('n-num', 60, 40)
    const after = await box('n-num')
    const sizeOps = ops.filter((o) => o.type === 'updateNode')
    console.log('  info  ops', JSON.stringify(sizeOps.map((o) => o.payload)), 'zoom', z)
    check(`B. zoom ${Math.round(z * 100)} %: card grows with the pointer (60 x 40 px)`, near(after.width - before.width, 60) && near(after.height - before.height, 40), `${before.width.toFixed(0)}x${before.height.toFixed(0)} -> ${after.width.toFixed(0)}x${after.height.toFixed(0)}`)
    check(`C. zoom ${Math.round(z * 100)} %: one updateNode with values.cardSize`, sizeOps.length === 1 && sizeOps[0].payload?.patch?.values?.cardSize?.w > 0, `${sizeOps.length} ops`)
    // F: give it back for the next round
    ops.length = 0
    await handle('n-num').dblclick()
    await p.waitForTimeout(700)
    const reset = await box('n-num')
    const resetOps = ops.filter((o) => o.type === 'updateNode')
    check(`F. zoom ${Math.round(z * 100)} %: double-click returns the auto size, one op`, near(reset.width, before.width, 2) && near(reset.height, before.height, 2) && resetOps.length === 1 && resetOps[0].payload?.patch?.values?.cardSize == null, `${reset.width.toFixed(0)}x${reset.height.toFixed(0)}, ${resetOps.length} op`)
}

// D: the text card shows more when taller
{
    await p.getByLabel('Fit graph').first().click().catch(() => {})
    const before = await contentLines('n-text')
    const moreBefore = await card('n-text').locator('.raw-graph-node-content-line.is-more').count()
    await dragHandle('n-text', 0, 260)
    const after = await contentLines('n-text')
    check('D. a taller text card draws more lines', after > before, `${before} -> ${after} lines (more-marker before: ${moreBefore})`)
    await p.screenshot({ path: `${SHOTS}/raw-resize-after.png` })
    // G: survives a reload
    const grown = await box('n-text')
    await open()
    await p.getByLabel('Fit graph').first().click().catch(() => {})
    const lines = await contentLines('n-text')
    check('G. the size is kept after a reload', lines === after, `${lines} lines after reload`)
    // E: minimum
    const b = await box('n-num')
    await dragHandle('n-num', -500, -500)
    const small = await box('n-num')
    const z = await zoomNow()
    check('E. dragging far inward stops at a readable minimum', small.width >= 100 * z && small.height >= 60 * z && small.width < b.width + 1, `${small.width.toFixed(0)}x${small.height.toFixed(0)} at ${Math.round(z * 100)} %`)
    void grown
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
