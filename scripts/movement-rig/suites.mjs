/**
 * suites.mjs — the trials. Each one resets the walker to a known pose, starts
 * the probe's recording, drives real browser input (CDP key / mouse / wheel /
 * touch events, which arrive isTrusted) or — for look counts only — a DOM
 * mousemove carrying exact movementX/Y, stops, and turns the frame log into
 * numbers with metrics.mjs.
 *
 * Nothing here knows how the walker is implemented. It reads the camera the
 * renderer drew with; the only app contract it relies on is:
 *   - the public viewer at /<space>/p/<project> with a "Walk / Fly" button,
 *   - window.__diiWalkerRef (dev builds) to reset a pose between trials,
 *   - a "Fly" toggle (.live-scene-fly-btn, or the F key) and, on a phone,
 *     the "Ascend"/"Descend" buttons.
 * If a branch breaks one of those, the trial says so in its result instead of
 * producing a number.
 */
import fs from 'node:fs'
import path from 'node:path'

import { PROBE_SOURCE } from './probe.mjs'
import {
    derive, pressMetrics, frameStats, bob, inputToFrame, settleFrames, sensitivity,
    between, median, quantile
} from './metrics.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)))

// ── page plumbing ────────────────────────────────────────────────────────────

export async function openWalker(context, base, room, { phone = false, say, reuse = null }) {
    // Reusing the page (a fresh navigation) keeps the same browser window —
    // a new page can open in a new, differently sized window.
    const page = reuse || await context.newPage()
    const errors = reuse?.__rigErrors || []
    if (!reuse) {
        page.__rigErrors = errors
        page.on('pageerror', (e) => errors.push(String(e?.message || e)))
        await page.addInitScript(PROBE_SOURCE)
    }
    const url = `${base}/${room.space}/p/${room.project}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const walk = page.getByRole('button', { name: 'Walk / Fly' })
    await walk.waitFor({ state: 'visible', timeout: 60000 })
    // Let the room's assets arrive before walking (the hall is a 60 MB GLB).
    await page.waitForFunction(() => window.__rig && window.__rig.renderers > 0, null, { timeout: 60000 })
    await sleep(1500)
    if (phone) await walk.tap(); else await walk.click()
    await page.waitForFunction(() => window.__diiWalkerRef && window.__diiWalkerRef.current, null, { timeout: 30000 })
        .catch(() => { throw new Error('walk mode opened but window.__diiWalkerRef never appeared (is this a dev build?)') })
    await page.waitForFunction(() => {
        const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth - a.clientWidth)[0]
        return c && c.clientWidth > 200
    }, null, { timeout: 30000 })
    // Settle: shader compile, first-visit hint, arrival glide.
    await sleep(phone ? 3000 : 2500)
    const info = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2')
        const d = c && c.getExtension('WEBGL_debug_renderer_info')
        return {
            renderer: d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown',
            dpr: devicePixelRatio, w: innerWidth, h: innerHeight,
            coarse: matchMedia('(pointer: coarse)').matches
        }
    })
    // A software renderer burns the CPU (it froze this machine on 09-27) and
    // measures nothing a visitor sees. Stop rather than run on it.
    if (/swiftshader|llvmpipe|softpipe|software/i.test(info.renderer) || info.renderer === 'unknown') {
        throw new Error(`WebGL is not on a hardware GPU (${info.renderer}) — refusing to run`)
    }
    say?.(`  [open] ${url} ${info.w}x${info.h}@${info.dpr} ${info.coarse ? 'touch' : 'mouse'} — ${info.renderer}`)
    return { page, errors, info, url }
}

const canvasCenter = async (page) => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth - a.clientWidth)[0]
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
})

const setPose = (page, pose) => page.evaluate((p) => window.__rig.setPose(p), pose)
const start = (page) => page.evaluate(() => window.__rig.start())
const stop = async (page) => {
    const log = await page.evaluate(() => window.__rig.stop())
    return { rows: derive(log.frames), frames: log.frames, events: log.events }
}
const keyTimes = (events, key, type) => events.filter((e) => e.kind === 'key' && e.type === type && e.key.toLowerCase() === key.toLowerCase()).map((e) => e.t)

async function resetAndSettle(page, pose, ms = 900) {
    // Let any velocity from the last trial die before placing the walker.
    await sleep(ms)
    const ok = await setPose(page, pose)
    if (!ok) throw new Error('cannot reset pose: window.__diiWalkerRef missing')
    await sleep(400)
    await setPose(page, pose)
    await sleep(200)
}

async function lock(page, { prime = true } = {}) {
    const c = await canvasCenter(page)
    await page.mouse.click(c.x, c.y)
    await sleep(300)
    // The walker ignores look input for a while after it first SEES the lock
    // (its engage-settle window starts at the first locked mousemove, not at
    // the click). Prime it with one still move so a measurement starts after.
    if (prime) { await page.evaluate(() => window.__rig.look(0, 0)); await sleep(450) }
    return page.evaluate(() => !!document.pointerLockElement)
}
const unlock = (page) => page.evaluate(() => document.exitPointerLock())

/** Hold key(s) for holdMs, record through release + tailMs. */
async function press(page, pose, keys, holdMs, tailMs = 2200) {
    await resetAndSettle(page, pose)
    await start(page)
    await sleep(250)
    for (const k of keys) await page.keyboard.down(k)
    await sleep(holdMs)
    for (const k of keys) await page.keyboard.up(k)
    await sleep(tailMs)
    return stop(page)
}

function pressResult(log, key, opts) {
    const down = keyTimes(log.events, key === 'Space' ? ' ' : key, 'keydown')[0]
    const up = keyTimes(log.events, key === 'Space' ? ' ' : key, 'keyup')[0]
    if (down === undefined || up === undefined) return { error: `no ${key} key events seen by the page` }
    const m = pressMetrics(log.rows, down, up, opts)
    const hold = between(log.rows, down, up)
    const vertical = opts?.axis === 'y'
    const travelled = hold.reduce((s, r) => s + (vertical ? Math.abs(r.vy * r.dt / 1000) || 0 : (Number.isFinite(r.step) ? r.step : 0)), 0)
    const b = vertical ? { p2pCm: null, hz: null } : bob(log.rows, up - 700, up)
    return {
        vmax: round(m.vmax), t10ms: round(m.t10, 0), t50ms: round(m.t50, 0), t90ms: round(m.t90, 0),
        rampShape: round(m.rampShape), stopMs: round(m.stopMs, 0), stopDistM: round(m.stopDist, 3),
        driftAfterRestM: round(m.driftAfterRest, 4), stepCvPct: round(m.stepCvPct, 1), speedCvPct: round(m.speedCvPct, 1),
        holdTravelM: round(travelled, 3), bobP2pCm: round(b.p2pCm, 2), bobHz: round(b.hz, 2),
        frames: log.rows.length
    }
}

// ── desktop: movement ────────────────────────────────────────────────────────

export async function movementSuite(page, room, { say }) {
    const out = {}
    const P = room.spawn
    say('  [move] W forward 3 s')
    out.forward = pressResult(await press(page, P, ['w'], 3000), 'w')
    say('  [move] D strafe 3 s')
    out.strafe = pressResult(await press(page, room.columnsView || P, ['d'], 3000), 'd')
    say('  [move] S back 2 s')
    out.back = pressResult(await press(page, P, ['s'], 2000), 's', { plateauMs: 500 })
    say('  [move] W+D diagonal 3 s')
    const diag = await press(page, P, ['w', 'd'], 3000)
    out.diagonal = pressResult(diag, 'w')
    out.diagonalOverStraight = out.forward.vmax ? round(out.diagonal.vmax / out.forward.vmax, 3) : null

    say('  [move] ArrowLeft turn 1.5 s')
    const turn = await press(page, P, ['ArrowLeft'], 1500, 800)
    {
        const d = keyTimes(turn.events, 'ArrowLeft', 'keydown')[0]
        const u = keyTimes(turn.events, 'ArrowLeft', 'keyup')[0]
        const seg = between(turn.rows, u - 700, u)
        const rate = seg.length > 2 ? (seg[seg.length - 1].yawDeg - seg[0].yawDeg) / ((seg[seg.length - 1].t - seg[0].t) / 1000) : null
        const after = between(turn.rows, u, u + 800)
        out.arrowTurn = {
            degPerSec: round(rate, 1),
            t90ms: round(inputToFrame(turn.rows, [d], (r) => r.yawDeg, 0.01)[0], 0),
            overshootAfterReleaseDeg: after.length ? round(Math.abs(after[after.length - 1].yawDeg - after[0].yawDeg), 2) : null
        }
    }

    if (room.solid) {
        // Walk at a solid thing (the Gate / the crowd barrier) from 3 m away.
        // A venue has walls: does the walker stop at it or pass through?
        say(`  [move] walk into ${room.solid.name}`)
        const s = room.solid
        const log = await press(page, { x: s.x, z: s.planeZ + 3, yaw: Math.PI, pitch: 0, altY: 1.6 }, ['w'], 1500, 600)
        const minZ = Math.min(...log.rows.map((r) => r.z))
        out.solid = { name: s.name, planeZ: s.planeZ, closestZ: round(minZ, 2), passedThroughM: round(Math.max(0, s.planeZ - minZ), 2) }
    }

    say('  [move] keyboard latency, 12 taps')
    await resetAndSettle(page, P)
    await start(page)
    for (let i = 0; i < 12; i++) {
        await page.keyboard.down('w'); await sleep(90); await page.keyboard.up('w'); await sleep(420 + (i % 3) * 37)
    }
    await sleep(300)
    {
        const log = await stop(page)
        const downs = keyTimes(log.events, 'w', 'keydown')
        const lat = inputToFrame(log.rows, downs, (r) => r.x + r.z, 1e-5)
        out.keyLatency = { n: lat.length, p50ms: round(median(lat), 1), p95ms: round(quantile(lat, 0.95), 1) }
    }
    return out
}

// ── desktop: look ────────────────────────────────────────────────────────────

async function yawAfter(page, fn, waitMs = 350) {
    await start(page)
    await sleep(120)
    await fn()
    await sleep(waitMs)
    const log = await stop(page)
    const pre = log.rows.find((r) => r.t >= 0)
    const last = log.rows[log.rows.length - 1]
    return { dYaw: last.yawDeg - log.rows[0].yawDeg, dPitch: last.pitchDeg - log.rows[0].pitchDeg, log, pre }
}

export async function lookSuite(page, room, { say, reopen }) {
    const out = { notes: [] }
    const P = room.spawn
    await resetAndSettle(page, P)
    const locked = await lock(page)
    out.pointerLockGranted = locked
    if (!locked) { out.notes.push('pointer lock not granted — look numbers below are the drag-look fallback'); return out }

    // Gain: 1000 counts in 20 events of 50, one per frame.
    await setPose(page, P)
    const g = await yawAfter(page, () => page.evaluate(() => window.__rig.lookPaced(-1000, 0, 20)))
    const degPerCount = Math.abs(g.dYaw) / 1000
    out.gain = { ...Object.fromEntries(Object.entries(sensitivity(degPerCount)).map(([k, v]) => [k, round(v, 4)])) }
    say(`  [look] ${round(degPerCount, 4)} deg/count → ${round(out.gain.cmPer360, 2)} cm/360 @800 DPI`)

    // Same 200 counts (< 180° so a one-frame jump cannot alias), delivered
    // fast and slow. A linear, unsmoothed look turns the same angle whatever
    // the pace; acceleration or a dead-zone shows up as a ratio ≠ 1.
    out.linearity = {}
    for (const [label, events] of [['1x200', 1], ['10x20', 10], ['40x5', 40], ['100x2', 100]]) {
        if (!(await page.evaluate(() => !!document.pointerLockElement))) await lock(page)
        await setPose(page, P)
        const r = await yawAfter(page, () => page.evaluate((n) => window.__rig.lookPaced(-200, 0, n), events), 400)
        out.linearity[label] = { deg: round(Math.abs(r.dYaw), 3), ratio: round(Math.abs(r.dYaw) / (degPerCount * 200), 4), lockedAfter: await page.evaluate(() => !!document.pointerLockElement) }
    }
    // What a person does: click into the view and immediately look. How long
    // is look dead after the lock engages?
    await unlock(page); await sleep(1200) // Chrome refuses a re-lock right after an exit
    page = await reopen()
    await resetAndSettle(page, P)
    {
        const c = await canvasCenter(page)
        await page.mouse.click(c.x, c.y)
        await sleep(60)
        await start(page)
        const t0 = await page.evaluate(() => performance.now())
        await page.evaluate(() => window.__rig.lookPaced(-600, 0, 60))
        await sleep(200)
        const log = await stop(page)
        const moved = log.rows.find((r) => r.t > t0 && Math.abs(r.yawDeg - log.rows[0].yawDeg) > 0.01)
        out.lookDeadAfterEngageMs = moved ? round(moved.t - t0, 0) : null
        out.lookLostAfterEngageDeg = round(600 * degPerCount - Math.abs(log.rows[log.rows.length - 1].yawDeg - log.rows[0].yawDeg), 1)
    }

    // Look smoothing / latency: one 200-count event → frames until settled.
    if (!(await page.evaluate(() => !!document.pointerLockElement))) await lock(page)
    await setPose(page, P)
    {
        await start(page); await sleep(150)
        const t0 = await page.evaluate(() => { const t = performance.now(); window.__rig.look(-200, 0); return t })
        await sleep(400)
        const log = await stop(page)
        out.settleFrames = settleFrames(log.rows, t0, 0.02)
    }

    // Trusted path: CDP mouse moves (through the browser's input pipeline).
    // Its gain must match the DOM path, and its timestamps give latency.
    if (!(await page.evaluate(() => !!document.pointerLockElement))) await lock(page)
    await setPose(page, P)
    {
        const c = await canvasCenter(page)
        await start(page); await sleep(150)
        let x = c.x
        for (let i = 0; i < 20; i++) {
            x += (i % 2 ? -1 : 1) * 30 + 6 // net +6 px per event, 30 px swings
            await page.mouse.move(x, c.y)
            await sleep(47 + (i % 4) * 11)
        }
        await sleep(300)
        const log = await stop(page)
        const moves = log.events.filter((e) => e.kind === 'mouse' && e.trusted && e.locked)
        const sumX = moves.reduce((s, e) => s + e.mx, 0)
        const dYaw = log.rows[log.rows.length - 1].yawDeg - log.rows[0].yawDeg
        const lat = inputToFrame(log.rows, moves.map((e) => e.t), (r) => r.yawDeg, 1e-4)
        out.trusted = {
            events: moves.length, sumMovementX: sumX,
            degPerCount: sumX ? round(Math.abs(dYaw / sumX), 4) : null,
            latencyP50ms: round(median(lat), 1), latencyP95ms: round(quantile(lat, 0.95), 1)
        }
    }

    // Pitch limits.
    if (!(await page.evaluate(() => !!document.pointerLockElement))) await lock(page)
    await setPose(page, P)
    {
        const up = await yawAfter(page, () => page.evaluate(() => { for (let i = 0; i < 40; i++) window.__rig.look(0, -400) }))
        const down = await yawAfter(page, () => page.evaluate(() => { for (let i = 0; i < 80; i++) window.__rig.look(0, 400) }))
        const lastUp = up.log.rows[up.log.rows.length - 1].pitchDeg
        const lastDown = down.log.rows[down.log.rows.length - 1].pitchDeg
        out.pitchLimitDeg = { up: round(lastUp, 1), down: round(lastDown, 1) }
    }

    // Slow sweep: the way you look across a hall — 1 to 3 counts per frame
    // for 2 s. Does the view keep turning?
    if (!(await page.evaluate(() => !!document.pointerLockElement))) await lock(page)
    await setPose(page, P)
    {
        const counts = 240, events = 120
        const r = await yawAfter(page, () => page.evaluate(({ c, n }) => window.__rig.lookPaced(-c, 0, n), { c: counts, n: events }), 400)
        const lockedAfter = await page.evaluate(() => !!document.pointerLockElement)
        out.slowSweep = {
            countsPerFrame: counts / events,
            expectedDeg: round(counts * degPerCount, 2),
            turnedDeg: round(Math.abs(r.dYaw), 2),
            fractionTurned: round(Math.abs(r.dYaw) / (counts * degPerCount), 3),
            lockedAfter
        }
    }

    // Wheel: trackpad horizontal = turn, vertical = dolly.
    await unlock(page); await sleep(300)
    page = await reopen() // a lock the walker marked broken stays broken; start clean
    await resetAndSettle(page, P)
    {
        const c = await canvasCenter(page)
        await page.mouse.move(c.x, c.y)
        const r = await yawAfter(page, async () => { for (let i = 0; i < 10; i++) { await page.mouse.wheel(20, 0); await sleep(16) } })
        out.wheelTurnDegPerPx = round(Math.abs(r.dYaw) / 200, 4)
        await setPose(page, P)
        await start(page); await sleep(100)
        for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(16) }
        await sleep(300)
        const log = await stop(page)
        const a = log.rows[0], b = log.rows[log.rows.length - 1]
        out.wheelDollyMPerPx = round(Math.hypot(b.x - a.x, b.z - a.z) / 500, 4)
        const steps = log.rows.map((q) => q.step).filter((s) => s > 1e-4)
        out.wheelDollyLargestFrameStepM = round(Math.max(0, ...steps), 3)
    }

    // Drag-look fallback: pointer lock denied (Wayland / after an Esc).
    await page.evaluate(() => {
        Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('rig: lock denied')) }
    })
    await setPose(page, P)
    {
        const c = await canvasCenter(page)
        const r = await yawAfter(page, async () => {
            await page.mouse.move(c.x, c.y); await page.mouse.down()
            for (let i = 1; i <= 20; i++) { await page.mouse.move(c.x - i * 10, c.y); await sleep(16) }
            await page.mouse.up()
        })
        out.dragLookDegPerPx = round(Math.abs(r.dYaw) / 200, 4)
    }
    return { out, page }
}

// ── desktop: turning while walking ───────────────────────────────────────────

export async function turnWhileWalking(page, room, degPerCount) {
    await resetAndSettle(page, room.spawn)
    const locked = await lock(page)
    if (!locked) return { error: 'no pointer lock' }
    await setPose(page, room.spawn)
    await start(page)
    await page.keyboard.down('w')
    await sleep(1500)
    const t0 = await page.evaluate(() => performance.now())
    const counts = Math.round(90 / degPerCount)
    await page.evaluate((c) => window.__rig.lookPaced(-c, 0, 30), counts)
    await sleep(900)
    await page.keyboard.up('w')
    await sleep(1500)
    const log = await stop(page)
    // Heading vs direction of travel, per frame, during and after the turn.
    const rows = log.rows
    const lag = []
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i], p = rows[i - 1]
        if (r.t < t0 || r.t > t0 + 1200 || !(r.step > 1e-4)) continue
        const travel = Math.atan2(r.x - p.x, r.z - p.z) * 180 / Math.PI
        let d = travel - ((r.yawDeg % 360) + 360) % 360
        d = ((d + 540) % 360) - 180
        lag.push(Math.abs(d))
    }
    const during = between(rows, t0, t0 + 600).map((r) => r.vh).filter(Number.isFinite)
    const before = between(rows, t0 - 500, t0).map((r) => r.vh).filter(Number.isFinite)
    await unlock(page)
    return {
        turnDeg: 90,
        speedBefore: round(median(before)),
        minSpeedDuringTurn: round(Math.min(...during)),
        maxHeadingVsTravelDeg: round(Math.max(0, ...lag), 1)
    }
}

// ── fly ──────────────────────────────────────────────────────────────────────

async function toggleFly(page, want) {
    const isFly = () => page.evaluate(() => !!document.querySelector('.live-scene-fly-btn.active'))
    if ((await isFly()) === want) return true
    const btn = page.locator('.live-scene-fly-btn')
    if (await btn.count()) await btn.first().click({ force: true })
    else await page.keyboard.press('f')
    await sleep(300)
    return (await isFly()) === want
}

export async function flySuite(page, room, { say }) {
    const out = {}
    const P = room.spawn
    if (!(await toggleFly(page, true))) return { error: 'could not enter fly mode' }
    say('  [fly] Space up 1.5 s, C down 1.5 s')
    out.up = pressResult(await press(page, P, ['Space'], 1500, 1500), 'Space', { axis: 'y', plateauMs: 500 })
    out.down = pressResult(await press(page, { ...P, altY: 8 }, ['c'], 1500, 1500), 'c', { axis: 'y', plateauMs: 500 })
    out.flyForward = pressResult(await press(page, P, ['w'], 2500), 'w')
    // Hold "down" from eye height for 3 s: where does the camera end up?
    // Anything below 0 is under the floor.
    {
        const log = await press(page, P, ['c'], 3000, 600)
        out.lowestCameraM = round(Math.min(...log.rows.map((r) => r.y)), 2)
    }
    // Up to the trusses and back down to the floor, then leave fly mode in
    // the air: how does the walker come back to eye height?
    say('  [fly] to the truss and back; leave fly mode in the air')
    await resetAndSettle(page, P)
    await start(page)
    const target = room.trussY || 6
    await page.keyboard.down(' ')
    const t0 = Date.now()
    while (Date.now() - t0 < 8000) {
        const y = await page.evaluate(() => window.__rig.readWalker()?.altY)
        if (y >= target) break
        await sleep(30)
    }
    await page.keyboard.up(' ')
    await sleep(700)
    await toggleFly(page, false)
    const tLeave = await page.evaluate(() => performance.now())
    await sleep(3000)
    const log = await stop(page)
    const eye = 1.6
    const back = log.rows.find((r) => r.t > tLeave && Math.abs(r.y - eye) < 0.02)
    const peak = Math.max(...log.rows.map((r) => r.y))
    const fall = between(log.rows, tLeave, tLeave + 3000)
    const maxDrop = Math.max(0, ...fall.map((r) => -r.vy).filter(Number.isFinite))
    out.leaveFlyInAir = {
        fromHeightM: round(peak, 2),
        backToEyeMs: back ? round(back.t - tLeave, 0) : null,
        maxDescentMps: round(maxDrop, 2),
        shape: 'see frames: exponential lerp reads as floating down, not falling'
    }
    return out
}

// ── frame pacing & frame-rate independence ───────────────────────────────────

export async function pacingSuite(page, room, cdp, { say }) {
    const out = {}
    const P = room.spawn
    await resetAndSettle(page, P)
    await start(page); await sleep(4000)
    out.idle = frameStats((await stop(page)).rows.map((r) => r.t))

    await resetAndSettle(page, P)
    await start(page)
    await page.keyboard.down('w'); await sleep(1500); await page.keyboard.down('d'); await sleep(1500)
    await page.keyboard.up('w'); await sleep(1500); await page.keyboard.up('d'); await sleep(200)
    out.moving = frameStats((await stop(page)).rows.map((r) => r.t))
    for (const k of ['idle', 'moving']) for (const f of ['fps', 'p50', 'p95', 'p99', 'max', 'hitchPct']) out[k][f] = round(out[k][f], 2)

    say('  [pacing] same W run at ~30 fps (25 ms of main-thread work per frame) and CPU ×4')
    const base = pressResult(await press(page, P, ['w'], 3000), 'w')
    await page.evaluate(() => { window.__rig.spinMs = 25 })
    const slow = pressResult(await press(page, P, ['w'], 3000), 'w')
    const slowFps = await page.evaluate(() => {
        const f = window.__rig.frames; return f.length > 2 ? 1000 * (f.length - 1) / (f[f.length - 1].t - f[0].t) : null
    })
    await page.evaluate(() => { window.__rig.spinMs = 0 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const thr = pressResult(await press(page, P, ['w'], 3000), 'w')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const pick = (r) => ({ vmax: r.vmax, t90ms: r.t90ms, stopMs: r.stopMs, stopDistM: r.stopDistM, holdTravelM: r.holdTravelM, stepCvPct: r.stepCvPct })
    out.frameRateIndependence = { native: pick(base), spin25ms: { ...pick(slow), fps: round(slowFps, 1) }, cpuX4: pick(thr) }
    return out
}

// ── phone ────────────────────────────────────────────────────────────────────

async function touch(cdp, type, points) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 8, radiusY: 8, force: 1 })) })
}

export async function phoneSuite(page, room, cdp, { say, eye }) {
    const out = {}
    const P = room.spawn
    const vw = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    const joy = { x: Math.round(vw.w * 0.22), y: Math.round(vw.h * 0.78) }
    const joyForward = async (holdMs, tail = 2200) => {
        await resetAndSettle(page, P)
        await start(page); await sleep(250)
        const t0 = await page.evaluate(() => performance.now())
        await touch(cdp, 'touchStart', [{ ...joy, id: 1 }])
        for (let i = 1; i <= 5; i++) { await touch(cdp, 'touchMove', [{ x: joy.x, y: joy.y - i * 11, id: 1 }]); await sleep(16) }
        await sleep(holdMs)
        const t1 = await page.evaluate(() => performance.now())
        await touch(cdp, 'touchEnd', [])
        await sleep(tail)
        const log = await stop(page)
        return { log, t0, t1 }
    }
    say('  [phone] joystick full forward 3 s')
    if (eye) await eye.begin('phone-joystick-walk')
    const j = await joyForward(3000)
    if (eye) await eye.end()
    const m = pressMetrics(j.log.rows, j.t0, j.t1)
    out.joystickForward = { vmax: round(m.vmax), t90ms: round(m.t90, 0), stopMs: round(m.stopMs, 0), stopDistM: round(m.stopDist, 3), stepCvPct: round(m.stepCvPct, 1), bobP2pCm: round(bob(j.log.rows, j.t1 - 700, j.t1).p2pCm, 2) }

    say('  [phone] touch look 100 px on the right half')
    await resetAndSettle(page, P)
    {
        const lx = Math.round(vw.w * 0.75), ly = Math.round(vw.h * 0.45)
        const r = await yawAfter(page, async () => {
            await touch(cdp, 'touchStart', [{ x: lx, y: ly, id: 2 }])
            for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', [{ x: lx - i * 10, y: ly, id: 2 }]); await sleep(16) }
            await touch(cdp, 'touchEnd', [])
        })
        out.touchLookDegPerCssPx = round(Math.abs(r.dYaw) / 100, 4)
        out.touchLookDegPerScreenWidth = round(Math.abs(r.dYaw) / 100 * vw.w, 1)
    }

    say('  [phone] joystick sideways = turn rate')
    await resetAndSettle(page, P)
    {
        await start(page); await sleep(200)
        await touch(cdp, 'touchStart', [{ ...joy, id: 1 }])
        for (let i = 1; i <= 5; i++) { await touch(cdp, 'touchMove', [{ x: joy.x + i * 11, y: joy.y, id: 1 }]); await sleep(16) }
        await sleep(1500)
        await touch(cdp, 'touchEnd', [])
        await sleep(400)
        const log = await stop(page)
        const seg = log.rows.filter((r) => Number.isFinite(r.yawDeg))
        const mid = seg.slice(Math.floor(seg.length * 0.3), Math.floor(seg.length * 0.7))
        out.joystickSidewaysDegPerSec = mid.length > 2 ? round(Math.abs(mid[mid.length - 1].yawDeg - mid[0].yawDeg) / ((mid[mid.length - 1].t - mid[0].t) / 1000), 1) : null
        const a = log.rows[0], b = log.rows[log.rows.length - 1]
        out.joystickSidewaysMovedM = round(Math.hypot(b.x - a.x, b.z - a.z), 2)
    }

    say('  [phone] Fly + Ascend button 2 s')
    const flyBtn = page.locator('.live-scene-fly-btn')
    if (await flyBtn.count()) {
        await flyBtn.first().tap()
        await sleep(400)
        const asc = page.getByRole('button', { name: 'Ascend' })
        if (await asc.count()) {
            await resetAndSettle(page, P)
            const box = await asc.first().boundingBox()
            await start(page); await sleep(200)
            const t0 = await page.evaluate(() => performance.now())
            await touch(cdp, 'touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 }])
            await sleep(2000)
            const t1 = await page.evaluate(() => performance.now())
            await touch(cdp, 'touchEnd', [])
            await sleep(1200)
            const log = await stop(page)
            const f = pressMetrics(log.rows, t0, t1, { axis: 'y', plateauMs: 500 })
            out.ascendButton = { climbMps: round(f.vmax), t90ms: round(f.t90, 0), stopMs: round(f.stopMs, 0) }
            out.flyButtonTargetPx = { w: round(box.width, 0), h: round(box.height, 0) }
        } else out.ascendButton = { error: 'no Ascend button after Fly' }
        await flyBtn.first().tap().catch(() => {})
    } else out.ascendButton = { error: 'no Fly button' }
    return out
}

// ── eye pass: screencast recordings ──────────────────────────────────────────

export function screencaster(cdp, dir) {
    let current = null
    cdp.on('Page.screencastFrame', async (f) => {
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
        if (!current) return
        const n = String(current.frames.length).padStart(4, '0')
        const file = path.join(current.dir, `f${n}.jpg`)
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
        current.frames.push({ file, ts: f.metadata.timestamp })
    })
    return {
        async begin(name, maxWidth = 1280) {
            const d = path.join(dir, name)
            fs.rmSync(d, { recursive: true, force: true })
            fs.mkdirSync(d, { recursive: true })
            current = { name, dir: d, frames: [] }
            await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth, maxHeight: 1440, everyNthFrame: 1 })
        },
        async end() {
            await cdp.send('Page.stopScreencast').catch(() => {})
            const done = current
            current = null
            if (done) fs.writeFileSync(path.join(done.dir, 'frames.json'), JSON.stringify(done.frames, null, 1))
            return done
        }
    }
}

export async function eyePass(page, room, eye, { say, degPerCount }) {
    const P = room.spawn
    const clips = []
    const clip = async (name, fn) => {
        await resetAndSettle(page, name.startsWith('strafe') ? (room.columnsView || P) : P)
        await start(page)
        await eye.begin(name)
        await fn()
        const done = await eye.end()
        const log = await stop(page)
        fs.writeFileSync(path.join(done.dir, 'camera.json'), JSON.stringify(log.rows))
        clips.push({ name, frames: done.frames.length, dir: done.dir })
        say(`  [eye] ${name}: ${done.frames.length} frames`)
    }
    await lock(page)
    await clip('look-sweep-slow', async () => {
        // 90° over 3 s at an even pace: what a visitor does to take in the hall.
        const counts = Math.round(90 / degPerCount)
        await page.evaluate((c) => window.__rig.lookPaced(-c, 0, 180), counts)
        await sleep(500)
    })
    await clip('walk-start-stop', async () => {
        await sleep(300); await page.keyboard.down('w'); await sleep(2200); await page.keyboard.up('w'); await sleep(1500)
    })
    await clip('strafe-past-columns', async () => {
        await sleep(300); await page.keyboard.down('d'); await sleep(2500); await page.keyboard.up('d'); await sleep(1500)
    })
    await unlock(page)
    if (await toggleFly(page, true)) {
        await clip('fly-truss-and-back', async () => {
            await page.keyboard.down(' ')
            const t0 = Date.now()
            while (Date.now() - t0 < 6000) {
                if ((await page.evaluate(() => window.__rig.readWalker()?.altY)) >= (room.trussY || 6)) break
                await sleep(30)
            }
            await page.keyboard.up(' '); await sleep(800)
            await page.keyboard.down('c'); await sleep(1600); await page.keyboard.up('c'); await sleep(800)
        })
        await toggleFly(page, false)
    }
    return clips
}
