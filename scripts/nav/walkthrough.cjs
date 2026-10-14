// A human's journey through the Studio with real input on the agent screen, judged step by step: what moved, how evenly
// (max per-frame step / median step, stalls > 33 ms), what the console said, and a screenshot after every step.
// NAV_URL=<studio url> NAV_SHOTS=<dir> di-test-browser run scripts/nav/walkthrough.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL, SHOTS = process.env.NAV_SHOTS || '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child) }
    if (!cc) return false
    window.__cc = cc; window.__log = []
    const tick = (ts) => { const p = cc._camera.position; window.__log.push([ts, p.x, p.y, p.z]); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    window.__ctx = []; document.addEventListener('contextmenu', (e) => window.__ctx.push(e.defaultPrevented), true)
    return true
}
const d3 = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3])
let page
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) }); page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 160)))
    await page.setViewportSize({ width: 1707, height: 960 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await page.close(); process.exit(2) }
    await sleep(4000)
    const box = await page.locator('canvas').first().boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    const steps = []
    const mark = () => page.evaluate(() => window.__log.length)
    const judge = async (name, m0) => {
        await sleep(500)
        const seg = await page.evaluate((m) => window.__log.slice(m), m0)
        const steps_ = []; const gaps = []
        for (let i = 1; i < seg.length; i++) { steps_.push(d3(seg[i - 1], seg[i])); gaps.push(seg[i][0] - seg[i - 1][0]) }
        const moving = steps_.filter((s) => s > 0.0005).sort((a, b) => a - b)
        const med = moving.length ? moving[Math.floor(moving.length / 2)] : 0
        const max = moving.length ? moving[moving.length - 1] : 0
        const r = { step: name, netM: +d3(seg[0], seg[seg.length - 1]).toFixed(2), framesMoving: moving.length, medStepM: +med.toFixed(3), maxStepM: +max.toFixed(3), jerk: med ? +(max / med).toFixed(1) : null, stalls33ms: gaps.filter((g) => g > 33).length }
        steps.push(r); console.log('STEP', JSON.stringify(r))
        await page.screenshot({ path: `${SHOTS}/${String(steps.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png` })
    }
    const drag = async (button, dx, dy, ms = 500, mods = []) => { for (const k of mods) await page.keyboard.down(k); await page.mouse.move(cx, cy); await page.mouse.down({ button }); const n = 30; for (let i = 1; i <= n; i++) { await page.mouse.move(cx + dx * i / n, cy + dy * i / n); await sleep(ms / n) } await page.mouse.up({ button }); for (const k of mods) await page.keyboard.up(k) }
    const wheel = async (n, gapMs = 120, at = [cx, cy]) => { await page.mouse.move(at[0], at[1]); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -100); await sleep(gapMs) } }
    await page.screenshot({ path: `${SHOTS}/00-start.png` })
    let m = await mark(); await drag('left', 300, 0); await judge('navigate orbit 300px', m)
    m = await mark(); await wheel(10); await judge('navigate scroll 10 at centre', m)
    m = await mark(); await drag('right', 300, 0); await judge('navigate pan right 300px', m)
    await page.evaluate(() => { const cc = window.__cc; window.__calls = []; const P = () => cc._camera.position.toArray().map((v) => +v.toFixed(2)); const S = () => ({ r: +cc._spherical.radius.toFixed(2), rEnd: +cc._sphericalEnd.radius.toFixed(2), t: cc._target.toArray().map((v) => +v.toFixed(1)), tEnd: cc._targetEnd.toArray().map((v) => +v.toFixed(1)), f: cc._focalOffset.toArray().map((v) => +v.toFixed(2)), fEnd: cc._focalOffsetEnd.toArray().map((v) => +v.toFixed(2)), cam: P(), phi: +cc._spherical.phi.toFixed(3), phiEnd: +cc._sphericalEnd.phi.toFixed(3) }); window.__state = S; for (const m of ['stop', 'setOrbitPoint', 'setLookAt', 'update', 'dollyTo', 'moveTo', 'setFocalOffset']) { const o = cc[m]; cc[m] = function (...a) { const before = P(); const r = o.apply(this, a); const after = P(); const moved = +Math.hypot(...before.map((v, i) => v - after[i])).toFixed(2); if (m !== 'update' || moved > 0.5) window.__calls.push([Math.round(performance.now()), m, m === 'update' ? +(+a[0]).toFixed(3) : a.map((v) => typeof v === 'number' ? +v.toFixed(1) : v), moved, m === 'update' && moved > 0.5 ? { before: window.__stateBefore, after: window.__state() } : undefined]); return r }; if (m === 'update') { const w = cc.update; cc.update = function (...a) { window.__stateBefore = window.__state(); return w.apply(this, a) } } } })
    m = await mark(); await wheel(15, 120, [cx, cy + box.height * 0.38]); await judge('navigate scroll 15 at the floor', m)
    console.log('FLOOR-CALLS', JSON.stringify(await page.evaluate(() => window.__calls.slice(0, 14))))
    console.log('FLOOR-DETAIL', JSON.stringify(await page.evaluate((m) => { const seg = window.__log.slice(m); const steps = []; for (let i = 1; i < seg.length; i++) { const s = Math.hypot(seg[i][1] - seg[i - 1][1], seg[i][2] - seg[i - 1][2], seg[i][3] - seg[i - 1][3]); if (s > 0.0005) steps.push(+s.toFixed(2)) } return { steps: steps.slice(0, 60), trace: (window.__diNavTrace || []).slice(-8).map((e) => [e.action, e.hit ? 'hit' : e.fallback ? 'fb' : e.why || '-', e.remembered, e.distance]), cam: window.__cc._camera.position.toArray().map((v) => +v.toFixed(1)), dist: +window.__cc.distance.toFixed(2) } }, m)))
    m = await mark(); await drag('right', 0, 200); await judge('navigate pan down 200px', m)
    await page.mouse.move(cx, cy); await page.mouse.click(cx, cy, { button: 'right' }); await sleep(300)
    const ctx = await page.evaluate(() => window.__ctx)
    await page.screenshot({ path: `${SHOTS}/06a-after-right-click.png` }); await page.keyboard.press('Escape'); await sleep(300)
    m = await mark(); await page.mouse.dblclick(cx, cy + box.height * 0.38); await sleep(400); await wheel(5); await judge('navigate double-click floor then scroll 5', m)
    await page.keyboard.press('Escape'); await sleep(200)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 10000 }); await sleep(500)
    m = await mark(); await drag('middle', 300, 0); await judge('edit middle orbit 300px', m)
    m = await mark(); await drag('middle', 200, 0, 500, ['Shift']); await judge('edit shift+middle pan 200px', m)
    m = await mark(); await drag('middle', 0, 200, 500, ['Control']); await judge('edit ctrl+middle zoom 200px', m)
    m = await mark(); await wheel(8); await judge('edit scroll 8', m)
    await page.mouse.click(cx, cy); await page.keyboard.press('Shift+Backquote'); await sleep(300)
    m = await mark(); await page.keyboard.down('KeyW'); await page.mouse.move(cx + 150, cy, { steps: 15 }); await sleep(1500); await page.keyboard.up('KeyW'); await judge('walk W 1.5s with a look right', m)
    await page.keyboard.press('Escape'); await sleep(300)
    m = await mark(); await drag('middle', -300, 0); await judge('edit orbit after the walk', m)
    console.log('CONTEXTMENU', JSON.stringify(ctx), 'ERRORS', JSON.stringify(errors.slice(0, 6)))
    await page.close(); process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { await page?.close() } catch {} ; process.exit(1) })
