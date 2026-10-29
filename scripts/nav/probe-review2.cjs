// The standard move's second review (2026-10-13), checked with real input on the agent screen (the fixes were proven in jsdom
// only). From one fixed pose each time:
//   CHORD  Navigate: a left-button turn, the middle button pressed in the middle of it, 200 px down. camera-controls' own dolly
//          must not run: the turning distance stays (before the fix 27.24 m became 7.56 m), or changes exactly as the same
//          turn without the middle button does (withoutMiddle; a viewer's Inside lock moves the camera by itself).
//   PINCH  Edit, two fingers spread 100 px: one step, the control that touch input reaches the hook at all.
//   TOUCH3 Edit, two fingers down, a third lands, the pair's first finger lifts (its pointerup sent to the page: CDP cannot lift
//          one finger of several), the remaining two move 30 px together: the
//          same slide as two fingers alone moving 30 px (before the fix the old pair's baseline added a 9.3 to 10.8 m jump).
//          30 px, not 1: Chrome holds back touch moves inside its slop region (about 15 px) of a touch's start.
//   LOAD   A fresh page in Edit (an instant move), a wheel notch every 300 ms from the first frame, each read once the camera
//          is still, until five notches after the last model download ended, with every automatic speed the page announced
//          (di:standard-move-speed): every notch after the models are in must be the same step.
//          NAV_COLD=1 first clears this test profile's stored assets and caches for the origin and holds downloads to 3 MB/s,
//          so the models are still in flight when the first notches come; modelsInFlight (read through the dev server's own
//          module, dev builds only) must be false at the end, or a load never reported its end.
// The touch log (touch3.log) marks |lift and |move, so it shows when each finger's pointerup really arrived.
// NAV_URL=<studio or viewer url> [NAV_COLD=1] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-review2.cjs
// One REVIEW2 line.
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
if (!URL) { console.log('NAV_URL is required'); process.exit(2) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
setTimeout(() => { console.log('WATCHDOG'); bye(4) }, 420000)
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
const POSE = [-5.2, 3, 12, -5.2, 2.5, -10]
const MODEL = /\.(glb|gltf|fbx|obj|stl)(\?|$)|\/assets\/[^/]+\/(blob|file|raw)|\/api\/.*assets?\//i
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    const out = {}
    // LOAD first, on the fresh page: count model downloads in flight from the first request
    let inFlight = 0, lastEnd = 0; const seen = new Set()
    page.on('request', (r) => { if (MODEL.test(r.url())) { inFlight++; seen.add(r) } })
    const done = (r) => { if (seen.delete(r)) { inFlight--; lastEnd = Date.now() } }
    page.on('requestfinished', done); page.on('requestfailed', done)
    const cdp = await page.context().newCDPSession(page)
    if (process.env.NAV_COLD === '1') {
        await cdp.send('Storage.clearDataForOrigin', { origin: new globalThis.URL(URL).origin, storageTypes: 'indexeddb,cache_storage,service_workers' })
        await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 3e6, uploadThroughput: -1 })
    }
    await page.addInitScript(() => { try { performance.setResourceTimingBufferSize(20000) } catch {} window.__speeds = []; window.addEventListener('di:standard-move-speed', (e) => window.__speeds.push([Math.round(performance.now()), JSON.stringify(e.detail)])) })
    const t0 = Date.now()
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 80 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(250) }
    if (!ok) { console.log('no cc'); await bye(2) }
    const box = await page.locator('canvas').first().boundingBox()
    const C = [box.x + box.width / 2, box.y + box.height / 2]
    const pose = () => page.evaluate((p) => { window.__cc.setLookAt(...p, false); window.__cc.update(0) }, POSE)
    const cam = () => page.evaluate(() => { const c = window.__cc; c.update(0); const p = c.camera.position; return { p: [p.x, p.y, p.z], dist: c.distance } })
    const moved = (a, b) => Math.hypot(...a.p.map((v, i) => v - b.p[i]))
    const still = async () => { let prev = await cam(); for (let k = 0; k < 50; k++) { await sleep(50); const c = await cam(); if (moved(prev, c) < 1e-4) return c; prev = c } return prev }
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 15000 }).catch(() => {})
    const steps = []; let after = 0
    for (let i = 0; i < 120 && after < 5; i++) {
        await pose(); await page.mouse.move(...C); const a = await cam()
        await page.mouse.wheel(0, -100); await sleep(300); const settledCam = await still()
        const loading = inFlight > 0 || seen.size > 0
        steps.push({ t: Date.now() - t0, step: +moved(a, settledCam).toFixed(3), loading })
        if (!loading && Date.now() - lastEnd > 1500) after++
    }
    const settled = steps.filter((s) => !s.loading).slice(-5).map((s) => s.step)
    out.load = { models: seen.size + 0, notches: steps.length, firstNotches: steps.slice(0, 4).map((s) => s.step), last5: settled,
        last5Spread: settled.length ? +(Math.max(...settled) - Math.min(...settled)).toFixed(4) : null,
        lastModelEndedAtMs: lastEnd ? lastEnd - t0 : null, firstNotchAtMs: steps[0]?.t ?? null,
        speeds: (await page.evaluate(() => window.__speeds)).slice(-6),
        modelsInFlight: await page.evaluate(async () => { const seen = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/objectComponents/modelLoads.js')); for (const u of [seen, '/objectComponents/modelLoads.js', '/src/objectComponents/modelLoads.js'].filter(Boolean)) { try { return (await import(u)).modelsLoading() } catch { /* next */ } } return 'n/a: module not reachable (a production build?)' }) }
    if (process.env.NAV_COLD === '1') { await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }) }
    await sleep(1500)
    // CHORD in Navigate
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Navigate', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300)
    // control: the same turn without the middle button (a viewer's Inside lock may change the distance by itself)
    await pose(); await page.mouse.move(...C); await sleep(100)
    await page.mouse.down({ button: 'left' }); await page.mouse.move(C[0] + 60, C[1], { steps: 6 }); await sleep(150)
    const ctlBefore = await cam(); await page.mouse.move(C[0] + 60, C[1] + 200, { steps: 20 }); await sleep(200)
    const ctlAfter = await cam(); await page.mouse.up({ button: 'left' }); await sleep(500)
    await pose(); await page.mouse.move(...C); await sleep(100)
    await page.mouse.down({ button: 'left' }); await page.mouse.move(C[0] + 60, C[1], { steps: 6 }); await sleep(150)
    const before = await cam()
    await page.mouse.down({ button: 'middle' }); await page.mouse.move(C[0] + 60, C[1] + 200, { steps: 20 }); await sleep(200)
    const during = await cam()
    await page.mouse.up({ button: 'middle' }); await page.mouse.up({ button: 'left' }); await sleep(500)
    out.chord = { distBefore: +before.dist.toFixed(3), distAfter: +during.dist.toFixed(3), withoutMiddle: [+ctlBefore.dist.toFixed(3), +ctlAfter.dist.toFixed(3)] }
    // touch, in Edit
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) })
    const [x, y] = C
    await pose(); await sleep(100); let a = await cam()
    await touch('touchStart', [[x - 80, y, 1]]); await touch('touchStart', [[x - 80, y, 1], [x + 80, y, 2]])
    for (let k = 1; k <= 10; k++) await touch('touchMove', [[x - 80 - 5 * k, y, 1], [x + 80 + 5 * k, y, 2]]) // 100 px wider
    await touch('touchEnd', []); await sleep(700)
    out.pinch = +moved(a, await cam()).toFixed(3)
    // control: two fingers alone move 30 px together
    await pose(); await sleep(100)
    await touch('touchStart', [[x - 80, y, 1]]); await touch('touchStart', [[x - 80, y, 1], [x + 80, y, 2]]); await sleep(100)
    a = await cam()
    for (let k = 1; k <= 6; k++) await touch('touchMove', [[x - 80 + 5 * k, y, 1], [x + 80 + 5 * k, y, 2]])
    await sleep(600); const control = moved(a, await cam())
    await touch('touchEnd', []); await sleep(300)
    // the case: a third finger lands, the pair's first lifts, the remaining two move 30 px together
    await page.evaluate(() => { window.__ptr = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'pointermove']) window.addEventListener(t, (e) => { if (e.pointerType !== 'touch') return; const k = t.slice(7) + e.pointerId; if (t === 'pointermove' && window.__ptr[window.__ptr.length - 1] === k) return; window.__ptr.push(k) }, true) })
    await pose(); await sleep(100)
    await touch('touchStart', [[x - 80, y, 1]]); await touch('touchStart', [[x - 80, y, 1], [x + 80, y, 2]]); await sleep(100)
    a = await cam()
    await touch('touchStart', [[x - 80, y, 1], [x + 80, y, 2], [x, y + 120, 3]]); await sleep(50)
    await page.evaluate(() => window.__ptr.push('|lift'))
    // CDP cannot lift one finger of several (a touchMove without it keeps it down, touchEnd lifts all: seen 10-14), so the
    // pair's first finger's pointerup is sent to the canvas as the browser sends it; the other fingers' moves stay real.
    await page.evaluate(([px, py]) => {
        const id = Number((window.__ptr.find((k) => /^down\d+$/.test(k)) || '').slice(4))
        const el = document.querySelector('canvas')
        el.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true, cancelable: true, composed: true, button: 0, buttons: 0 }))
    }, [x - 80, y]); await sleep(100) // finger 1 lifts
    const b = await cam()
    await page.evaluate(() => window.__ptr.push('|move'))
    for (let k = 1; k <= 6; k++) await touch('touchMove', [[x + 80 + 5 * k, y, 2], [x + 5 * k, y + 120, 3]])
    await sleep(600); const c = await cam()
    await page.evaluate(() => window.__ptr.push('|end'))
    await touch('touchEnd', []); await sleep(300)
    out.touch3 = { control30px: +control.toFixed(3), onLift: +moved(a, b).toFixed(3), on30px: +moved(b, c).toFixed(3), log: (await page.evaluate(() => window.__ptr)).join(' ') }
    console.log('REVIEW2', JSON.stringify(out))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
