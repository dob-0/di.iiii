// Cold start: after 6 s of rest, how long are the first frames of a drag? A: the pointer arrives and drags at once;
// B: the pointer arrives over the view 500 ms before the drag (the pointerover kick warms the GPU).
// NAV_URL=<studio url> di-test-browser run scripts/nav/measure-coldstart.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(6000)
    const box = await page.locator('canvas').first().boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    const out = {}
    for (const variant of ['A-drag-at-once', 'B-enter-500ms-before', 'A-drag-at-once', 'B-enter-500ms-before']) {
        await page.mouse.move(5, 5); await sleep(6000) // rest, pointer off the canvas
        await page.evaluate(() => { window.__gaps = []; let last = null; const f = (ts) => { if (last != null) window.__gaps.push(+(ts - last).toFixed(1)); last = ts; if (window.__gaps.length < 400) requestAnimationFrame(f) }; requestAnimationFrame(f) })
        if (variant.startsWith('B')) { await page.mouse.move(cx, cy); await sleep(500) }
        const t0 = await page.evaluate(() => window.__gaps.length)
        await page.mouse.move(cx, cy); await page.mouse.down({ button: 'left' })
        for (let i = 1; i <= 20; i++) { await page.mouse.move(cx + 12 * i, cy); await sleep(15) }
        await page.mouse.up({ button: 'left' }); await sleep(400)
        const gaps = await page.evaluate((t0) => window.__gaps.slice(t0, t0 + 8), t0)
        ;(out[variant] ||= []).push(gaps)
    }
    console.log('COLDSTART', JSON.stringify(out))
    await page.close(); process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { await page?.close() } catch {} ; process.exit(1) })
