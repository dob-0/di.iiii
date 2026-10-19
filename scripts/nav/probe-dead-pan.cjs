// Dead Navigate pan after an orbit (regression check, 2026-10-13): is a right-drag pan right after a left-drag orbit dead because the
// orbit's release selected an object (the Inspector opens over the view and takes the pan's pointerdown)?
// Three arms from ONE camera pose (the pose a fixed Edit sequence leaves), seeded random order, NAV_N runs each:
//   A orbit      left-drag 40%/55% -> SPOT (20 steps, 500 ms), 800 ms, right-drag pan 60%/50% -> 35%/60%
//   B orbit+esc  the same orbit, Escape (clears the selection in StudioEditor), then the same pan
//   C click      a plain left click at SPOT (no drag), 800 ms, the same pan
// Per run: Inspector buttons before/after, what covers the pan start, the pan's pointerdown target, the nav trace, the camera move.
// Before the fix: A dead + selection, B alive, C dead. After the fix (a drag release does not select): A alive, no selection; C still selects
// (click-select kept). SPOT (NAV_SPOT=<x>,<y> as fractions of the canvas, default 0.65,0.5) must lie over a solid object of the scene: the
// CONTROL line says whether a plain click selected there; if it did not, this scene cannot show the selection and the arms prove nothing.
// Example: the Studio project moxir-v1-1 from its opening view needs NAV_SPOT=0.5,0.62 (a plain click selects there; 0.65,0.5 hits nothing:
// measured 2026-10-14).
// "Dead" = the pan moved the camera less than NAV_DEAD_M (default 0.02 m). Rows go to NAV_OUT (a directory, default the system temp dir).
// NAV_URL=<studio url> [NAV_N=10] [NAV_SEED=7] [NAV_SPOT=0.65,0.5] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-dead-pan.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const URL = process.env.NAV_URL
if (!URL) { console.log('usage: NAV_URL=<studio url> [NAV_N=10] [NAV_SEED=7] [NAV_SPOT=0.65,0.5] [NAV_DEAD_M=0.02] [NAV_OUT=<dir>] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-dead-pan.cjs'); process.exit(2) }
const N = +(process.env.NAV_N || 10), SEED = +(process.env.NAV_SEED || 7)
const OUT_DIR = process.env.NAV_OUT || os.tmpdir(), OUT = path.join(OUT_DIR, `nav-dead-pan-${SEED}.jsonl`)
const SPOT = (process.env.NAV_SPOT || '0.65,0.5').split(',').map(Number)
if (SPOT.length !== 2 || !SPOT.every((v) => v > 0 && v < 1)) { console.log('ERR NAV_SPOT wants x,y as fractions of the canvas, e.g. 0.65,0.5'); process.exit(2) }
const DEAD_M = +(process.env.NAV_DEAD_M || 0.02)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + what)), ms))])
let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
let page
const bye = async (code) => { try { await T(page.goto('about:blank'), 10000, 'blank') } catch {} try { await T(page.close(), 5000, 'close') } catch {} process.exit(code) }
setTimeout(() => { console.log('WATCHDOG fired'); bye(4) }, +(process.env.NAV_LIMIT || 540000))
process.on('unhandledRejection', (e) => { console.log('ERR', String(e).slice(0, 200)); bye(3) })
const initLog = () => {
    window.__vLog = []
    window.addEventListener('pointerdown', (e) => { const t = e.target; window.__vLog.push({ t: performance.now(), b: e.button, tg: (t?.tagName || '?') + (typeof t?.className === 'string' && t.className ? '.' + t.className.split(' ')[0] : '') }) }, true)
}
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const st = h.memoizedState; if (st && typeof st === 'object' && st.current && typeof st.current.getPosition === 'function') { cc = st.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    if (window.__cc === cc) return true
    window.__cc = cc; window.__vFrames = []; const last = cc._camera.position.clone()
    const tick = () => { const p = window.__cc._camera.position; window.__vFrames.push([performance.now(), p.distanceTo(last)]); last.copy(p); if (window.__vFrames.length > 4000) window.__vFrames.splice(0, 2000); requestAnimationFrame(tick) }
    requestAnimationFrame(tick); return true
}
;(async () => {
    const browser = await T(chromium.connectOverCDP(process.env.DI_TEST_CDP), 20000, 'connect')
    page = await T(browser.contexts()[0].newPage(), 10000, 'newPage')
    await page.addInitScript(initLog)
    await T(page.setViewportSize({ width: 1707, height: 960 }), 10000, 'viewport')
    await T(page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 }), 95000, 'goto')
    await T(page.waitForSelector('canvas', { timeout: 60000 }), 65000, 'canvas')
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await T(page.evaluate(install), 5000, 'install'); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); return bye(2) }
    await sleep(3000)
    const ev = (fn, arg) => T(page.evaluate(fn, arg), 8000, 'evaluate')
    const box = await T(page.locator('canvas').first().boundingBox(), 8000, 'box')
    const P = (fx, fy) => [box.x + fx * box.width, box.y + fy * box.height]
    const tool = async (name) => { await T(page.keyboard.press('Escape'), 5000, 'esc'); await page.getByRole('button', { name, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(200) }
    const drag = async (button, from, to, mods = [], ms = 500) => { for (const k of mods) await T(page.keyboard.down(k), 5000, 'kd'); await T(page.mouse.move(...from), 5000, 'mv'); await T(page.mouse.down({ button }), 5000, 'down'); for (let i = 1; i <= 20; i++) { await T(page.mouse.move(from[0] + (to[0] - from[0]) * i / 20, from[1] + (to[1] - from[1]) * i / 20), 5000, 'mv'); await sleep(ms / 20) } await T(page.mouse.up({ button }), 5000, 'up'); for (const k of mods) await T(page.keyboard.up(k), 5000, 'ku') }
    const scroll = async (at, n, dir) => { await T(page.mouse.move(...at), 5000, 'mv'); for (let i = 0; i < n; i++) { await T(page.mouse.wheel(0, -100 * dir), 5000, 'wheel'); await sleep(70) } }
    // the lead's Edit sequence once (probe-stick-jump.cjs), then Navigate; that pose is every run's start
    await tool('Edit')
    await drag('middle', P(0.4, 0.55), P(0.65, 0.5)); await sleep(800); await drag('middle', P(0.6, 0.5), P(0.35, 0.6), ['Shift']); await sleep(800)
    await scroll(P(0.5, 0.35), 12, 1); await sleep(800); await drag('middle', P(0.45, 0.4), P(0.6, 0.45)); await sleep(800)
    await drag('middle', P(0.5, 0.4), P(0.3, 0.45), ['Shift']); await sleep(800); await scroll(P(0.5, 0.5), 12, -1); await sleep(800)
    await tool('Navigate')
    const pose = await ev(() => { const c = window.__cc; return [...c.getPosition().toArray(), ...c.getTarget().toArray()] })
    const look = (pt) => ev(([x, y]) => { const el = document.elementFromPoint(x, y); const ins = [...document.querySelectorAll('.insp-section-btn')]; let p = ins[ins.length - 1]; for (let k = 0; p && k < 8 && !/panel|floating/i.test(String(p.className)); k++) p = p.parentElement
        return { cover: el ? el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') : null, ins: ins.length, panel: p ? (p.innerText || '').replace(/\s+/g, ' ').slice(0, 50) : null } }, pt)
    const arms = []; for (let i = 0; i < N; i++) arms.push('A', 'B', 'C')
    for (let i = arms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arms[i], arms[j]] = [arms[j], arms[i]] }
    fs.mkdirSync(OUT_DIR, { recursive: true }); const out = fs.openSync(OUT, 'w'); const rows = []
    for (let r = 0; r < arms.length; r++) {
        const arm = arms[r]; const row = { r, arm }
        try {
            await T(page.keyboard.press('Escape'), 5000, 'esc'); await sleep(250)
            await ev((p) => { const c = window.__cc; c.setLookAt(...p, false); c.dispatchEvent({ type: 'update' }) }, pose); await sleep(500)
            row.before = await look(P(0.6, 0.5))
            if (arm === 'C') { await T(page.mouse.move(...P(...SPOT)), 5000, 'mv'); await T(page.mouse.down(), 5000, 'down'); await sleep(80); await T(page.mouse.up(), 5000, 'up'); await sleep(800) }
            else { await drag('left', P(0.4, 0.55), P(...SPOT)); if (arm === 'B') { await sleep(400); await T(page.keyboard.press('Escape'), 5000, 'esc'); await sleep(400) } else await sleep(800) }
            await T(page.mouse.move(...P(0.6, 0.5)), 5000, 'mv')
            row.after = await look(P(0.6, 0.5))
            const t0 = await ev(() => { window.__vLog.length = 0; window.__diNavTrace = []; return performance.now() })
            await drag('right', P(0.6, 0.5), P(0.35, 0.6)); await sleep(700)
            const got = await ev((t) => ({ pd: window.__vLog.slice(), trace: (window.__diNavTrace || []).map((e) => e.why || (e.gestureStart ? 'gestureStart' : e.action)), move: window.__vFrames.filter((f) => f[0] >= t).reduce((a, f) => a + f[1], 0) }), t0)
            row.pdTarget = got.pd.find((e) => e.b === 2)?.tg ?? null; row.trace = got.trace; row.move = +got.move.toFixed(3); row.dead = got.move < DEAD_M
            row.selected = row.after.ins > row.before.ins
        } catch (e) { row.err = String(e).slice(0, 160); try { await page.mouse.up({ button: 'right' }); await page.mouse.up() } catch {} }
        fs.writeSync(out, JSON.stringify(row) + '\n'); rows.push(row)
    }
    fs.closeSync(out); console.log('ROWS', OUT)
    for (const arm of ['A', 'B', 'C']) { const a = rows.filter((x) => x.arm === arm && !x.err)
        console.log('ARM', arm, JSON.stringify({ runs: a.length, selected: a.filter((x) => x.selected).length, covered: a.filter((x) => x.after.cover !== 'CANVAS').length, dead: a.filter((x) => x.dead).length, pdOnCanvas: a.filter((x) => x.pdTarget === 'CANVAS').length, medianMove: a.map((x) => x.move).sort((p, q) => p - q)[a.length >> 1], panel: a.find((x) => x.selected)?.after.panel })) }
    const ctl = rows.filter((x) => x.arm === 'C' && !x.err), ctlSel = ctl.filter((x) => x.selected).length
    console.log('CONTROL', JSON.stringify({ clickRuns: ctl.length, clickSelected: ctlSel, spot: SPOT, reading: ctlSel ? 'a plain click selects here, so a selection after an orbit release would show' : 'a plain click selected nothing at SPOT: this scene cannot show the selection, the arms prove nothing (set NAV_SPOT over a solid object)' }))
    console.log('ERRS', rows.filter((x) => x.err).length, rows.filter((x) => x.err).map((x) => x.err).slice(0, 2).join(' | '))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 300)); await bye(3) })
