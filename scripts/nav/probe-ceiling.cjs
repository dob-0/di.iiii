const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child) }
    if (!cc) return false
    window.__cc = cc; return true
}
const state = () => { const c = window.__cc; return { pos: c._camera.position.toArray().map((v) => +v.toFixed(2)), distance: +c.distance.toFixed(3), endR: +c._sphericalEnd.radius.toFixed(3), curR: +c._spherical.radius.toFixed(3), max: c.maxDistance, far: c._camera.far, active: c.active, trace: (window.__diNavTrace || []).slice(-3).map((e) => ({ a: e.action, n: e.notches, depth: e.depth, step: e.step, rem: e.remembered, hit: !!e.hit })) } }
let page
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    try {
        await page.setViewportSize({ width: 1707, height: 960 }).catch(() => {})
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForSelector('canvas', { timeout: 60000 })
        let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
        if (!ok) { console.log('no cc'); return }
        await sleep(3000)
        const box = await page.locator('canvas').first().boundingBox()
        const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5
        await page.mouse.move(cx, cy)
        const out = []
        out.push(['start', await page.evaluate(state)])
        for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 100); await sleep(25) }
        await sleep(800); out.push(['after 60 out', await page.evaluate(state)])
        for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(60) }
        await sleep(250); out.push(['after 5 in (250ms)', await page.evaluate(state)])
        await sleep(1000); out.push(['after 5 in (1250ms)', await page.evaluate(state)])
        for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, -100); await sleep(60) }
        await sleep(800); out.push(['after 20 more in', await page.evaluate(state)])
        for (const [k, v] of out) console.log(k, JSON.stringify(v))
    } finally { await page.goto('about:blank').catch(() => {}); await page.close().catch(() => {}); process.exit(0) }
})()
