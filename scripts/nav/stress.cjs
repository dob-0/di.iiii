// Stress: 60 s of rapid, mixed input (wheel bursts both ways at random spots, orbit/pan drags, double-clicks, tool switches, walk,
// a resize) with checks after every round: finite camera, finite orbit distance, a stuck detector (5 notches in must move > 1 cm),
// console errors, JS heap, stalls > 33 ms. NAV_URL=<studio url> NAV_SECONDS=60 di-test-browser run scripts/nav/stress.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL, SECONDS = Number(process.env.NAV_SECONDS || 60)
// seeded random (mulberry32) so a run can be repeated: NAV_SEED=<n>; the seed used is printed
const SEED = Number(process.env.NAV_SEED || (Date.now() % 1e9)); let seedState = SEED >>> 0
const random = () => { seedState = (seedState + 0x6D2B79F5) >>> 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child) }
    if (!cc) return false
    window.__cc = cc; window.__gaps = []; let last = null
    window.__upd = 0; cc.addEventListener('update', () => { window.__upd++ })
    const tick = (ts) => { if (last != null) window.__gaps.push(ts - last); last = ts; requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    return true
}
const state = () => { const c = window.__cc; const p = c._camera.position.toArray(); return { pos: p.map((v) => +v.toFixed(2)), finite: p.every(Number.isFinite) && Number.isFinite(c.distance), distance: +c.distance.toFixed(3), endR: +c._sphericalEnd.radius.toFixed(3), far: c._camera.far, updates: window.__upd, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null, stalls: window.__gaps.filter((g) => g > 33).length, frames: window.__gaps.length } }
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
process.on('unhandledRejection', (e) => { console.log('ERR', String(e).slice(0, 200)); bye(3) })
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    const errors = []; page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 120)}`) }); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) }); page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 140)))
    await page.setViewportSize({ width: 1707, height: 960 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await bye(2) }
    await sleep(3000)
    let box = await page.locator('canvas').first().boundingBox()
    const rnd = (a, b) => a + random() * (b - a)
    // a point on the canvas that no panel covers (the Studio's panels float over the view)
    const at = async () => { for (let i = 0; i < 40; i++) { const x = box.x + rnd(0.1, 0.9) * box.width, y = box.y + rnd(0.1, 0.9) * box.height; if (await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [x, y])) return [x, y] } return [box.x + box.width / 2, box.y + box.height / 2] }
    const drag = async (button, dx, dy, ms, mods = []) => { const [x, y] = await at(); for (const k of mods) await page.keyboard.down(k); await page.mouse.move(x, y); await page.mouse.down({ button }); const n = 12; for (let i = 1; i <= n; i++) { await page.mouse.move(x + dx * i / n, y + dy * i / n); await sleep(ms / n) } await page.mouse.up({ button }); for (const k of mods) await page.keyboard.up(k) }
    const wheel = async (n, dir, gap) => { const [x, y] = await at(); await page.mouse.move(x, y); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -100 * dir); await sleep(gap) } }
    const TRACE = process.env.NAV_TRACE === '1', SHOTS = process.env.NAV_SHOTS
    let traceAt = 0
    const mark = async (what, round) => { if (!TRACE) return; const m = await page.evaluate((from) => { const c = window.__cc; const t = c._target ? c._target.toArray() : []; const tr = (window.__diNavTrace || []).slice(from); return { distance: +c.distance.toFixed(3), pos: c._camera.position.toArray().map((v) => +v.toFixed(2)), target: t.map((v) => +v.toFixed(2)), n: (window.__diNavTrace || []).length, trace: tr.slice(-6) } }, traceAt); traceAt = m.n; console.log('ACT', JSON.stringify({ round, what, distance: m.distance, pos: m.pos, target: m.target, trace: m.trace })) }
    const t0 = Date.now(); let round = 0; const stuck = []; const rounds = []; const first = await page.evaluate(state)
    while (Date.now() - t0 < SECONDS * 1000) {
        round++
        const tool = round % 2 ? 'Navigate' : 'Edit'
        await page.keyboard.press('Escape'); await page.getByRole('button', { name: tool, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(100)
        await mark('tool', round); await wheel(20, 1, 25); await mark('wheel-in-20', round); await wheel(20, -1, 25); await mark('wheel-out-20', round)    // a fast burst in, a fast burst out
        await drag(tool === 'Edit' ? 'middle' : 'left', rnd(-400, 400), rnd(-200, 200), 250); await mark('orbit', round)   // orbit
        await drag(tool === 'Edit' ? 'middle' : 'right', rnd(-300, 300), rnd(-200, 200), 250, tool === 'Edit' ? ['Shift'] : []); await mark('pan', round) // pan
        if (tool === 'Navigate') { const [dx, dy] = await at(); await page.mouse.dblclick(dx, dy); await sleep(150); await mark('dblclick', round) } // Edit's double-click is Quick Insert, not navigation
        // stuck detector: 5 notches in at a random spot must move the camera
        const before = await page.evaluate(state); await wheel(5, 1, 60); await sleep(250); const after = await page.evaluate(state)
        const moved = Math.hypot(...before.pos.map((v, i) => v - after.pos[i])); await mark('wheel-in-5', round)
        if (moved < 0.01) stuck.push({ round, tool, distance: before.distance, pos: before.pos, diag: await page.evaluate(() => { const c = window.__cc; return { enabled: c.enabled, infinityDolly: c.infinityDolly, wheel: c.mouseButtons.wheel, locked: Boolean(document.pointerLockElement), active: c.active, trace: (window.__diNavTrace || []).slice(-6).map((e) => [e.action, e.notches, e.hit ? 'hit' : e.fallback ? 'fb' : e.why || '-', e.depth, e.step]) } }), updatesDuring: after.updates - before.updates, endR: after.endR, far: after.far })
        if (round % 3 === 0) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.press('Shift+Backquote'); await sleep(150); await page.keyboard.down('KeyW'); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 }); await sleep(500); await page.keyboard.up('KeyW'); await page.keyboard.press('Escape'); await sleep(150) }
        if (round === 4) { await page.setViewportSize({ width: 1200, height: 700 }); await sleep(600); box = await page.locator('canvas').first().boundingBox() }
        await mark('round-end', round); if (SHOTS) await page.screenshot({ path: `${SHOTS}/round-${round}.png` }).catch(() => {})
        const s = await page.evaluate(state); rounds.push({ round, tool, ...s, moved: +moved.toFixed(2) }); console.log('ROUND', JSON.stringify({ round, tool, distance: s.distance, endR: s.endR, far: s.far, updates: s.updates, moved: +moved.toFixed(2), pos: s.pos }))
        if (!s.finite) break
    }
    const last = rounds[rounds.length - 1]
    console.log('STRESS', JSON.stringify({ seed: SEED, seconds: Math.round((Date.now() - t0) / 1000), rounds: rounds.length, allFinite: rounds.every((r) => r.finite), stuckEvents: stuck.length, stuck: stuck.slice(0, 5), stalls33ms: last?.stalls, frames: last?.frames, heapMB: { first: first.heapMB, last: last?.heapMB }, errors: errors.length, errorSample: errors.slice(0, 4), distances: rounds.map((r) => r.distance) }))
    await bye(0)
})().catch(async (e) => { console.log('ERR', e.message); try { await page?.close() } catch {} ; process.exit(1) })
