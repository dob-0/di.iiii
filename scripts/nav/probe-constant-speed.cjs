// Does the Studio camera move at the SAME SPEED wherever it is and whatever is around it?  (owner, 2026-10-13: "the same speed
// and motion to every side ... none of the objects affect the movement ... when I move it sticks and jumps, not the same speed")
// A measurement, not a test of one build: the same script runs on the build before and the build after, and the two outputs are
// compared with scripts/nav/compare-speed.cjs.
//
// METHOD (written down first, so the numbers can be checked; the shape follows scripts/nav/probe-stick-jump.cjs):
//  * PLACES: camera places from a fixture file (NAV_PLACES=<file>, scripts/nav/fixtures/) chosen to vary what is around the camera (open
//    air, 1 m from a truss, 1 m from a lamp, near the floor looking down, inside the rig, looking at nothing, under the roof, against a
//    wall, at the DJ deck, among the machines, outside the hall, down the whole hall). Fixture moxir-v1-1-places.json (12 places) fits the
//    Studio project moxir-v1-1 in the space moxir; another project needs its own file (scripts/nav/discover-places.cjs prints what to
//    base one on). Without NAV_PLACES the probe measures ONE place, the opening view, and says so. Each is reached with
//    cc.setLookAt(..., enableTransition=false) + cc.update(0), never by input. What is around each place is measured too (rays against
//    the solid meshes): nearest surface, what the centre of the view hits, share of the view that hits anything.
//  * ONE GESTURE FROM A KNOWN POSE: before every gesture the camera is put back on the place, with the orbit target T metres ahead on the view axis
//    (T is the same for every place: 10 m). The pose is read back and must match (resetErr).
//  * GESTURES, in both tools (Edit = Blender preset; Navigate = Sketchfab preset), through real pointer events (CDP) on the canvas at a fixed pixel anchor:
//      wheel-in / wheel-out   one notch, deltaY -100 / +100
//      slide-R/L/D/U          200 px drag. Edit: Shift+middle button. Navigate: right button.   (R = pointer moves right, D = pointer moves down)
//      turn-R/L/D/U           200 px drag. Edit: middle button.       Navigate: left button.
//  * MEASURED per gesture, after the camera has settled (pose unchanged 3 polls of 70 ms; Navigate eases for about half a second):
//      disp  camera displacement in metres;  ang  angle between the view directions before and after, degrees (yaw, pitch on their own);
//      sR/sU/sF  the displacement along the camera's own right / up / forward axes before the gesture;  path  length travelled over the rendered frames;
//      d0 / dp / d1  the orbit distance cc.distance before, right after the button press (what the tool picked as its speed distance), and after;
//      maxS/medS/jerk  the biggest and the median per-frame step and their ratio (a stick-and-jump shows as a big jerk).
//  * SUMMARY per tool and gesture across the places: min, max, max/min and the coefficient of variation (std/mean). Constant speed = ratio near 1.0.
//    Also per place the largest/smallest of the four directions (the "same speed to every side" number), and three extra sections at the first two places of the file:
//    DET (the same gesture 3 times: the noise floor of the whole chain), TSWEEP (the orbit target at 1, 10, 100 m: does the orbit distance set the speed?),
//    PTR (the pointer at 5 places on the screen, wheel and slide: does what is under the pointer set the speed?).
//  * LIMITS (stated): the pointer anchor is a pixel position that must be free of Studio's floating panels (checked per gesture with elementFromPoint, a blocked
//    gesture is printed as bl=..., never silently dropped); "around" rays use the solid meshes only (no light cones, no Smart View cut planes); one machine, one GPU lane;
//    camera-controls' own eased state is read from the camera object once it has stopped moving; the rays need the dev server's three module (di-dev up), without it the PLACE lines say so and the gestures still run. The tool buttons it expects are read from src/studio/navigation/mappings.js of the checkout this script sits in: run it from the tree whose build is under test.
//
// USAGE (the lock and the heat check come from di-test-browser; this script also waits while the package is above DI_HOT_C, default 85 C, between places):
//   NAV_URL=<studio url> NAV_PLACES=scripts/nav/fixtures/moxir-v1-1-places.json NAV_LABEL=before NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-constant-speed.cjs | tee before.out
// Options: NAV_SHOTS=<dir> (a picture per place)  NAV_ONLY=P01,P02  NAV_DRY=1 (places and surroundings only, no gestures)  NAV_EXTRAS=0  NAV_MAIN=0 (extras only)  NAV_TOOLS=edit  NAV_T=10
//   NAV_ANCHORS="x,y;x,y;x,y;x,y;x,y" (A0..A4)  NAV_BUILD=<commit label>  NAV_WATCHDOG_MS=1500000  NAV_HEAT_PER_MS=300000 NAV_HEAT_TOTAL_MS=900000 (heat waits; above 92 C it never goes on; DI_HOT_C=0 skips them)  DI_TEST_LANE=N pins a lane
const { chromium } = require('playwright')
const { spawnSync } = require('child_process')
const fs = require('fs')
const { loadFixture, loadDesign } = require('./lib/common.cjs')

const URL = process.env.NAV_URL
if (!URL) { console.log('usage: NAV_URL=<studio url> [NAV_PLACES=<fixture>] [NAV_LABEL=before] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-constant-speed.cjs'); process.exit(2) }
const LABEL = process.env.NAV_LABEL || 'run'
const SHOTS = process.env.NAV_SHOTS || ''
const ONLY = (process.env.NAV_ONLY || '').split(',').filter(Boolean)
const DRY = process.env.NAV_DRY === '1'
const EXTRAS = process.env.NAV_EXTRAS !== '0'
const TOOLS = (process.env.NAV_TOOLS || 'edit,navigate').split(',').map((s) => s.trim().toLowerCase())
const T0 = Number(process.env.NAV_T || 10)
const HOT_C = Number(process.env.DI_HOT_C || 85)
const WATCHDOG_MS = Number(process.env.NAV_WATCHDOG_MS || 1500000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (TOOLS.some((t) => t !== 'edit' && t !== 'navigate')) { console.log('ERR NAV_TOOLS is edit, navigate or both, got ' + TOOLS.join(',')); process.exit(2) }
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })

// ---- the places (scene metres, y up): a fixture file; none = the opening view only, decided once the page is up ----
let FIXTURE = null
if (process.env.NAV_PLACES) {
    try { FIXTURE = loadFixture(process.env.NAV_PLACES) } catch (e) { console.log('ERR ' + e.message); process.exit(2) }
    if (!FIXTURE.places.length) { console.log('ERR NAV_PLACES ' + process.env.NAV_PLACES + ' has no places'); process.exit(2) }
}
let PLACES = FIXTURE ? FIXTURE.places : null
// pointer anchors (page pixels, viewport 1707 x 960, Studio's default panels): A0 for the main pass, A1-A4 for the PTR section
const ANCHORS = { A0: [700, 640], A1: [360, 840], A2: [1000, 620], A3: [1450, 700], A4: [600, 200] }
if (process.env.NAV_ANCHORS) {
    const pts = process.env.NAV_ANCHORS.split(';').map((s) => s.split(',').map(Number))
    if (pts.length !== 5 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) { console.log('ERR NAV_ANCHORS wants five x,y pairs separated by ;'); process.exit(2) }
    pts.forEach((p, i) => { ANCHORS['A' + i] = p })
}
const A0 = ANCHORS.A0
const FAMILIES = ['wheel-in', 'wheel-out', 'slide-R', 'slide-L', 'slide-D', 'slide-U', 'turn-R', 'turn-L', 'turn-D', 'turn-U']
const DIRS = { R: [1, 0], L: [-1, 0], D: [0, 1], U: [0, -1] }
// how each tool performs each gesture family: [button, modifier keys]
const BTN = { edit: { slide: ['middle', ['Shift']], turn: ['middle', []] }, navigate: { slide: ['right', []], turn: ['left', []] } }
// camera-controls mouseButtons [left, middle, right, wheel] at rest: read from src/studio/navigation/mappings.js of this checkout (set in main)
let EXPECT_BUTTONS = {}

// ---- small maths on plain arrays ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const angDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI
const wrap = (d) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d }
const yawOf = (f) => Math.atan2(f[0], f[2]) * 180 / Math.PI
const pitchOf = (f) => Math.asin(Math.max(-1, Math.min(1, f[1]))) * 180 / Math.PI
const r = (v, n = 5) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(n))
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const stats = (vals) => {
    const v = vals.filter((x) => Number.isFinite(x))
    const dead = v.filter((x) => Math.abs(x) < 1e-6).length
    const live = v.filter((x) => Math.abs(x) >= 1e-6).map(Math.abs)
    if (!live.length) return { n: v.length, dead, min: null, max: null, ratio: null, cv: null }
    const min = Math.min(...live), max = Math.max(...live), mean = live.reduce((s, x) => s + x, 0) / live.length
    const sd = Math.sqrt(live.reduce((s, x) => s + (x - mean) ** 2, 0) / live.length)
    return { n: v.length, dead, min: r(min, 5), max: r(max, 5), ratio: r(max / min, 3), cv: r(sd / mean, 3) }
}

// ---- page side ----
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc
    return true
}
const setupInPage = () => {
    const rot = (q, v) => { const tx = q.y * v[2] - q.z * v[1] + q.w * v[0], ty = q.z * v[0] - q.x * v[2] + q.w * v[1], tz = q.x * v[1] - q.y * v[0] + q.w * v[2]
        return [v[0] + 2 * (q.y * tz - q.z * ty), v[1] + 2 * (q.z * tx - q.x * tz), v[2] + 2 * (q.x * ty - q.y * tx)] }
    window.__sp = {
        pose: () => { const cc = window.__cc, c = cc._camera, p = c.position, q = c.quaternion
            return { p: [p.x, p.y, p.z], f: rot(q, [0, 0, -1]), r: rot(q, [1, 0, 0]), u: rot(q, [0, 1, 0]), d: cc.distance, t: [cc._target.x, cc._target.y, cc._target.z] } },
        reset: (pos, tgt) => { const cc = window.__cc; if (cc.active) cc.stop(); cc.setLookAt(pos[0], pos[1], pos[2], tgt[0], tgt[1], tgt[2], false); cc.update(0); cc._camera.updateMatrixWorld(true); cc.dispatchEvent({ type: 'update' }) },
    }
    window.__sp.raf = () => new Promise((res) => requestAnimationFrame(() => res(performance.now())))
    // the three Scene without waiting for a gesture: the app's own DEV handle when it exists, else a hook ref that carries it
    window.__spScene = () => {
        const ok = (x) => x && x.isScene
        if (ok(window.__spSceneCache)) return window.__spSceneCache
        // the controls are an R3F primitive: __r3f.root is the R3F store of the Canvas that owns them
        try { const store = window.__cc && window.__cc.__r3f && window.__cc.__r3f.root && window.__cc.__r3f.root.getState(); if (store && ok(store.scene)) { window.__spSceneCache = store.scene; window.__spSceneSrc = 'r3f-store'; return store.scene } } catch (e) {}
        if (ok(window.__diNavScene)) { window.__spSceneSrc = 'diNavScene'; return window.__diNavScene }
        const rootEl = document.getElementById('root') || document.body.firstElementChild
        const key = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$')); if (!key) return null
        const st = [rootEl[key]]; let n = 0
        while (st.length && n++ < 300000) { const f = st.pop(); if (!f) continue
            for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const c = h.memoizedState && typeof h.memoizedState === 'object' ? h.memoizedState.current : null
                if (c && typeof c === 'object') { if (ok(c)) { window.__spSceneCache = c; return c } if (ok(c.scene)) { window.__spSceneCache = c.scene; return c.scene } } }
            const v = f.memoizedProps && f.memoizedProps.value; if (v && typeof v.getState === 'function') { try { const sc = v.getState().scene; if (ok(sc)) { window.__spSceneCache = sc; return sc } } catch (e) {} }
            if (f.child) st.push(f.child); if (f.sibling) st.push(f.sibling) }
        return null
    }
    window.__fr = []; window.__pm = []
    if (!window.__spPm) { window.__spPm = true; document.addEventListener('pointermove', (e) => { if (e.buttons) window.__pm.push(performance.now()) }, true) }
    if (!window.__spTick) { window.__spTick = true
        const tick = () => { const c = window.__cc._camera, p = c.position, f = rot(c.quaternion, [0, 0, -1]); window.__fr.push([performance.now(), p.x, p.y, p.z, f[0], f[1], f[2]]); if (window.__fr.length > 30000) window.__fr.splice(0, 15000); requestAnimationFrame(tick) }
        requestAnimationFrame(tick) }
}
// the surroundings of the camera as it stands now: rays over a 12 x 7 grid of the view against the SOLID meshes
const aroundInPage = async () => {
    const cc = window.__cc, cam = cc._camera
    if (window.__THREE === undefined) { const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n)); window.__THREE = url ? await import(url) : null }
    const THREE = window.__THREE
    const scene = window.__spScene()
    if (!THREE || !scene) return { error: 'no three or scene' }
    if (!window.__spMeshes) {
        const seeThrough = (m) => { const l = Array.isArray(m) ? m : [m]; return l.every((x) => !x || x.visible === false || x.depthWrite === false || x.colorWrite === false || (x.transparent === true && Number(x.opacity) < 0.99)) }
        window.__spMeshes = []; scene.traverse((o) => { if (!o.isMesh || seeThrough(o.material)) return; for (let p = o; p; p = p.parent) if (!p.visible) return; window.__spMeshes.push(o) })
    }
    cam.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(); ray.far = 1000
    const hit = (nx, ny) => { ray.setFromCamera(new THREE.Vector2(nx, ny), cam); const h = ray.intersectObjects(window.__spMeshes, false); return h.length ? h[0] : null }
    const all = [], ctr = []; let nearest = null, hits = 0, total = 0
    for (let iy = 0; iy < 7; iy++) for (let ix = 0; ix < 12; ix++) { total++; const h = hit(-0.92 + ix * (1.84 / 11), 0.85 - iy * (1.7 / 6)); if (!h) continue; hits++; all.push(h.distance); if (!nearest || h.distance < nearest.distance) nearest = h }
    for (const nx of [-0.1, 0, 0.1]) for (const ny of [-0.1, 0, 0.1]) { const h = hit(nx, ny); if (h) ctr.push(h.distance) }
    const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] }
    const chain = (o) => { const n = []; for (let p = o; p && n.length < 2; p = p.parent) n.push(p.name || p.type); return n.join('<') }
    return { ctr: ctr.length ? +med(ctr).toFixed(2) : null, ctrHits: `${ctr.length}/9`, min: nearest ? +nearest.distance.toFixed(2) : null, near: nearest ? chain(nearest.object).slice(0, 36) : null, hitFrac: +(hits / total).toFixed(2), median: all.length ? +med(all).toFixed(2) : null }
}

let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
const dog = setTimeout(() => { console.log('ERR watchdog', WATCHDOG_MS); bye(4) }, WATCHDOG_MS)
process.on('unhandledRejection', (e) => { console.log('ERR unhandled', String(e).slice(0, 200)); bye(3) })
process.on('SIGTERM', () => { console.log('ERR SIGTERM'); bye(5) })
process.on('SIGINT', () => { console.log('ERR SIGINT'); bye(5) })

const pkgTemp = () => { const s = spawnSync('sensors', [], { encoding: 'utf8' }); const m = /Package id 0:\s+\+?(\d+(?:\.\d+)?)/.exec(s.stdout || ''); return m ? Number(m[1]) : null }
// wait while the package is above the limit; at most 5 minutes per call and 15 minutes in all, then go on and say so (a machine that is hot with nothing of ours running must not stall the measurement for ever)
let heatWaitedMs = 0
const HEAT_PER_MS = Number(process.env.NAV_HEAT_PER_MS || 300000), HEAT_TOTAL_MS = Number(process.env.NAV_HEAT_TOTAL_MS || 900000)
const cool = async (why) => {
    if (!HOT_C) return null
    for (let waited = 0; ; waited += 20000) {
        const t = pkgTemp(); if (t == null || t <= HOT_C) return t
        if ((waited >= HEAT_PER_MS || heatWaitedMs >= HEAT_TOTAL_MS) && t <= 92) { console.log(`HEAT proceeding at ${t} C (limit ${HOT_C}, hard stop 92) after waiting ${Math.round(waited / 1000)} s (${why}; total waited ${Math.round(heatWaitedMs / 1000)} s)`); return t }
        console.log(`HEAT ${t} C > ${HOT_C} C, waiting 20 s (${why})`); await sleep(20000); heatWaitedMs += 20000
    }
}

;(async () => {
    const D = await loadDesign()
    if (D.error) console.log('WARN design not read from this checkout (' + D.error + '): no verdict on the tool buttons')
    else EXPECT_BUTTONS = { edit: D.buttons.Edit, navigate: D.buttons.Navigate }
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('ERR no camera-controls found'); await bye(2) }
    await page.evaluate(setupInPage)
    const pose = () => page.evaluate(() => window.__sp.pose())
    const useTool = async (tool) => {
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: tool === 'edit' ? 'Edit' : 'Navigate', exact: true }).first().click({ timeout: 8000 })
        await sleep(500); await page.evaluate(install); await page.evaluate(setupInPage)
        return page.evaluate(() => { const m = window.__cc.mouseButtons; return [m.left, m.middle, m.right, m.wheel] })
    }
    // no gesture before the models are in: the new build takes its automatic speed from the content at the FIRST move of the visit
    await useTool('edit'); await sleep(1500)
    let lastN = -1, same = 0, roots = 0, warn = null
    for (let i = 0; i < 90 && same < 4; i++) {
        const q = await page.evaluate(() => { const sc = window.__spScene(); if (!sc) return [0, 0]; let n = 0, e = 0; sc.traverse((o) => { n++; if (o.userData && o.userData.svEntityId != null) e++ }); return [n, e] })
        same = q[0] > 0 && q[0] === lastN ? same + 1 : 0; lastN = q[0]; roots = q[1]
        if (i === 20 && q[0] === 0) { warn = 'scene not found by the page; waited a fixed 12 s instead'; await sleep(12000); break }
        await sleep(1000)
    }
    if (warn) console.log('WARN', warn)
    const sceneSource = await page.evaluate(() => window.__spSceneSrc || (window.__spSceneCache ? 'hook-ref' : null))
    const prefs = await page.evaluate(() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/navigation|\bnav\b|speed|turn/i.test(k)) o[k] = localStorage.getItem(k) } } catch (e) {} return o })
    const cam = await page.evaluate(() => ({ fov: window.__cc._camera.fov, near: window.__cc._camera.near, far: window.__cc._camera.far, aspect: +window.__cc._camera.aspect.toFixed(3), minD: window.__cc.minDistance, maxD: window.__cc.maxDistance, azimuthSpeed: window.__cc.azimuthRotateSpeed, truckSpeed: window.__cc.truckSpeed }))
    if (!PLACES) {
        const o = await page.evaluate(() => { const c = window.__cc, cm = c.camera, V = cm.position.constructor; return { pos: c.getPosition(new V(), true).toArray(), at: cm.getWorldDirection(new V()).multiplyScalar(10).add(cm.position).toArray() } })
        PLACES = [{ id: 'P01', name: 'the opening view (no NAV_PLACES given)', pos: o.pos, at: o.at }]
        console.log('WARN no NAV_PLACES: one place only, the opening view; the table of places needs a fixture (scripts/nav/fixtures/)')
    }
    console.log('HEADER', JSON.stringify({ label: LABEL, url: URL, at: new Date().toISOString(), viewport: [1707, 960], T: T0, anchor: A0, sceneNodes: lastN, entityRoots: roots, sceneSource, prefs, cam, tools: TOOLS, places: PLACES.length, fixture: FIXTURE ? FIXTURE.meta : null, build: process.env.NAV_BUILD || null, lane: process.env.DI_TEST_LANE || null }))

    const places = PLACES.filter((p) => !ONLY.length || ONLY.includes(p.id))
    if (!places.length) { console.log('ERR no place matches NAV_ONLY=' + ONLY.join(',') + ' (the places are ' + PLACES.map((p) => p.id).join(',') + ')'); clearTimeout(dog); await bye(2) }
    const p1 = PLACES[0], p2 = PLACES[1] // the extras (DET, TSWEEP, PTR) run at the first two places of the file, whatever NAV_ONLY picks
    const target = (pl, T) => { const d = norm(sub(pl.at, pl.pos)); return [pl.pos[0] + d[0] * T, pl.pos[1] + d[1] * T, pl.pos[2] + d[2] * T] }
    const reset = async (pl, T) => {
        let err = 1e9
        for (let k = 0; k < 2 && err > 2e-3; k++) { await page.evaluate(([pos, tgt]) => window.__sp.reset(pos, tgt), [pl.pos, target(pl, T)]); await sleep(150); const got = await pose(); err = len(sub(got.p, pl.pos)) }
        return err
    }
    // ---- the surroundings of every place (and a picture of it) ----
    const around = {}
    for (const pl of places) {
        await reset(pl, T0); await sleep(250)
        around[pl.id] = await page.evaluate(aroundInPage)
        console.log('PLACE', JSON.stringify({ id: pl.id, name: pl.name, pos: pl.pos, at: pl.at, lookDist: r(len(sub(pl.at, pl.pos)), 2), around: around[pl.id] }))
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${LABEL}-${pl.id}.jpg`, type: 'jpeg', quality: 62 }).catch((e) => console.log('shot failed', String(e).slice(0, 80)))
    }
    if (DRY) { clearTimeout(dog); await bye(0) }

    // ---- one gesture from a known pose ----
    const ALL = []
    const freeCheck = (pts) => page.evaluate((pts) => { for (const [x, y] of pts) { const e = document.elementFromPoint(x, y); if (!e || e.tagName !== 'CANVAS') return e ? `${e.tagName}.${String(e.className || '').slice(0, 30)}` : 'none' } return null }, pts)
    const settle = async () => {
        const t0 = Date.now(); let last = await pose(), still = 0; await sleep(200)
        while (Date.now() - t0 < 5000) { const cur = await pose(); const moved = len(sub(cur.p, last.p)) > 1e-5 || angDeg(cur.f, last.f) > 1e-4; still = moved ? 0 : still + 1; last = cur; if (still >= 3) break; await sleep(70) }
        return Date.now() - t0
    }
    // 16 pointer moves of 12.5 px, each in its own animation frame (one move per rendered frame, so a frame step is never an artefact of the input cadence)
    const drag = async (button, mods, from, to) => {
        for (const k of mods) await page.keyboard.down(k)
        await page.mouse.move(...from); await sleep(40); await page.mouse.down({ button }); await sleep(40)
        const dp = await page.evaluate(() => window.__cc.distance)
        const tDown = await page.evaluate(() => performance.now())
        const n = 16
        for (let i = 1; i <= n; i++) { await page.evaluate(() => window.__sp.raf()); await page.mouse.move(from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n) }
        const tUp = await page.evaluate(() => performance.now())
        await page.mouse.up({ button }); for (const k of mods) await page.keyboard.up(k)
        return { dp, tDown, tUp }
    }
    const gesture = async (tool, pl, g, { sec = 'main', anchor = 'A0', T = T0, rep = 0 } = {}) => {
        const A = ANCHORS[anchor]; const out = { sec, tool, pl: pl.id, g, anc: anchor, T }; if (rep) out.rep = rep
        try {
            out.resetErr = r(await reset(pl, T), 5)
            const b = await pose()
            const [fam, dirc] = g.split('-')
            const pts = fam === 'wheel' ? [A] : (() => { const v = DIRS[dirc]; return [[A[0] - 100 * v[0], A[1] - 100 * v[1]], A, [A[0] + 100 * v[0], A[1] + 100 * v[1]]] })()
            const blocked = await freeCheck(pts); if (blocked) { out.bl = blocked; return out }
            await page.evaluate(() => { window.__fr.length = 0; window.__pm.length = 0; window.__spTrI = (window.__diNavTrace || []).length })
            let dp = null, win = null
            if (fam === 'wheel') { await page.mouse.move(...A); await sleep(60); await page.mouse.wheel(0, dirc === 'in' ? -100 : 100) }
            else { const [button, mods] = BTN[tool][fam]; const dr = await drag(button, mods, pts[0], pts[2]); dp = dr.dp; win = [dr.tDown, dr.tUp] }
            out.ms = await settle()
            const a = await pose(); const fr = await page.evaluate(() => window.__fr.slice()); const pm = await page.evaluate(() => window.__pm.slice()); const tr = await page.evaluate(() => (window.__diNavTrace || []).slice(window.__spTrI || 0).slice(-3).map((t) => { const { t: _t, ...rest } = t; return JSON.stringify(rest).slice(0, 130) }))
            const dv = sub(a.p, b.p)
            Object.assign(out, { d0: r(b.d, 3), dp: dp == null ? null : r(dp, 3), d1: r(a.d, 3), disp: r(len(dv), 5), ang: r(angDeg(b.f, a.f), 4), yaw: r(wrap(yawOf(a.f) - yawOf(b.f)), 4), pit: r(pitchOf(a.f) - pitchOf(b.f), 4), sR: r(dot(dv, b.r), 5), sU: r(dot(dv, b.u), 5), sF: r(dot(dv, b.f), 5) })
            const steps = [], angs = [], inWin = []
            for (let i = 1; i < fr.length; i++) { const sx = Math.hypot(fr[i][1] - fr[i - 1][1], fr[i][2] - fr[i - 1][2], fr[i][3] - fr[i - 1][3]); const an = angDeg([fr[i][4], fr[i][5], fr[i][6]], [fr[i - 1][4], fr[i - 1][5], fr[i - 1][6]])
                if (sx > 1e-5 || an > 1e-4) { steps.push(sx); angs.push(an) }
                if (win && fr[i][0] > win[0] && fr[i][0] <= win[1] + 24) inWin.push([sx, an]) }
            const med = median(steps)
            Object.assign(out, { path: r(steps.reduce((q, x) => q + x, 0), 5), nf: steps.length, maxS: r(Math.max(0, ...steps), 5), medS: r(med, 5), maxA: r(Math.max(0, ...angs), 4) })
            if (win) {
                // while the button is down. jerk: the biggest per-frame response over the median one (metres per frame for a slide, degrees per frame for a turn;
                // dust below 0.1 mm / 0.001 deg is not a response). stall: pointer moves that the camera did not answer within the next two frames.
                const turn = g.startsWith('turn'), unit = (x) => (turn ? x[1] : x[0]), thr = turn ? 1e-3 : 1e-4
                const resp = inWin.map(unit).filter((v) => v > thr), mR = median(resp)
                let stall = 0
                for (const tm of pm) { let f = fr.findIndex((q) => q[0] > tm); if (f < 1) continue; const stepAt = (k) => { if (k < 1 || k >= fr.length) return 0; return turn ? angDeg([fr[k][4], fr[k][5], fr[k][6]], [fr[k - 1][4], fr[k - 1][5], fr[k - 1][6]]) : Math.hypot(fr[k][1] - fr[k - 1][1], fr[k][2] - fr[k - 1][2], fr[k][3] - fr[k - 1][3]) }
                    if (!(stepAt(f) > thr || stepAt(f + 1) > thr)) stall++ }
                Object.assign(out, { wf: inWin.length, mv: pm.length, jerk: mR > 0 ? r(Math.max(...resp) / mR, 2) : null, stall })
            }
            if (tr.length) out.tr = tr
        } catch (e) { out.err = String(e).slice(0, 160) }
        await page.keyboard.press('Escape').catch(() => {})
        return out
    }
    let errRun = 0
    const run = async (tool, pl, g, o = {}) => {
        const res = await Promise.race([gesture(tool, pl, g, o), sleep(30000).then(() => ({ sec: o.sec || 'main', tool, pl: pl.id, g, err: 'gesture timeout 30 s' }))])
        ALL.push(res); console.log('G', JSON.stringify(res))
        errRun = res.err ? errRun + 1 : 0
        if (errRun >= 4) { console.log('ERR four failed gestures in a row, stopping'); clearTimeout(dog); await bye(6) }
        return res
    }

    for (const tool of TOOLS) {
        const mb = await useTool(tool)
        console.log('TOOL', JSON.stringify({ tool, mouseButtons: mb, expected: EXPECT_BUTTONS[tool] || null, ok: EXPECT_BUTTONS[tool] ? JSON.stringify(mb) === JSON.stringify(EXPECT_BUTTONS[tool]) : null }))
        // main pass: every place, ten gestures (NAV_MAIN=0 skips it, for a re-run of the extras only)
        if (process.env.NAV_MAIN !== '0') for (const pl of places) {
            const tc = await cool(`${tool} ${pl.id}`); console.log(`TEMP ${tool} ${pl.id} package ${tc} C`)
            for (const g of FAMILIES) await run(tool, pl, g)
        }
        if (!EXTRAS) continue
        // DET: the same three gestures three times at the first place (the noise floor of the whole chain)
        await cool(`${tool} det`)
        for (let rep = 1; rep <= 3; rep++) for (const g of ['wheel-in', 'slide-R', 'turn-R']) await run(tool, p1, g, { sec: 'det', rep })
        // TSWEEP: the orbit target at five distances, the camera on the same place
        for (const T of [1, 10, 100]) for (const g of ['wheel-in', 'slide-R', 'turn-R']) await run(tool, p1, g, { sec: 'tsweep', T })
        // PTR: the pointer at four more places on the screen, at two camera places
        await cool(`${tool} ptr`)
        for (const pl of [p1, p2].filter(Boolean)) for (const anchor of ['A1', 'A2', 'A3', 'A4']) for (const g of ['wheel-in', 'slide-R']) await run(tool, pl, g, { sec: 'ptr', anchor })
    }

    // ---- summary ----
    const by = (f) => ALL.filter(f)
    const metricOf = (g) => (g.startsWith('turn') ? ['ang', 'disp'] : ['disp'])
    console.log('--- SUMMARY (main pass: across the places; constant speed = ratio near 1.0) ---')
    for (const tool of TOOLS) {
        const main = by((x) => x.tool === tool && x.sec === 'main' && !x.err && !x.bl)
        const blocked = by((x) => x.tool === tool && x.sec === 'main' && x.bl).length, errs = by((x) => x.tool === tool && x.err).length
        console.log(`TOOL ${tool}: measured ${main.length} main gestures, blocked ${blocked}, errors ${errs}`)
        for (const g of FAMILIES) for (const m of metricOf(g)) { const s = stats(main.filter((x) => x.g === g).map((x) => x[m])); console.log(`SUM ${tool} ${g.padEnd(9)} ${m.padEnd(4)} ${JSON.stringify(s)}`) }
        for (const [fam, m] of [['wheel', 'disp'], ['slide', 'disp'], ['turn', 'ang'], ['turn', 'disp']]) { const s = stats(main.filter((x) => x.g.startsWith(fam)).map((x) => x[m])); console.log(`SUM ${tool} ${(fam + '-all').padEnd(9)} ${m.padEnd(4)} ${JSON.stringify(s)}  (all places and directions together)`) }
        // the same speed to every side: per place, the largest over the smallest of the four directions
        for (const [fam, m] of [['slide', 'disp'], ['turn', 'ang']]) {
            const per = places.map((pl) => { const v = main.filter((x) => x.pl === pl.id && x.g.startsWith(fam)).map((x) => Math.abs(x[m])); return v.length === 4 && Math.min(...v) > 1e-6 ? [pl.id, Math.max(...v) / Math.min(...v)] : [pl.id, null] })
            const good = per.filter((p) => p[1] != null); const worst = good.sort((a, b) => b[1] - a[1])[0]
            console.log(`SIDES ${tool} ${fam} ${m}: per place max/min over R L D U: median ${r(median(good.map((p) => p[1])), 3)}, worst ${worst ? worst[0] + ' ' + r(worst[1], 3) : '-'}, places with a dead direction ${per.length - good.length}`)
        }
        // the orbit distance the tool used: right after the press (drags) and after the gesture (wheel)
        for (const g of ['slide-R', 'turn-R']) { const s = stats(main.filter((x) => x.g === g).map((x) => x.dp)); console.log(`DIST ${tool} ${g} orbit distance after the press (T=${T0}): ${JSON.stringify(s)}`) }
        for (const g of ['wheel-in', 'wheel-out']) { const s = stats(main.filter((x) => x.g === g).map((x) => x.d1 / x.d0)); console.log(`DIST ${tool} ${g} d1/d0: ${JSON.stringify(s)}`) }
        const jerks = main.map((x) => x.jerk).filter((v) => v != null); const stalls = main.map((x) => x.stall).filter((v) => v != null); console.log(`JERK ${tool} drags, button down: max/median frame step: median ${r(median(jerks), 2)}, worst ${jerks.length ? Math.max(...jerks) : null}; stalled frames (pointer moved, camera did not): ${stalls.reduce((q, x) => q + x, 0)} in ${stalls.length} drags, worst drag ${stalls.length ? Math.max(...stalls) : null}`)
        // extras
        const det = by((x) => x.tool === tool && x.sec === 'det' && !x.err && !x.bl)
        for (const g of ['wheel-in', 'slide-R', 'turn-R']) { const v = det.filter((x) => x.g === g).map((x) => (g.startsWith('turn') ? x.ang : x.disp)); console.log(`DET ${tool} ${g}: ${v.join(' ')} spread ${v.length ? r((Math.max(...v) - Math.min(...v)) / (v.reduce((s, x) => s + x, 0) / v.length), 4) : '-'} (max-min over mean)`) }
        const ts = by((x) => x.tool === tool && x.sec === 'tsweep' && !x.err && !x.bl)
        for (const g of ['wheel-in', 'slide-R', 'turn-R']) { const m = g.startsWith('turn') ? 'ang' : 'disp'; const v = [1, 10, 100].map((T) => ts.find((x) => x.g === g && x.T === T)?.[m]); const s = stats(v); console.log(`TSWEEP ${tool} ${g} ${m} at T=1,10,100 m: ${v.join(' ')}  ratio max/min ${s.ratio}`) }
        const pt = by((x) => x.tool === tool && x.sec === 'ptr' && !x.err && !x.bl)
        for (const pl of [p1, p2].filter(Boolean).map((p) => p.id)) for (const g of ['wheel-in', 'slide-R']) { const m = 'disp'; const pool = [...pt.filter((x) => x.pl === pl && x.g === g), ...main.filter((x) => x.pl === pl && x.g === g)].map((x) => x[m]); const s = stats(pool); console.log(`PTR ${tool} ${pl} ${g} ${m} at 5 pointer places: ${pool.join(' ')}  ratio max/min ${s.ratio}`) }
    }
    const auto = await page.evaluate(() => (window.__diNavTrace || []).filter((t) => /auto speed/i.test(JSON.stringify(t))).slice(0, 3).map((t) => JSON.stringify(t)))
    console.log('AUTOSPEED', JSON.stringify(auto), 'trace entries', await page.evaluate(() => (window.__diNavTrace || []).length))
    console.log('SUMMARY-JSON ' + JSON.stringify({ label: LABEL, gestures: ALL.length, blocked: ALL.filter((x) => x.bl).length, errors: ALL.filter((x) => x.err).length }))
    console.log('DONE', LABEL, new Date().toISOString())
    clearTimeout(dog)
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 300)); await bye(3) })
