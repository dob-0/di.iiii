// Navigate: double-click the floor, then scroll — the per-frame camera steps of the first notches, with the wheel arriving
// while the focus is still easing (150 ms) and after it settled (800 ms). Walkthrough 2026-10-13 saw one 0.95 m frame there.
// NAV_URL=<studio url> di-test-browser run scripts/nav/probe-focus-scroll.cjs
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc; window.__steps = []; let last = cc._camera.position.clone()
    const tick = () => { const p = cc._camera.position; window.__steps.push(+p.distanceTo(last).toFixed(3)); last = p.clone(); requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    return true
}
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    for (const wait of [150, 800]) {
        await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForSelector('canvas', { timeout: 60000 })
        let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
        if (!ok) { console.log('no cc'); await bye(2) }
        await sleep(3000)
        await page.getByRole('button', { name: 'Navigate', exact: true }).first().click({ timeout: 5000 }).catch(() => {})
        await sleep(300)
        const box = await page.locator('canvas').first().boundingBox()
        const floor = [box.x + box.width * 0.5, box.y + box.height * 0.8]
        const dist = () => page.evaluate(() => +window.__cc.distance.toFixed(3))
        const d0 = await dist()
        await page.evaluate(() => { window.__diNavTrace = [] })
        await page.mouse.move(...floor); await page.mouse.dblclick(...floor); await sleep(wait)
        const d1 = await dist()
        await page.evaluate(() => { window.__steps = [] })
        for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(60) }
        await sleep(600)
        const steps = await page.evaluate(() => window.__steps.filter((s) => s > 0))
        const trace = await page.evaluate(() => (window.__diNavTrace || []).filter((t) => t.action === 'focus' || t.action === 'wheel').map((t) => [t.action, t.hit ? 'hit' : 'miss', t.distance ?? null, t.step ?? null]))
        const sorted = [...steps].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 0
        console.log('FOCUS-SCROLL', JSON.stringify({ waitMs: wait, distanceBefore: d0, afterFocus: d1, afterScroll: await dist(), frames: steps.length, maxStepM: Math.max(...steps), medStepM: med, jerk: med ? +(Math.max(...steps) / med).toFixed(1) : null, first10: steps.slice(0, 10), trace }))
    }
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
