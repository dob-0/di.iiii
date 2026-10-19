// The standard move's FIRST review (2026-10-13; probe-review2.cjs is the second), checked with real input on the agent screen. From one fixed
// pose each time, 3 repeats of R1 and R2:
//   R1  Navigate: Shift+wheel (5 steps), 120 ms later the right button (slide) pressed and held 500 ms. The press lands in the middle of the
//       notch's glide: maxFrameStepAfterPress must stay near maxFrameStepBefore (a jump shows as a step many times bigger).
//   R2  Navigate: Shift+wheel, 120 ms later a left press+release (a turn starts). The notch must still arrive whole: notchThenTurn = notchAlone.
//   R3  Edit: fly 1 s (right button + W), then Walk (Shift+`) entered and left with Esc, then fly twice more: the three distances are the same one step.
//   R4  Public viewer in Free (NAV_PUBLIC_URL; skipped without it): a two-finger pinch out of 10 x 100 px, ten times, from a turning point
//       NAV_FAR_M (default 27.24, the distance the old pinch was measured at) ahead: every pinch the same step whatever the turning distance (perPinch).
// Read-only (camera state is local). Pose: NAV_POSE=px,py,pz,tx,ty,tz, else the pose "B" of NAV_PLACES (fixtures/moxir-v1-1-places.json fits the
// project moxir-v1-1), else the opening view.
// NAV_URL=<studio url> [NAV_PUBLIC_URL=<public viewer url>] [NAV_PLACES=<fixture>] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-review1.cjs   One REVIEW1 line.
const { chromium } = require('playwright')
const { loadFixture, parsePose } = require('./lib/common.cjs')
const STUDIO = process.env.NAV_URL
if (!STUDIO) { console.log('usage: NAV_URL=<studio url> [NAV_PUBLIC_URL=<public viewer url>] [NAV_PLACES=<fixture>] [NAV_POSE=px,py,pz,tx,ty,tz] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/probe-review1.cjs'); process.exit(2) }
const PUBLIC = process.env.NAV_PUBLIC_URL || ''
const FAR = Number(process.env.NAV_FAR_M || 27.24)
let FIXTURE = null, POSE_ENV = null
try { if (process.env.NAV_PLACES) FIXTURE = loadFixture(process.env.NAV_PLACES); if (process.env.NAV_POSE) POSE_ENV = parsePose(process.env.NAV_POSE) } catch (e) { console.log('ERR ' + e.message); process.exit(2) }
if (!(FAR > 0)) { console.log('ERR NAV_FAR_M wants a distance in metres above 0'); process.exit(2) }
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
const sampler = () => { window.__s = []; window.__on = true; const cc = window.__cc; const tick = () => { const p = cc.camera.position; window.__s.push([performance.now(), p.x, p.y, p.z]); if (window.__on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }
const stopS = () => { window.__on = false; return window.__s }
const r = (n) => +n.toFixed(3)
const open = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 60 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc', url); await bye(2) }
    await sleep(5000)
}
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    const out = {}
    try {
        await open(STUDIO)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Navigate', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(400)
        const box = await page.locator('canvas').first().boundingBox()
        const C = [box.x + box.width / 2, box.y + box.height / 2]
        const POSE = POSE_ENV || (FIXTURE && FIXTURE.poses.B) || await page.evaluate(() => { const c = window.__cc, V = c.camera.position.constructor; return [...c.getPosition(new V(), true).toArray(), ...c.getTarget(new V(), true).toArray()] })
        out.pose = POSE
        const pose = () => page.evaluate((p) => { window.__cc.setLookAt(...p, false); window.__cc.update(0) }, POSE)
        const pos = () => page.evaluate(() => window.__cc.camera.position.toArray())
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        for (let rep = 0; rep < 3; rep++) {
            // R1: Shift+wheel, then the right button (slide) 120 ms later
            await pose(); await page.mouse.move(...C); await sleep(400)
            await page.evaluate(sampler)
            await page.keyboard.down('Shift'); await page.mouse.wheel(0, -100); await page.keyboard.up('Shift')
            await sleep(120)
            const tPress = await page.evaluate(() => performance.now())
            await page.mouse.down({ button: 'right' }); await sleep(500); await page.mouse.up({ button: 'right' })
            const s = await page.evaluate(stopS)
            const st = s.slice(1).map((q, i) => [q[0], Math.hypot(q[1] - s[i][1], q[2] - s[i][2], q[3] - s[i][3])])
            const before = st.filter(([t]) => t < tPress).map(([, d]) => d), after = st.filter(([t]) => t >= tPress).map(([, d]) => d)
            ;(out.R1 ||= []).push({ maxFrameStepBefore: r(Math.max(...before)), maxFrameStepAfterPress: r(Math.max(...after)), framesBefore: before.length })
            // R2: Shift+wheel, then a left press+release (turn start) 120 ms later
            await pose(); await page.mouse.move(...C); await sleep(400)
            const a = await pos()
            await page.keyboard.down('Shift'); await page.mouse.wheel(0, -100); await page.keyboard.up('Shift')
            await sleep(120)
            await page.mouse.down({ button: 'left' }); await page.mouse.up({ button: 'left' }); await sleep(1800)
            const b = await pos()
            // the same notch untouched
            await pose(); await page.mouse.move(...C); await sleep(400)
            const a2 = await pos()
            await page.keyboard.down('Shift'); await page.mouse.wheel(0, -100); await page.keyboard.up('Shift'); await sleep(1800)
            const b2 = await pos()
            ;(out.R2 ||= []).push({ notchThenTurn: r(dist(a, b)), notchAlone: r(dist(a2, b2)) })
            await page.keyboard.press('Escape')
        }
        // R3: Walk (Shift+`), Shift released during the walk, Esc; then Edit, right button + W for 1 s
        await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(400)
        const fly = async () => {
            await pose(); await page.mouse.move(...C); await sleep(400)
            const a = await pos()
            await page.mouse.down({ button: 'right' }); await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW'); await page.mouse.up({ button: 'right' })
            await sleep(300)
            return r(dist(a, await pos()))
        }
        out.R3 = { flyBeforeWalk: await fly() }
        await page.mouse.move(...C)
        await page.keyboard.down('Shift'); await page.keyboard.press('Backquote'); await sleep(200); await page.keyboard.up('Shift'); await sleep(600)
        await page.keyboard.press('Escape'); await sleep(600)
        out.R3.flyAfterWalk = await fly()
        out.R3.flyAgain = await fly()
        // R4: public viewer, Free, a two-finger pinch out 10 x 100 px from a turning point FAR metres ahead
        if (!PUBLIC) out.R4 = { skipped: 'NAV_PUBLIC_URL is not set' }
        else {
            await open(PUBLIC)
            const lock = page.locator('button', { hasText: /^(Inside|Free)$/ }).first()
            for (let i = 0; i < 3; i++) { const t = (await lock.textContent().catch(() => '')).trim(); if (t === 'Free') break; await lock.click().catch(() => {}); await sleep(500) }
            out.R4 = { mode: (await lock.textContent().catch(() => '?')).trim(), turningPointM: FAR }
            const box2 = await page.locator('canvas').first().boundingBox()
            const X = box2.x + box2.width / 2, Y = box2.y + box2.height / 2
            await page.evaluate((far) => { const c = window.__cc, cm = c.camera, V = cm.position.constructor, p = cm.position.clone(), d = cm.getWorldDirection(new V()); c.setLookAt(p.x, p.y, p.z, p.x + d.x * far, p.y + d.y * far, p.z + d.z * far, false); c.update(0) }, FAR); await sleep(500)
            const cdp = await page.context().newCDPSession(page)
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
            const start = await pos(); const per = []
            for (let k = 0; k < 10; k++) {
                const p0 = await pos()
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X - 60, y: Y, id: 1 }, { x: X + 60, y: Y, id: 2 }] })
                for (let j = 1; j <= 10; j++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: X - 60 - 5 * j, y: Y, id: 1 }, { x: X + 60 + 5 * j, y: Y, id: 2 }] }); await sleep(16) }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
                await sleep(900)
                per.push(r(dist(p0, await pos())))
            }
            out.R4.perPinch = per; out.R4.total = r(dist(start, await pos())); out.R4.distanceToTurningPointNow = r(await page.evaluate(() => window.__cc.distance))
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {})
        }
    } catch (e) { out.error = String(e).slice(0, 300) }
    console.log('REVIEW1', JSON.stringify(out))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 300)); await bye(3) })
