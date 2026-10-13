// The owner, 2026-10-13: "it gets stuck at some objects when I move, then goes, gets stuck, and jumps". Two measurements:
// 1. WHAT THE PICK HITS: a 12x7 grid over the canvas from the opening view and two others; for each point the first mesh the
//    Auto Depth ray hits, with its material (transparent, opacity, depthWrite, blending) and its parent chain — a hit on a
//    see-through mesh (a beam cone, a glow) puts the orbit point somewhere the eye sees nothing.
// 2. WHAT A HUMAN'S MOVES DO: drags and scrolls across the stage in both tools, the camera's step per frame, the orbit
//    distance at every gesture start, and each jump (a frame step > 6x the median of its gesture) with the pick behind it.
// NAV_URL=<studio url> NAV_SHOTS=<dir> di-test-browser run scripts/nav/probe-stick-jump.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL, SHOTS = process.env.NAV_SHOTS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc; window.__frames = []; let last = cc._camera.position.clone()
    const tick = () => { const p = cc._camera.position; window.__frames.push([+p.distanceTo(last).toFixed(4), +cc.distance.toFixed(3)]); last = p.clone(); requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    return true
}
// raycast in the page with the app's own three (the module the page loaded), over the scene the nav hook saw
const pickGrid = async (page) => page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n))
    const THREE = await import(url)
    const scene = window.__diNavScene; const cam = window.__cc.camera
    if (!scene) return { error: 'no scene yet' }
    const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o) })
    const ray = new THREE.Raycaster(); const out = []
    const chain = (o) => { const n = []; for (let p = o; p && n.length < 4; p = p.parent) n.push(p.name || p.type); return n.join(' < ') }
    for (let iy = 0; iy < 7; iy++) for (let ix = 0; ix < 12; ix++) {
        const ndc = new THREE.Vector2(-0.92 + ix * (1.84 / 11), 0.85 - iy * (1.7 / 6))
        ray.setFromCamera(ndc, cam)
        const hits = ray.intersectObjects(meshes, false).filter((h) => { for (let p = h.object; p; p = p.parent) if (!p.visible) return false; return true })
        if (!hits.length) { out.push({ ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2)], miss: true }); continue }
        const h = hits[0]; const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
        out.push({ ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2)], d: +h.distance.toFixed(2), name: chain(h.object), geo: h.object.geometry?.type, mat: m?.type, transparent: !!m?.transparent, opacity: m?.opacity, depthWrite: m?.depthWrite, blending: m?.blending, colorWrite: m?.colorWrite, side: m?.side, opaqueBehind: hits.find((x) => { const mm = Array.isArray(x.object.material) ? x.object.material[0] : x.object.material; return !mm?.transparent && mm?.colorWrite !== false })?.distance?.toFixed(2) ?? null })
    }
    return out
})
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
process.on('unhandledRejection', (e) => { console.log('ERR', String(e).slice(0, 200)); bye(3) })
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await bye(2) }
    await sleep(3000)
    const box = await page.locator('canvas').first().boundingBox()
    const P = (fx, fy) => [box.x + fx * box.width, box.y + fy * box.height]
    const free = async (fx, fy) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', P(fx, fy))
    const tool = async (name) => { await page.keyboard.press('Escape'); await page.getByRole('button', { name, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(200) }
    const gestures = []
    const gesture = async (label, fn) => {
        await page.evaluate(() => { window.__frames = []; window.__diNavTrace = [] })
        const d0 = await page.evaluate(() => window.__cc.distance)
        await fn(); await sleep(700)
        const fr = await page.evaluate(() => window.__frames); const tr = await page.evaluate(() => (window.__diNavTrace || []).slice(-12))
        const steps = fr.map((f) => f[0]).filter((s) => s > 1e-4); const sorted = [...steps].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 0
        const jumps = fr.map((f, i) => ({ i, s: f[0], dist: f[1] })).filter((f) => med && f.s > 6 * med && f.s > 0.05)
        const top = fr.map((f, i) => [i, f[0], f[1]]).sort((a, b) => b[1] - a[1]).slice(0, 3)
        const g = { label, top, traceAll: steps.length < 3 ? tr.slice(-5) : undefined, distStart: +d0.toFixed(3), distEnd: fr.length ? fr[fr.length - 1][1] : null, moving: steps.length, med: +med.toFixed(4), max: steps.length ? Math.max(...steps) : 0, jumps: jumps.slice(0, 4), picks: tr.filter((t) => t.gestureStart || t.action === 'wheel').map((t) => ({ a: t.action, hit: t.hit, kept: t.kept, dist: t.distance, step: t.step })).slice(0, 6) }
        gestures.push(g); console.log('GESTURE', JSON.stringify(g))
    }
    const drag = async (button, from, to, mods = [], ms = 500) => { for (const k of mods) await page.keyboard.down(k); await page.mouse.move(...from); await page.mouse.down({ button }); const n = 20; for (let i = 1; i <= n; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n); await sleep(ms / n) } await page.mouse.up({ button }); for (const k of mods) await page.keyboard.up(k) }
    const scroll = async (at, n, dir) => { await page.mouse.move(...at); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -100 * dir); await sleep(70) } }
    // a first tiny drag so the nav hook hands its scene to the probe
    await tool('Edit'); await drag('middle', P(0.5, 0.5), P(0.505, 0.5), [], 100); await sleep(500)
    const grid = await pickGrid(page)
    if (grid.error) { console.log('GRID', grid.error) } else {
        const hits = grid.filter((g) => !g.miss); const see = hits.filter((g) => g.transparent || g.colorWrite === false || (g.opacity ?? 1) < 0.99 || g.depthWrite === false)
        console.log('GRID', JSON.stringify({ points: grid.length, hits: hits.length, misses: grid.length - hits.length, seeThroughHits: see.length }))
        const byName = {}; for (const g of see) byName[g.name] = (byName[g.name] || 0) + 1
        console.log('SEE-THROUGH', JSON.stringify(byName))
        for (const g of see.slice(0, 6)) console.log('SEE', JSON.stringify(g))
        const near = hits.filter((g) => g.d < 1.5).slice(0, 4); for (const g of near) console.log('NEAR', JSON.stringify(g))
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/stick-start.png` })
    // a human's moves over the stage, Edit (Blender) then Navigate (Sketchfab)
    await tool('Edit')
    await gesture('edit orbit across the stage', () => drag('middle', P(0.4, 0.55), P(0.65, 0.5)))
    await gesture('edit pan across the stage', () => drag('middle', P(0.6, 0.5), P(0.35, 0.6), ['Shift']))
    await gesture('edit scroll in 12 over the rig', () => scroll(P(0.5, 0.35), 12, 1))
    await gesture('edit orbit after scroll', () => drag('middle', P(0.45, 0.4), P(0.6, 0.45)))
    await gesture('edit pan after scroll', () => drag('middle', P(0.5, 0.4), P(0.3, 0.45), ['Shift']))
    await gesture('edit scroll out 12', () => scroll(P(0.5, 0.5), 12, -1))
    await tool('Navigate')
    await gesture('nav orbit across the stage', () => drag('left', P(0.4, 0.55), P(0.65, 0.5)))
    console.log('AT', JSON.stringify(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { tag: e?.tagName, cls: String(e?.className || '').slice(0, 80), id: e?.id } }, P(0.6, 0.5))))
    await gesture('nav pan across the stage', () => drag('right', P(0.6, 0.5), P(0.35, 0.6)))
    await gesture('nav scroll in 12 over the rig', () => scroll(P(0.5, 0.35), 12, 1))
    await gesture('nav scroll in 12 sweeping across', async () => { for (let i = 0; i < 12; i++) { await page.mouse.move(...P(0.3 + i * 0.035, 0.4)); await page.mouse.wheel(0, -100); await sleep(70) } })
    await gesture('nav pan after scroll', () => drag('right', P(0.5, 0.45), P(0.3, 0.5)))
    await gesture('nav orbit after scroll', () => drag('left', P(0.45, 0.45), P(0.6, 0.5)))
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/stick-end.png` })
    const bad = gestures.filter((g) => g.jumps.length || (g.distEnd != null && g.distEnd < 0.5))
    console.log('SUMMARY', JSON.stringify({ gestures: gestures.length, withJumps: gestures.filter((g) => g.jumps.length).length, endedClose: gestures.filter((g) => g.distEnd != null && g.distEnd < 0.5).length, bad: bad.map((g) => g.label) }))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
