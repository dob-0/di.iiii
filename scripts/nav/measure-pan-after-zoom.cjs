// Measures the owner's bug (2026-10-12): "zoom in with the wheel, then right-drag to pan and it is stuck".
// Real mouse events (CDP) on the RTX 3080 via di-test-browser. Usage:
//   NAV_URL=http://navfix.diiii.localhost/moxir/studio/projects/<id> di-test-browser run scripts/nav/measure-pan-after-zoom.cjs
// The camera is read WITHOUT any app hook: the script walks the React fiber tree for the ref that holds
// camera-controls (the one with getPosition), so it also works on a production build (the installed di).
// Optional: NAV_SHOT=/path/file.png (page screenshot after the drag), NAV_NOTCHES=12, NAV_DRAG=240,
// NAV_WHEEL=out (wheel BACK, deltaY +100: the owner's 2026-10-14 "when I zoom back it is impossible to move").
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const NOTCHES = Number(process.env.NAV_NOTCHES || 12)
const DRAG = Number(process.env.NAV_DRAG || 240)
const WHEEL_OUT = process.env.NAV_WHEEL === 'out'
const AXIS = process.env.NAV_AXIS === 'y' ? 'y' : 'x'   // drag right (x) or drag DOWN (y)
const BUTTON = process.env.NAV_BUTTON || 'right'      // right (Sketchfab pan) or middle (Blender orbit; with NAV_SHIFT=1 = pan)
const SHIFT = process.env.NAV_SHIFT === '1'
const TOOL = process.env.NAV_TOOL || 'navigate'
const POINTER = process.env.NAV_POINTER || 'centre'  // centre (fog) | low | high | surface (first screen point whose ray hits geometry, from a grid)       // 'edit' clicks the Edit tool first (Blender mapping)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]
    let cc = null
    while (stack.length && !cc) {
        const f = stack.pop()
        if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) {
            const s = h.memoizedState
            if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break }
        }
        if (f.sibling) stack.push(f.sibling)
        if (f.child) stack.push(f.child)
    }
    if (!cc) return false
    window.__ccForMeasure = cc
    window.__navLog = []
    window.__calls = []; for (const m of ['setLookAt','setPosition','setTarget','moveTo','dollyTo','setOrbitPoint','setFocalOffset','stop','truck','forward','dolly','zoomTo','lerpLookAt','fitToBox','reset']) { const o = cc[m]; if (typeof o === 'function') cc[m] = function (...a) { const st = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/, '').slice(0, 70)); window.__calls.push([performance.now(), m, a.map((v) => typeof v === 'number' ? +v.toFixed(2) : v), st]); return o.apply(this, a) } }
    window.__upd = []; const origUpdate = cc.update.bind(cc); cc.update = (d) => { const r = origUpdate(d); window.__upd.push([performance.now(), +(+d).toFixed(4), r ? 1 : 0]); return r }
    const tick = () => {
        const p = cc._camera.position // the REAL camera; cc.getPosition() returns the END pose by default (camera-controls receiveEndValue=true)
        const tg = cc.getTarget(new (cc._camera.position.constructor)()); window.__navLog.push([performance.now(), p.x, p.y, p.z, cc.distance, +tg.x.toFixed(2), +tg.y.toFixed(2), +tg.z.toFixed(2)])
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__navMark = () => window.__navLog.length
    return true
}
const dist = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3])

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 60000 }).catch(async (e) => {
        console.log('NO CANVAS', page.url(), '|', (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n/g, ' / '))
        if (process.env.NAV_SHOT) await page.screenshot({ path: process.env.NAV_SHOT })
        await page.close(); process.exit(3)
    })
    let ok = false
    for (let i = 0; i < 60 && !ok; i++) { await sleep(1000); ok = await page.evaluate(install) }
    console.log('url', page.url(), 'cameraControls found', ok)
    if (!ok) { console.log('title', await page.title(), '|', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' / ')); await page.close(); process.exit(2) }
    // On a Vite dev tree the preset can be read from the live module (a production build has no such path).
    console.log('mappings module urls', JSON.stringify(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /mappings|useCameraNavigation|StudioViewport/.test(n)))))
    console.log('studioPresetAutoDepth', await page.evaluate(() => import('/studio/navigation/mappings.js').then((m) => m.NAVIGATION_PRESETS.studio.autoDepth).catch(() => 'n/a (production build)')))
    await sleep(3000)
    // A/B of camera-controls easing without a rebuild: NAV_DRAGSMOOTH / NAV_SMOOTH set draggingSmoothTime / smoothTime live.
    if (process.env.NAV_DRAGSMOOTH != null || process.env.NAV_SMOOTH != null) await page.evaluate(([d, s]) => { const cc = window.__ccForMeasure; if (d != null) cc.draggingSmoothTime = +d; if (s != null) cc.smoothTime = +s }, [process.env.NAV_DRAGSMOOTH ?? null, process.env.NAV_SMOOTH ?? null])
    if (process.env.NAV_D2C != null) await page.evaluate((v) => { window.__ccForMeasure.dollyToCursor = v === '1' }, process.env.NAV_D2C)
    if (TOOL === 'edit') { await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await sleep(500) } // let the scene load and settle
    const box = await page.locator('canvas').first().boundingBox()
    const [fx, fy] = (process.env.NAV_AT || '0.5,0.5').split(',').map(Number)
    const cx = box.x + box.width * fx, cy = box.y + box.height * fy
    await page.mouse.move(cx, cy)
    await sleep(400)
    const mark = () => page.evaluate(() => window.__navMark())
    const slice = (from, to) => page.evaluate(([a, b]) => window.__navLog.slice(a, b), [from, to])
    const last = async () => (await page.evaluate(() => window.__navLog[window.__navLog.length - 1]))

    const p0 = await last(); const m0 = await mark()
    const perNotch = []
    for (let i = 0; i < NOTCHES; i++) {
        const a = await last()
        await page.mouse.wheel(0, WHEEL_OUT ? 100 : -100)
        await sleep(150)
        perNotch.push(dist(a, await last()))
    }
    await sleep(600)
    const p1 = await last(); const m1 = await mark()
    await page.evaluate(() => { window.__ctxMenu = null; document.addEventListener('contextmenu', (e) => { window.__ctxMenu = e.defaultPrevented ? 'suppressed' : 'OPENS' }) })
    await page.mouse.move(cx, cy)
    if (SHIFT) await page.keyboard.down('Shift')
    await page.mouse.down({ button: BUTTON })
    const steps = 20
    for (let i = 1; i <= steps; i++) { await page.mouse.move(AXIS === 'x' ? cx + (DRAG * i) / steps : cx, AXIS === 'y' ? cy + (DRAG * i) / steps : cy); await sleep(300 / steps) }
    await page.mouse.up({ button: BUTTON })
    if (SHIFT) await page.keyboard.up('Shift')
    const m2 = await mark()
    await sleep(600)
    const p2 = await last(); const m3 = await mark()
    const seg = await slice(m1, m3)
    let maxJump = 0
    for (let i = 1; i < seg.length; i++) maxJump = Math.max(maxJump, dist(seg[i - 1], seg[i]))
    const zseg = await slice(m0, m1)
    let zmax = 0
    for (let i = 1; i < zseg.length; i++) zmax = Math.max(zmax, dist(zseg[i - 1], zseg[i]))
    const gaps = []; for (let i = 1; i < seg.length; i++) gaps.push(seg[i][0] - seg[i - 1][0])
    const zgaps = []; for (let i = 1; i < zseg.length; i++) zgaps.push(zseg[i][0] - zseg[i - 1][0])
    const stat = (a) => a.length ? { n: a.length, meanMs: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), maxMs: +Math.max(...a).toFixed(1), over33ms: a.filter((g) => g > 33).length } : null
    const upd = await page.evaluate(() => window.__upd || [])
    const zUpd = upd.filter((u) => u[0] >= zseg[0]?.[0] && u[0] <= zseg[zseg.length - 1]?.[0])
    const pUpd = upd.filter((u) => u[0] >= seg[0]?.[0] && u[0] <= seg[seg.length - 1]?.[0])
    const ds = (a) => a.length ? { calls: a.length, moved: a.filter((u) => u[2]).length, deltaMedian: +a.map((u) => u[1]).sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(4), deltaMax: +Math.max(...a.map((u) => u[1])).toFixed(3) } : null
    console.log('UPDATE', JSON.stringify({ zoom: ds(zUpd), pan: ds(pUpd) }))
    if (NOTCHES === 1) { const calls = await page.evaluate(() => window.__calls || []); console.log('CALLS', JSON.stringify(calls.filter((c) => c[0] >= zseg[0][0] - 50 && c[0] <= zseg[0][0] + 400).map((c) => [Math.round(c[0] - zseg[0][0]), c[1], c[2], c[3]]))) }
    if (NOTCHES === 1) console.log('NOTCHTRACE', JSON.stringify(zseg.slice(0, 8).map((r, i) => [Math.round(r[0] - zseg[0][0]), +r[4].toFixed(3), i ? +dist(zseg[i - 1], r).toFixed(3) : 0, 'cam', r.slice(1, 4).map((v) => +v.toFixed(2)), 'tgt', r.slice(5, 8)])))
    const moving = zseg.filter((r, i) => i > 0 && dist(zseg[i - 1], r) > 0.001).length
    console.log('FRAMES', JSON.stringify({ pan: stat(gaps), zoom: stat(zgaps), zoomFramesWithMotion: moving, notches: NOTCHES, framesPerNotch: NOTCHES ? +(moving / NOTCHES).toFixed(1) : null }))
    const f = (n) => n.toFixed(3)
    console.log(JSON.stringify({
        url: page.url(), canvas: [Math.round(box.width), Math.round(box.height)],
        zoomTotalM: +f(dist(p0, p1)), zoomPerNotchM: perNotch.map((v) => +f(v)), zoomMeanPerNotchM: +f(dist(p0, p1) / NOTCHES), zoomMaxFrameJumpM: +f(zmax),
        panNetM: +f(dist(p1, p2)), panMaxFrameJumpM: +f(maxJump), panFrames: seg.length, camBefore: p0.slice(1, 4).map((v) => +f(v)), camAfterZoom: p1.slice(1, 4).map((v) => +f(v)), camAfterPan: p2.slice(1, 4).map((v) => +f(v)), orbitDistanceM: { before: +f(p0[4]), afterZoom: +f(p1[4]), afterPan: +f(p2[4]) },
    }))
    console.log('CONTEXTMENU', await page.evaluate(() => window.__ctxMenu))
    if (process.env.NAV_TRACE) console.log('TRACE', JSON.stringify(await page.evaluate(() => (window.__diNavTrace || []).slice(-6))))
    if (process.env.NAV_SHOT) await page.screenshot({ path: process.env.NAV_SHOT })
    await page.close()
    process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { for (const c of (await chromium.connectOverCDP(process.env.DI_TEST_CDP)).contexts()) for (const pg of c.pages()) if (pg.url() === URL) await pg.close() } catch {} ; process.exit(1) })
