// The public viewer's Free / Inside button (owner, 2026-10-13: "the Free/Inside button decides"): from one pose 3 m up looking
// 45 degrees down at the floor, 15 wheel notches in Free must pass under the floor at the same step every notch; in Inside the
// camera must stay above it. NAV_URL=<public viewer url, /<space>/p/<project>> di-test-browser run scripts/nav/probe-public-free.cjs
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
setTimeout(() => { console.log('WATCHDOG'); bye(4) }, 300000)
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc; return true
}
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 60 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await bye(2) }
    await sleep(5000)
    const box = await page.locator('canvas').first().boundingBox()
    const C = [box.x + box.width / 2, box.y + box.height / 2]
    const lockButton = page.locator('button', { hasText: /^(Inside|Free)$/ }).first()
    const setMode = async (want) => { for (let i = 0; i < 3; i++) { const t = (await lockButton.textContent({ timeout: 5000 }).catch(() => null))?.trim(); if (t === want || t == null) return t; await lockButton.click(); await sleep(400) } return (await lockButton.textContent().catch(() => null))?.trim() }
    const run = async (mode) => {
        const shown = await setMode(mode)
        await page.evaluate(() => { window.__cc.setLookAt(-5.2, 3, 12, -5.2, 0, 9, false); window.__cc.update(0) }); await sleep(600)
        await page.mouse.move(...C)
        const ys = [], steps = []
        let last = await page.evaluate(() => window.__cc.camera.position.toArray())
        for (let i = 0; i < 15; i++) {
            await page.mouse.wheel(0, -100); await sleep(250)
            const p = await page.evaluate(() => { window.__cc.update(0); return window.__cc.camera.position.toArray() })
            steps.push(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2])); ys.push(p[1]); last = p
        }
        const fin = steps.filter((v) => v > 1e-4)
        console.log('MODE', JSON.stringify({ asked: mode, button: shown, lowestY: +Math.min(...ys).toFixed(3), finalY: +ys[ys.length - 1].toFixed(3), stepMin: +Math.min(...fin).toFixed(3), stepMax: +Math.max(...fin).toFixed(3), moving: fin.length }))
    }
    await run('Free')
    await run('Inside')
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
