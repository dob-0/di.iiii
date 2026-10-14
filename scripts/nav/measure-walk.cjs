// Blender Walk in the Studio, measured with real keys on the agent screen: Shift+` enters, W for 1 s, Shift+W for 1 s, Esc.
// NAV_URL=<studio url> di-test-browser run scripts/nav/measure-walk.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findCc = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]
    while (stack.length) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { window.__cc = s.current; return true } }
        if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child) }
    return false
}
const pos = () => window.__cc._camera.position.toArray().map((v) => +v.toFixed(3))
let page
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(findCc); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await page.close(); process.exit(2) }
    await sleep(3000)
    const box = await page.locator('canvas').first().boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.mouse.move(cx, cy); await page.mouse.click(cx, cy); await sleep(300)
    const p0 = await page.evaluate(pos)
    await page.keyboard.press('Shift+Backquote'); await sleep(300)
    const locked = await page.evaluate(() => Boolean(document.pointerLockElement))
    const ccEnabled = await page.evaluate(() => window.__cc.enabled)
    await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW'); await sleep(300)
    const p1 = await page.evaluate(pos)
    await page.keyboard.down('Shift'); await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW'); await page.keyboard.up('Shift'); await sleep(300)
    const p2 = await page.evaluate(pos)
    await page.mouse.move(cx + 200, cy, { steps: 10 }); await sleep(200)
    const look = await page.evaluate(() => { const c = window.__cc._camera; const d = c.getWorldDirection(new (c.position.constructor)()); return d.toArray().map((v) => +v.toFixed(3)) })
    await page.keyboard.press('Escape'); await sleep(300)
    const after = await page.evaluate(() => ({ enabled: window.__cc.enabled, locked: Boolean(document.pointerLockElement), pos: window.__cc._camera.position.toArray().map((v) => +v.toFixed(3)), target: window.__cc.getTarget(new (window.__cc._camera.position.constructor)()).toArray().map((v) => +v.toFixed(2)) }))
    const d = (a, b) => +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(3)
    console.log('WALK', JSON.stringify({ locked, ccDisabledWhileWalking: !ccEnabled, walk1sM: d(p0, p1), sprint1sM: d(p1, p2), lookDirAfter200pxRight: look, after }))
    await page.close(); process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { await page?.close() } catch {} ; process.exit(1) })
