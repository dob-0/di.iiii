// Is a wheel notch the same going in and coming back, and is a move after a scroll the same either way? (owner, 2026-10-13:
// "when you scroll and move it's another speed, when you scroll back and move it's another speed"). Per tool, from one fixed
// pose: 12 notches in, then 12 back, each notch measured after the glide settles; right after each run a 200 px slide and a
// 200 px turn, each from that same pose. NAV_URL=<studio url> [NAV_DY=100] [NAV_TOOLS=Edit,Navigate] [NAV_SETTLE_MS=700]
// di-test-browser run scripts/nav/probe-direction-speed.cjs   Prints one DIR line per tool and a SUMMARY line.
const { chromium } = require('playwright')
const URL = process.env.NAV_URL, DY = Number(process.env.NAV_DY || 100), SETTLE = Number(process.env.NAV_SETTLE_MS || 700)
const TOOLS = (process.env.NAV_TOOLS || 'Edit,Navigate').split(',')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
setTimeout(() => { console.log('WATCHDOG'); bye(4) }, 540000)
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
const POSE = [-5.2, 4, 18, -5.2, 3, -10]
const stats = (a) => { const v = a.filter((x) => Number.isFinite(x)); const mean = v.reduce((s, x) => s + x, 0) / (v.length || 1); return { n: v.length, mean: +mean.toFixed(3), min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3) } }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 60 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await bye(2) }
    await sleep(4000)
    const box = await page.locator('canvas').first().boundingBox()
    const C = [box.x + box.width / 2, box.y + box.height / 2]
    const pos = () => page.evaluate(() => { const c = window.__cc; c.update(0); return c.camera.position.toArray() })
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    const setPose = (p) => page.evaluate((q) => { window.__cc.setLookAt(...q, false); window.__cc.update(0) }, p)
    const getPose = () => page.evaluate(() => { const c = window.__cc; c.update(0); return [...c.getPosition(c.camera.position.clone(), true).toArray(), ...c.getTarget(c.camera.position.clone(), true).toArray()] })
    const drag = async (button, dx, mods = []) => { await page.mouse.move(...C); for (const m of mods) await page.keyboard.down(m); await page.mouse.down({ button }); for (let i = 1; i <= 10; i++) { await page.mouse.move(C[0] + (dx * i) / 10, C[1]); await sleep(25) } await page.mouse.up({ button }); for (const m of mods) await page.keyboard.up(m); await sleep(SETTLE) }
    const summary = {}
    for (const tool of TOOLS) {
        await page.keyboard.press('Escape'); await page.getByRole('button', { name: tool, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(400)
        const slide = tool === 'Edit' ? ['middle', ['Shift']] : ['right', []]
        const turn = tool === 'Edit' ? ['middle', []] : ['left', []]
        await setPose(POSE); await page.mouse.move(...C); await sleep(300)
        const stepsIn = [], stepsOut = []
        let last = await pos()
        for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -DY); await sleep(SETTLE); const p = await pos(); stepsIn.push(dist(p, last)); last = p }
        const afterIn = await getPose()
        await drag(slide[0], 200, slide[1]); const slideAfterIn = dist(await pos(), afterIn.slice(0, 3))
        await setPose(afterIn); await sleep(200); await drag(turn[0], 200, turn[1]); const turnAfterIn = dist(await pos(), afterIn.slice(0, 3))
        await setPose(afterIn); await page.mouse.move(...C); await sleep(300); last = await pos()
        for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, DY); await sleep(SETTLE); const p = await pos(); stepsOut.push(dist(p, last)); last = p }
        const afterOut = await getPose()
        await drag(slide[0], 200, slide[1]); const slideAfterOut = dist(await pos(), afterOut.slice(0, 3))
        await setPose(afterOut); await sleep(200); await drag(turn[0], 200, turn[1]); const turnAfterOut = dist(await pos(), afterOut.slice(0, 3))
        const r = { tool, dy: DY, notchIn: stats(stepsIn), notchOut: stats(stepsOut), stepsIn: stepsIn.map((x) => +x.toFixed(3)), stepsOut: stepsOut.map((x) => +x.toFixed(3)), slideAfterIn: +slideAfterIn.toFixed(3), slideAfterOut: +slideAfterOut.toFixed(3), turnAfterIn: +turnAfterIn.toFixed(3), turnAfterOut: +turnAfterOut.toFixed(3) }
        console.log('DIR', JSON.stringify(r))
        summary[tool] = { outOverIn: +(r.notchOut.mean / r.notchIn.mean).toFixed(3), inSpread: +(r.notchIn.max / r.notchIn.min).toFixed(3), outSpread: +(r.notchOut.max / r.notchOut.min).toFixed(3), slideOutOverIn: +(slideAfterOut / slideAfterIn).toFixed(3), turnOutOverIn: +(turnAfterOut / turnAfterIn).toFixed(3) }
    }
    console.log('SUMMARY', JSON.stringify(summary))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
