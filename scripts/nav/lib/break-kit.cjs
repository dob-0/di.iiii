// Shared by break-move.cjs and break-fuzz.cjs (scripts/nav): the page-side installs, the gesture kit (real input over CDP, poses read from the
// controls, rows with the design's expectation). Not a probe on its own. Needs NAV_PLACES (a fixture with the poses A, B, B2, C). The rows are
// saved as JSON under NAV_OUT (default <system temp dir>/nav-break). Real input goes through Playwright over CDP on the agent screen
// (di-test-browser run); every script ends on about:blank.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadFixture, loadDesign } = require('./common.cjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = process.env.NAV_OUT || path.join(os.tmpdir(), 'nav-break')

let page = null
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
const watchdog = (ms, label = 'WATCHDOG') => setTimeout(() => { console.log(label); bye(4) }, ms)

// installed into the page: the controls, the pose reader, a wait-for-rest, and a wheel-event logger
const installInPage = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc
    window.__pose = () => {
        const c = window.__cc; c.update(0)
        const cam = c.camera, V = cam.position.constructor
        const d = cam.getWorldDirection(new V()), gp = c.getPosition(new V(), true), gt = c.getTarget(new V(), true), t = c.getTarget(new V(), false)
        const up = new V(0, 1, 0).applyQuaternion(cam.quaternion)
        return { p: cam.position.toArray(), d: d.toArray(), up: up.toArray(), gp: gp.toArray(), gt: gt.toArray(), t: t.toArray(), r: c.distance, fov: cam.fov, zoom: cam.zoom, ortho: !!cam.isOrthographicCamera }
    }
    window.__rest = (maxMs) => new Promise((res) => {
        const t0 = performance.now(); let last = null, same = 0
        const tick = () => {
            const p = window.__pose()
            const moved = last ? Math.hypot(p.p[0] - last[0], p.p[1] - last[1], p.p[2] - last[2]) : 1
            const gap = Math.hypot(p.p[0] - p.gp[0], p.p[1] - p.gp[1], p.p[2] - p.gp[2])
            same = moved < 1e-7 && gap < 1e-4 ? same + 1 : 0
            last = p.p
            if (same >= 4 || performance.now() - t0 > maxMs) return res(Math.round(performance.now() - t0))
            setTimeout(tick, 40)
        }
        tick()
    })
    if (!window.__w) {
        window.__w = []
        window.addEventListener('wheel', (e) => window.__w.push([+e.timeStamp.toFixed(1), e.deltaX, e.deltaY, e.deltaMode, e.shiftKey ? 1 : 0, e.altKey ? 1 : 0, e.ctrlKey ? 1 : 0, e.isTrusted ? 1 : 0, Math.round(e.clientX), Math.round(e.clientY), e.target && e.target.tagName]), { capture: true, passive: true })
    }
    return true
}

async function open(url, { width = 1707, height = 960, settle = 4000, find = 60 } = {}) {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width, height })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < find && !ok; i++) { ok = await page.evaluate(installInPage); if (!ok) await sleep(500) }
    if (!ok) throw new Error('no camera controls found')
    await sleep(settle)
    return page
}

const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    angle: (a, b) => (Math.acos(Math.max(-1, Math.min(1, V.dot(a, b) / (V.len(a) * V.len(b))))) * 180) / Math.PI,
}
const f = (x, n = 3) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(n) : x)
const save = (name, obj) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(obj, null, 1)) }


const L = { chromium, fs, sleep, OUT, V, f, save, bye, watchdog, open, installInPage, getPage: () => page }

const ctx = { kind: 'studio', tool: 'Navigate', C: [0, 0], H: 960, W: 1707, S: null, rows: [], tag: process.env.NAV_TAG || 'run', box: null }
const pg = () => L.getPage()
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = V.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1)
const MAP = {
    Edit: { slide: ['middle', ['Shift']], turn: ['middle', []], zoom: ['middle', ['Control']], ease: false },
    Navigate: { slide: ['right', []], turn: ['left', []], zoom: ['middle', []], ease: true },
    public: { slide: ['right', []], turn: ['left', []], zoom: ['middle', []], ease: true },
}
// Camera poses [camera xyz, aim xyz] come from the fixture's "poses" (NAV_PLACES=<file>; fixtures/moxir-v1-1-places.json fits the project moxir-v1-1):
//   A the opening view; B an open place with the aim far ahead (the calibration pose); B2 the same place with the aim only a few metres ahead
//   (so an unplaced turning point shows); C near the floor looking down.
const POSE_KEYS = ['A', 'B', 'B2', 'C']
const POSES = {}
const fail = (msg) => { console.log(msg); process.exit(2) }
if (!process.env.NAV_PLACES) fail('usage: NAV_PLACES=<fixture with poses A, B, B2, C> is required, e.g. scripts/nav/fixtures/<project>-places.json')
try {
    const fx = loadFixture(process.env.NAV_PLACES)
    for (const k of POSE_KEYS) { if (!fx.poses[k]) throw new Error(`NAV_PLACES ${process.env.NAV_PLACES}: poses.${k} is missing (the break probes need ${POSE_KEYS.join(', ')})`); POSES[k] = fx.poses[k] }
} catch (e) { fail('ERR ' + e.message) }

// The design these probes check against is written into the rows as numbers (5x with Shift, 1/5 with Alt, the turning point 10 steps ahead, 100 px of a
// zoom drag a step, 1 mm for turning in place). freeMove.js of this checkout says what the app does; if it differs, every ROW verdict tests the old design.
async function guardDesign() {
    const D = await loadDesign()
    if (D.error) { console.log('WARN DESIGN not checked against freeMove.js: ' + D.error); return }
    const want = { speedFactor: 5, turnSteps: 10, zoomPx: 100, inPlace: 0.001 }
    const diff = Object.keys(want).filter((k) => D[k] !== want[k])
    if (diff.length) console.log('FLAG DESIGN freeMove.js says ' + JSON.stringify(Object.fromEntries(diff.map((k) => [k, D[k]]))) + ' but the probe expects ' + JSON.stringify(Object.fromEntries(diff.map((k) => [k, want[k]]))) + ': the ROW verdicts below test the old design')
    else console.log('DESIGN freeMove.js agrees with the probe: ' + JSON.stringify(want))
}

const M = () => (ctx.tool === 'Edit' ? MAP.Edit : MAP.Navigate)
const pose = () => pg().evaluate(() => window.__pose())
const rest = (ms = 4500) => pg().evaluate((m) => window.__rest(m), ms)
const setPose = async (p, wait = 1500) => { await pg().evaluate((q) => { window.__cc.setLookAt(...q, false); window.__cc.update(0) }, p); await pg().mouse.move(ctx.C[0], ctx.C[1]); await rest(wait) }
const toolSeen = () => pg().evaluate(() => (window.__cc.mouseButtons.left === 0 ? 'Edit' : 'Navigate'))

async function setTool(tool) {
    ctx.tool = tool
    if (ctx.kind !== 'studio') return tool
    const p = pg()
    await p.keyboard.press('Escape'); await p.getByRole('button', { name: tool, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(500)
    const seen = await toolSeen()
    if (seen !== tool) console.log('WARN tool wanted', tool, 'controls say', seen)
    return seen
}
async function setMode(want) { // public viewer: the Free / Inside button shows the current mode
    const b = pg().locator('button', { hasText: /^(Inside|Free)$/ }).first()
    for (let i = 0; i < 3; i++) { const t = (await b.textContent({ timeout: 5000 }).catch(() => null))?.trim(); if (t === want || t == null) return t; await b.click(); await sleep(500) }
    return (await b.textContent().catch(() => null))?.trim()
}
const setTurnMode = async (m) => { await pg().evaluate((v) => { localStorage.setItem('di.studio.navigation.turn', v); window.dispatchEvent(new Event('di:studio-navigation-change')) }, m); await sleep(350) }
const resetPrefs = async () => { try { await pg().evaluate(() => { for (const k of ['di.studio.navigation.turn', 'di.studio.navigation.speed']) localStorage.removeItem(k); window.dispatchEvent(new Event('di:studio-navigation-change')) }) } catch {} }

// what a gesture did, in the camera's own frame before it
function mv(a, b) {
    const d = V.sub(b.p, a.p), r = cross(a.d, a.up)
    const along = V.dot(d, a.d), right = V.dot(d, r), up = V.dot(d, a.up)
    return { disp: V.len(d), along, right, up, lat: Math.hypot(right, up), turnDeg: V.angle(a.d, b.d), gapEnd: V.dist(b.p, b.gp), dr: b.r - a.r }
}
// the same in the frame of the controls' GOAL (what the controls were heading for), used when a glide may still be running
function mvGoal(a, b) {
    const dir = norm(V.sub(a.gt, a.gp)), d = V.sub(b.gp, a.gp), up = a.up
    const along = V.dot(d, dir), right = V.dot(d, norm(cross(dir, up))), upc = V.dot(d, up)
    return { disp: V.len(d), along, right, up: upc, lat: Math.hypot(right, upc) }
}
async function designSpeed() {
    return pg().evaluate(() => { const t = window.__diNavTrace || []; for (let i = t.length - 1; i >= 0; i--) { if (t[i].action === 'wheel' && t[i].speed) return t[i].speed; if (t[i].auto) return t[i].auto } return null })
}

async function wheel(dy = -100, mods = [], dx = 0) {
    const p = pg()
    for (const m of mods) await p.keyboard.down(m)
    await p.mouse.wheel(dx, dy)
    for (const m of mods.slice().reverse()) await p.keyboard.up(m)
}
// seq: numbers (deltaY px) or {dy, dx, mods, gap}; gap in ms between events
async function burst(seq, gap = 16) {
    const p = pg(); const held = new Set()
    for (const e of seq) {
        const ev = typeof e === 'number' ? { dy: e } : e
        const want = new Set(ev.mods || [])
        for (const m of [...held]) if (!want.has(m)) { await p.keyboard.up(m); held.delete(m) }
        for (const m of want) if (!held.has(m)) { await p.keyboard.down(m); held.add(m) }
        await p.mouse.wheel(ev.dx || 0, ev.dy || 0)
        const g = ev.gap ?? gap; if (g > 0) await sleep(g)
    }
    for (const m of held) await p.keyboard.up(m)
}
// the design's metres in notches for one wheel event (deltaMode 0)
function unitsOf(e) {
    const ev = typeof e === 'number' ? { dy: e } : e
    const mods = ev.mods || [], shift = mods.includes('Shift'), alt = mods.includes('Alt')
    const mod = shift && !alt ? 5 : alt && !shift ? 0.2 : 1
    let n = -(ev.dy || 0) / 100
    if (!n && shift) n = -(ev.dx || 0) / 100
    return n * mod
}
const unitsOfSeq = (seq) => seq.reduce((s, e) => s + unitsOf(e), 0)
const wheelLog = async (clear = false) => pg().evaluate((c) => { const w = window.__w.slice(); if (c) window.__w.length = 0; return w }, clear)
function gapStats(w) {
    const t = w.map((x) => x[0]); const g = []; for (let i = 1; i < t.length; i++) g.push(t[i] - t[i - 1]); g.sort((x, y) => x - y)
    return { n: w.length, medianGap: g.length ? f(g[Math.floor(g.length / 2)], 1) : null, p95Gap: g.length ? f(g[Math.floor(g.length * 0.95)], 1) : null, maxGap: g.length ? f(g[g.length - 1], 1) : null }
}

async function dragWith(button, mods, dx, dy, { steps = 10, gap = 22, from = null, hold = 0 } = {}) {
    const p = pg(), s = from || ctx.C
    await p.mouse.move(s[0], s[1])
    for (const m of mods) await p.keyboard.down(m)
    await p.mouse.down({ button })
    for (let i = 1; i <= steps; i++) { await p.mouse.move(s[0] + (dx * i) / steps, s[1] + (dy * i) / steps); if (gap) await sleep(gap) }
    if (hold) await sleep(hold)
    await p.mouse.up({ button })
    for (const m of mods.slice().reverse()) await p.keyboard.up(m)
}
const slide = (dx, dy, o) => dragWith(M().slide[0], M().slide[1], dx, dy, o)
const turn = (dx, dy, o) => dragWith(M().turn[0], M().turn[1], dx, dy, o)
const zoomDrag = (dx, dy, o) => dragWith(M().zoom[0], M().zoom[1], dx, dy, o)
// press without dragging (no click semantics for the right and middle buttons)
async function press(kind, holdMs = 30) {
    const p = pg(), [button, mods] = M()[kind]
    await p.mouse.move(ctx.C[0], ctx.C[1])
    for (const m of mods) await p.keyboard.down(m)
    await p.mouse.down({ button }); await sleep(holdMs); await p.mouse.up({ button })
    for (const m of mods.slice().reverse()) await p.keyboard.up(m)
}
// the turning point the moment a turn drag starts: the controls' distance to their target right after the press
async function pivotAtTurn() {
    const p = pg(), [button, mods] = M().turn
    await p.mouse.move(ctx.C[0], ctx.C[1])
    for (const m of mods) await p.keyboard.down(m)
    await p.mouse.down({ button }); await sleep(60)
    const r = await p.evaluate(() => { const c = window.__cc; c.update(0); const Vc = c.camera.position.constructor; return { r: c.distance, p: c.camera.position.toArray(), t: c.getTarget(new Vc(), false).toArray() } })
    if (ctx.tool === 'Navigate') { await p.mouse.move(ctx.C[0] + 8, ctx.C[1]); await sleep(40) }   // a drag, never a click
    await p.mouse.up({ button })
    for (const m of mods.slice().reverse()) await p.keyboard.up(m)
    return r
}
// frame-by-frame camera positions (requestAnimationFrame), to see snaps that a settled before/after hides
const startRec = () => pg().evaluate(() => { const rec = (window.__rec = { on: true, data: [] }); const tick = () => { if (!rec.on) return; const p = window.__cc.camera.position; rec.data.push([performance.now(), p.x, p.y, p.z]); requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
const stopRec = () => pg().evaluate(() => { window.__rec.on = false; return window.__rec.data })
function recSteps(d) { const s = []; for (let i = 1; i < d.length; i++) s.push(Math.hypot(d[i][1] - d[i - 1][1], d[i][2] - d[i - 1][2], d[i][3] - d[i - 1][3])); return s }
const mppFor = (fov) => (2 * 10 * ctx.S * Math.tan((fov * Math.PI) / 360)) / ctx.H     // the design: metres per pixel of a slide
function row(sec, label, exp, obs, extra = {}) {
    const tol = extra.tol ?? 0.02
    const hasRatio = Math.abs(exp) > 1e-9
    const ratio = hasRatio ? obs / exp : null
    const flag = hasRatio ? Math.abs(ratio - 1) > tol : Math.abs(obs) > (extra.absTol ?? 0.02 * (ctx.S || 1))
    const r = { sec, tool: ctx.tool, label, exp: f(exp, 4), obs: f(obs, 4), ratio: ratio == null ? null : f(ratio, 4), flag, ...extra }
    ctx.rows.push(r)
    console.log(`ROW ${flag ? 'FLAG ' : 'ok   '}${sec} ${ctx.tool} | ${label} | exp ${f(exp, 3)} obs ${f(obs, 3)}${ratio == null ? '' : ' ratio ' + f(ratio, 4)}${extra.note ? ' | ' + extra.note : ''}`)
    return r
}
const saveRows = (name) => L.save(`${ctx.tag}-${name}`, ctx.rows)

async function init(url, { width = 1707, height = 960, settle = 4000 } = {}) {
    await guardDesign()
    const p = await L.open(url, { width, height, settle })
    const box = await p.locator('canvas').first().boundingBox()
    ctx.box = box; ctx.H = box.height; ctx.W = box.width; ctx.C = [box.x + box.width / 2, box.y + box.height / 2]
    return p
}
// first notch: measures the design speed (trace) against the real displacement
async function calibrate(posename = 'B') {
    await setPose(POSES[posename]); await pg().mouse.move(ctx.C[0], ctx.C[1]); await sleep(150)
    const a = await pose(); await wheel(-100); await rest(); const b = await pose()
    const meas = mv(a, b).along, tr = await designSpeed()
    ctx.S = tr || meas
    return { meas: f(meas, 4), trace: tr, S: ctx.S }
}
module.exports = { startRec, stopRec, recSteps, L, ctx, pg, cross, norm, mean, MAP, M, POSES, pose, rest, setPose, toolSeen, setTool, setMode, setTurnMode, resetPrefs, mv, mvGoal, designSpeed, wheel, burst, unitsOf, unitsOfSeq, wheelLog, gapStats, dragWith, slide, turn, zoomDrag, press, pivotAtTurn, mppFor, row, saveRows, init, calibrate, sleep, V, f }
