#!/usr/bin/env node
/**
 * measure.mjs — the movement measurements of docs/architecture/MOVEMENT.md, the same scripted
 * paths before and after a change. Desktop (mouse + keys, 1440×900 DPR 2) and phone
 * (390×844 DPR 3, touch through CDP). Prints JSON; --shots <dir> keeps frames.
 *
 *   flock <lock> node scripts/movement/measure.mjs --base http://localhost:5361 --tag before --out r.json [--shots dir] [--only wheel,home,...]
 *
 * Camera facts are read back through the three.js devtools hook (rig.mjs). Start poses are set
 * by camera-controls' own setLookAt(..., false) — a visitor could reach every one of them by
 * dragging and scrolling.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from '../place/common.mjs'
import { openRoom, teleport, settled, dist3, screenOf } from './rig.mjs'

const args = parseArgs()
const base = String(args.base || 'http://localhost:5361')
const only = args.only ? new Set(String(args.only).split(',')) : null
const shots = args.shots ? path.resolve(String(args.shots)) : null
if (shots) fs.mkdirSync(shots, { recursive: true })
const want = (k) => !only || only.has(k)
const r1 = (v) => (v === null || v === undefined ? v : Math.round(v * 100) / 100)
const deg = (rad) => r1((rad * 180) / Math.PI)
const out = { tag: args.tag || 'run', base, at: new Date().toISOString() }

// MOXIR hall (place-hall venuePlan outline): x −36.4…60.4, z −54.5…54.5, floor y 0. DJ at (0, 1.2, 5.4).
const HALL = { minX: -36.4, maxX: 60.4, minZ: -54.5, maxZ: 54.5 }
const RIG_WIDTH_M = 9.4 // the truss line, x −4.6…4.8
const inside = (p) => p[0] > HALL.minX && p[0] < HALL.maxX && p[2] > HALL.minZ && p[2] < HALL.maxZ
const where = (p) => (p[1] < 0.05 ? 'under the floor' : inside(p) ? (p[1] > 11 ? 'above the roof cut' : 'inside the hall') : 'outside the hall')

const snap = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${out.tag}-${name}.png`) }) }

const run = async (label, phone) => {
    const room = await openRoom({ base, phone, settle: Number(args.settle || 12) })
    const { page, probe } = room
    const res = { renderer: room.renderer }
    const open = await probe()
    res.opening = { pos: open.pos.map(r1), target: open.target.map(r1), distance: r1(open.distance), fov: open.fov }
    const cx = open.w / 2
    const cy = open.h / 2
    const goto = async (pos, target) => { await teleport(page, pos, target); return (await settled(probe, { max: 3000 })).state }
    const OPEN_POS = open.pos
    const rigPx = (s) => Math.round((RIG_WIDTH_M * (s.h / 2) / Math.tan((s.fov * Math.PI) / 360)) / Math.max(0.01, dist3(s.pos, [0, 4.5, 5])))

    // ---------------------------------------------------------------- input probes
    const wheel = async (n, dy = 100) => {
        await page.mouse.move(cx, cy)
        for (let i = 0; i < n; i += 1) { await page.mouse.wheel(0, dy); await page.waitForTimeout(40) }
        return (await settled(probe, { max: 4000 })).state
    }
    const IN = -100
    const OUT = 100
    const wheelAt = async (x, y, n, dy = IN) => {
        await page.mouse.move(x, y)
        for (let i = 0; i < n; i += 1) { await page.mouse.wheel(0, dy); await page.waitForTimeout(40) }
        return (await settled(probe, { max: 4000 })).state
    }
    const drag = async (x0, y0, x1, y1, button = 'left') => {
        await page.mouse.move(x0, y0)
        await page.mouse.down({ button })
        for (let i = 1; i <= 12; i += 1) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await page.waitForTimeout(16) }
        await page.mouse.up({ button })
        return (await settled(probe, { max: 4000 })).state
    }

    if (!phone) {
        if (want('wheel')) {
            const rows = []
            for (const [name, pos, target] of [
                ['opening', OPEN_POS, open.target],
                ['close to the DJ table', [0.6, 1.9, 8.5], [0, 1.2, 5.4]],
                ['pressed to a wall', [30, 6, 54.0], [30, 6, 50]],
                ['far out', [80, 40, 120], [0, 5, 0]]
            ]) {
                const s0 = await goto(pos, target)
                const s1 = await wheel(1, IN)
                const s2 = await wheel(1, OUT)
                rows.push({ name, distance: r1(s0.distance), afterOneNotchIn: r1(s1.distance), afterOneNotchInThenOut: r1(s2.distance), metresPerNotchIn: r1(s0.distance - s1.distance), cameraMovedM: r1(dist3(s0.pos, s1.pos)) })
            }
            res.wheelNotch = rows
        }
        if (want('travel')) {
            // From the door end of the hall toward the DJ table with the wheel, the pointer ON the
            // table: notches until within 12 m, and until as close as the viewer lets us come.
            const table = [0, 1.2, 5.6]
            const s0 = await goto([0, 1.7, 52], [0, 3, 5.4])
            const at = await screenOf(page, table)
            let s = s0
            let n = 0
            let n12 = null
            const t0 = Date.now()
            while (n < 120) {
                s = await wheelAt(at[0], at[1], 1, IN); n += 1
                if (n12 === null && dist3(s.pos, table) <= 12) n12 = n
                if (dist3(s.pos, table) < 0.5) break
            }
            res.doorToDj = { startM: r1(dist3(s0.pos, table)), notchesTo12m: n12, notchesTo0p5m: dist3(s.pos, table) < 0.5 ? n : null, closestM: r1(dist3(s.pos, table)), notchesRun: n, wallSeconds: r1((Date.now() - t0) / 1000) }
            // Back out from close to the table to the opening distance.
            const c0 = await goto([0.3, 1.5, 6.2], [0, 1.2, 5.4])
            let c = c0
            let m = 0
            while (c.distance < 15 && m < 200) { c = await wheelAt(cx, cy, 1, OUT); m += 1 }
            res.closeToOpeningByWheel = { startDistanceM: r1(c0.distance), notches: m, reachedM: r1(c.distance) }
        }
        if (want('zoomto')) {
            // Scroll in with the pointer on a thing until it stops: how close does the camera get to it?
            // (the thing's own centre: a lamp head is ~0.3 m, a truss tube ~0.1 m, the wall is a plane)
            const things = [
                ['DJ table', [0, 1.2, 5.6], [0, 1.7, 30]],
                ['a lamp on the truss', [1.207, 5.533, 4.8], [0, 3, 30]],
                ['the far wall', [10, 6, -54.4], [0, 3, 30]],
                ['a column', [-36, 4, 12], [0, 3, 30]]
            ]
            const rows = []
            for (const [name, pt, from] of things) {
                await goto(from, pt)
                const at = await screenOf(page, pt)
                let s
                let n = 0
                let prev = Infinity
                let still = 0
                while (n < 160 && still < 3) {
                    s = await wheelAt(at[0], at[1], 1, IN); n += 1
                    const d = dist3(s.pos, pt)
                    still = Math.abs(prev - d) < 0.003 ? still + 1 : 0
                    prev = d
                }
                rows.push({ name, notches: n, closestM: r1(dist3(s.pos, pt)), pivotDistanceM: r1(s.distance) })
                await snap(page, `zoomto-${name.replace(/\W+/g, '-')}`)
                // ...and home again: the same trip out.
                const t0 = Date.now()
                await page.keyboard.press('Home')
                const back = await settled(probe, { max: 6000 })
                rows[rows.length - 1].homeSeconds = r1((Date.now() - t0) / 1000 - 0.3)
                rows[rows.length - 1].homeEndedAtOpening = dist3(back.state.pos, OPEN_POS) < 0.5
            }
            res.zoomTo = rows
        }
        if (want('drag')) {
            const s0 = await goto(OPEN_POS, open.target)
            const a = await drag(cx, cy, cx + 400, cy)
            const b = await goto(OPEN_POS, open.target)
            const c = await drag(cx, cy, cx, cy + 300)
            const d0 = await goto(OPEN_POS, open.target)
            const d = await drag(cx, cy, cx + 200, cy, 'right')
            const far0 = await goto([80, 40, 120], [0, 5, 0])
            const far = await drag(cx, cy, cx + 200, cy, 'right')
            res.drag = {
                orbit400pxRightDegrees: deg(a.azimuth - s0.azimuth),
                orbit300pxDownDegrees: deg(c.polar - b.polar),
                pan200pxAtOpeningMetres: r1(dist3(d.target, d0.target)),
                pan200pxFarOutMetres: r1(dist3(far.target, far0.target)),
                farOutTargetAfterPan: far.target.map(r1)
            }
        }
        if (want('keys')) {
            const s0 = await goto(OPEN_POS, open.target)
            const rows = {}
            for (const k of ['w', 'ArrowUp', 'a', 'q', 'e']) {
                await page.mouse.move(cx, cy)
                await page.keyboard.down(k); await page.waitForTimeout(600); await page.keyboard.up(k)
                const s = (await settled(probe, { max: 2000 })).state
                rows[k] = r1(dist3(s.pos, s0.pos))
                await goto(OPEN_POS, open.target)
            }
            res.keyMovesCameraMetres = rows
        }
        if (want('ui')) {
            res.homeControls = await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')]
                .map((b) => `${b.innerText || ''}|${b.getAttribute('aria-label') || ''}|${b.title || ''}`)
                .filter((t) => /home|reset|frame|normal|back|opening/i.test(t)))
            res.buttons44 = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => {
                const r = b.getBoundingClientRect(); return `${(b.innerText || b.title || b.getAttribute('aria-label') || '').trim().slice(0, 14)}:${Math.round(r.width)}x${Math.round(r.height)}`
            }))
        }
        if (want('home')) {
            // How do you get back to the opening view from a bad place? Try every gesture a visitor
            // could try: Home, Escape, a double-click on empty space, the F key, and the view row's Floor.
            const stuck = [
                ['far outside', [110, 55, 130], [0, 5, 0]],
                ['inside a wall', [60.2, 4, 10], [60.5, 4, 10.5]],
                ['under the floor', [10, -2.5, 30], [10, -3, 20]],
                ['top view', [0, 80, 0.5], [0, 0, 0]],
                ['pressed against a column', [-36, 1.7, 6.2], [-36.2, 1.7, 6]]
            ]
            const rows = []
            for (const [name, pos, target] of stuck) {
                const row = { state: name }
                const s0 = await goto(pos, target)
                row.start = { where: where(s0.pos), distanceM: r1(s0.distance), maxDistanceM: r1(s0.maxDistance) }
                await snap(page, `stuck-${name.replace(/\W+/g, '-')}`)
                for (const [gesture, act] of [
                    ['Home', async () => { await page.mouse.move(cx, cy); await page.keyboard.press('Home') }],
                    ['Escape', async () => { await page.keyboard.press('Escape') }],
                    ['double-click', async () => { await page.mouse.dblclick(cx, cy - 200) }],
                    ['5 wheel notches out', async () => { await wheel(5, OUT) }]
                ]) {
                    const s1 = await goto(pos, target)
                    await act()
                    const s2 = (await settled(probe, { max: 4000 })).state
                    row[gesture] = { moved: r1(dist3(s2.pos, s1.pos)), distToOpeningM: r1(dist3(s2.pos, OPEN_POS)), where: where(s2.pos), endedAtOpening: dist3(s2.pos, OPEN_POS) < 0.5 }
                }
                rows.push(row)
            }
            res.stuck = rows
            // The one control that exists: the view row. Time to the Floor view from far outside, and where that ends.
            await goto([110, 55, 130], [0, 5, 0])
            const t0 = Date.now()
            await page.keyboard.press('1')
            const f = await settled(probe, { max: 5000 })
            res.floorPresetFromFarOutside = { seconds: r1((Date.now() - t0) / 1000), pos: f.state.pos.map(r1), distToOpeningM: r1(dist3(f.state.pos, OPEN_POS)) }
        }
        if (want('far')) {
            const rows = []
            for (const [name, pos, target] of [['from the audience side', [0, 30, 80], [0, 5, 0]], ['from the side', [140, 30, 5], [0, 5, 0]]]) {
                await goto(pos, target)
                const s = await wheel(60, OUT)
                rows.push({ name, maxDistanceReachedM: r1(s.distance), camera: s.pos.map(r1), where: where(s.pos), rigWidthPx: rigPx(s) })
                await snap(page, `far-${name.replace(/\W+/g, '-')}`)
            }
            res.farOut = rows
        }
        const fps = await page.evaluate(() => new Promise((resolve) => { let n = 0; const t = performance.now(); const f = () => { n += 1; if (performance.now() - t < 3000) requestAnimationFrame(f); else resolve(Math.round((n / 3) * 10) / 10) }; requestAnimationFrame(f) }))
        res.fpsOpening = (await goto(OPEN_POS, open.target), fps)
    } else {
        // ------------------------------------------------------------------ phone, real touch through CDP
        const cdp = await room.context.newCDPSession(page)
        const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
        const gesture = async (from, to, steps = 14) => {
            await touch('touchStart', from)
            for (let i = 1; i <= steps; i += 1) {
                await touch('touchMove', from.map((p, k) => [p[0] + ((to[k][0] - p[0]) * i) / steps, p[1] + ((to[k][1] - p[1]) * i) / steps]))
                await page.waitForTimeout(16)
            }
            await touch('touchEnd', [])
            return (await settled(probe, { max: 4000 })).state
        }
        const s0 = await goto(OPEN_POS, open.target)
        const one = await gesture([[100, 500]], [[300, 500]])
        res.oneFingerDrag200px = { azimuthDegrees: deg(one.azimuth - s0.azimuth) }
        const p0 = await goto(OPEN_POS, open.target)
        const pinch = await gesture([[150, 420], [240, 420]], [[70, 420], [320, 420]])
        res.pinchSpread = { fromPx: 90, toPx: 250, distanceBefore: r1(p0.distance), after: r1(pinch.distance), factor: r1(pinch.distance / p0.distance) }
        const t0 = await goto(OPEN_POS, open.target)
        const two = await gesture([[150, 420], [240, 420]], [[250, 420], [340, 420]])
        res.twoFingerSlide100px = { targetMovedM: r1(dist3(two.target, t0.target)), distanceChange: r1(two.distance - t0.distance), azimuthDegrees: deg(two.azimuth - t0.azimuth) }
        const tw0 = await goto(OPEN_POS, open.target)
        const twist = await gesture([[150, 420], [240, 420]], [[195, 375], [195, 465]])
        res.twoFingerTwist90deg = { azimuthDegrees: deg(twist.azimuth - tw0.azimuth), polarDegrees: deg(twist.polar - tw0.polar) }
        // Home by touch: a double tap on empty space.
        await goto([110, 55, 130], [0, 5, 0])
        for (let i = 0; i < 2; i += 1) { await touch('touchStart', [[195, 300]]); await touch('touchEnd', []); await page.waitForTimeout(90) }
        const h = (await settled(probe, { max: 4000 })).state
        res.doubleTapFromFarOutside = { distToOpeningM: r1(dist3(h.pos, OPEN_POS)), endedAtOpening: dist3(h.pos, OPEN_POS) < 0.5 }
        res.tapTargets = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => {
            const r = b.getBoundingClientRect(); return `${(b.innerText || b.title || b.getAttribute('aria-label') || '').trim().slice(0, 14)}:${Math.round(r.width)}x${Math.round(r.height)}`
        }))
        await goto(OPEN_POS, open.target)
        await snap(page, 'phone-opening')
    }
    res.errors = room.errors.slice(0, 5)
    await room.browser.close()
    return res
}

out.desktop = await run('desktop', false)
if (want('phone')) out.phone = await run('phone', true)
const text = JSON.stringify(out, null, 2)
if (args.out) fs.writeFileSync(path.resolve(String(args.out)), text)
console.log(text)
