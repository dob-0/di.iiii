#!/usr/bin/env node
/**
 * input-check.mjs — input-device contract check for the exhibition walker.
 *
 * Companion to responsive-check.mjs: that one covers screen shapes, this one
 * covers input hardware classes. Browsers don't reveal which physical device
 * produced an event, so instead of trusting device-detection heuristics this
 * fires every class of input at the walker and asserts the behavioral
 * contracts on real walker state (window.__diiWalkerRef, dev builds only):
 *
 *   1. No wheel event may change pitch — hi-res mouse wheels are
 *      indistinguishable from trackpads (the June-29 camera-in-the-floor bug).
 *   2. Wheel deltaY dollies (moves x/z), in every deltaMode.
 *   3. Wheel deltaX turns (trackpad horizontal look survives).
 *   4. ctrlKey wheel (pinch zoom) is ignored entirely.
 *   5. Mouse look works with pointer lock engaged.
 *   6. Drag-look works when pointer lock is denied (Wayland / post-Esc cooldown).
 *   7. A granted lock that delivers dead deltas — all zeros OR the ±1..±4
 *      both-axis noise captured live on KDE Wayland + Firefox — is abandoned
 *      and drag-look takes over; the first-after-engage spike is swallowed.
 *   8. A failed project-document fetch shows a visible error + Retry instead
 *      of silently blocking mouse/wheel input forever behind the loading
 *      overlay (that combination reads exactly like "I can move but can't
 *      look" — see docs/ai/known-fixes.md), and an automatic retry recovers
 *      once the fetch succeeds again.
 *
 * Usage: node scripts/input-check.mjs [url]   (default http://localhost:5173/wcc/scene)
 * Requires the dev server (probe hook is DEV-only).
 */

import { chromium } from 'playwright'

const URL = process.argv[2] || 'http://localhost:5173/wcc/scene'
const results = []
const check = (name, ok, detail = '') => {
    results.push({ name, ok })
    console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (e) => check('no page errors', false, e.message))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 20000 })
await page.waitForFunction(() => window.__diiWalkerRef?.current, null, { timeout: 20000 })
await page.waitForTimeout(2500)

const box = await page.locator('canvas').first().boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const state = () => page.evaluate(() => ({ ...window.__diiWalkerRef.current }))
const wheel = (props, times = 10) => page.evaluate(({ x, y, props, times }) => {
    const el = document.elementFromPoint(x, y)
    for (let i = 0; i < times; i++) el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ...props }))
}, { x: cx, y: cy, props, times })
const settle = () => page.waitForTimeout(350)

console.log(`[input-check] ${URL}`)

// -- wheel classes: pitch must never move, dolly must ------------------------
for (const [label, props] of [
    ['hi-res mouse wheel (pixel, 50px)', { deltaY: 50, deltaMode: 0 }],
    ['classic mouse wheel (line mode)', { deltaY: 3, deltaMode: 1 }],
    ['trackpad swipe (pixel, 18px)', { deltaY: 18, deltaMode: 0 }],
]) {
    const before = await state()
    await wheel(props); await settle()
    const after = await state()
    check(`${label}: pitch unchanged`, after.pitch === before.pitch, `pitch ${before.pitch} → ${after.pitch}`)
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    check(`${label}: dollies`, moved > 0.1, `moved ${moved.toFixed(2)}m`)
}

{
    const before = await state()
    await wheel({ deltaX: 25, deltaY: 0, deltaMode: 0 }, 15); await settle()
    const after = await state()
    check('trackpad horizontal swipe: turns (yaw)', Math.abs(after.yaw - before.yaw) > 0.05, `yaw Δ ${(after.yaw - before.yaw).toFixed(3)}`)
    check('trackpad horizontal swipe: pitch unchanged', after.pitch === before.pitch)
}

{
    const before = await state()
    await wheel({ deltaY: 40, deltaMode: 0, ctrlKey: true }, 10); await settle()
    const after = await state()
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    check('ctrl+wheel (pinch zoom): fully ignored', moved < 0.001 && after.pitch === before.pitch && after.yaw === before.yaw)
}

// -- pointer-lock look --------------------------------------------------------
{
    await page.mouse.click(cx, cy)
    await page.waitForTimeout(400)
    const locked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')
    check('click engages pointer lock', locked)
    const before = await state()
    await page.mouse.move(cx + 120, cy + 40, { steps: 8 }); await settle()
    const after = await state()
    check('locked mouse move: looks around', after.yaw !== before.yaw && after.pitch !== before.pitch)
    // A synthesized Escape doesn't release pointer lock in headless (that's
    // trusted browser UI) — exit programmatically instead.
    await page.evaluate(() => document.exitPointerLock())
    await page.waitForTimeout(300)
}

// -- broken pointer lock: granted but only zero deltas (Wayland-class) --------
// Denied is not the only lock failure: some compositors grant the lock and
// then deliver zero movement on every event. mousemove only fires on physical
// motion, so a run of all-zero locked moves means the lock can never look —
// the walker must abandon it and route the mouse to drag-look instead.
{
    await page.mouse.click(cx, cy)
    await page.waitForTimeout(400)
    const locked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')
    await page.evaluate(() => {
        for (let i = 0; i < 35; i++) {
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 0, bubbles: true }))
        }
    })
    await page.waitForTimeout(400)
    const released = await page.evaluate(() => document.pointerLockElement === null)
    check('broken lock (all-zero locked moves): lock is abandoned', locked && released)

    await page.mouse.click(cx, cy)
    await page.waitForTimeout(400)
    const stillFree = await page.evaluate(() => document.pointerLockElement === null)
    const before = await state()
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 200, cy + 60, { steps: 10 })
    await page.mouse.up()
    await settle()
    const after = await state()
    check('broken lock: never re-requested, drag-look takes over',
        stillFree && after.yaw !== before.yaw && after.pitch !== before.pitch,
        `yaw Δ ${(after.yaw - before.yaw).toFixed(3)}, pitch Δ ${(after.pitch - before.pitch).toFixed(3)}`)
}

// -- broken pointer lock: granted but degenerate noise deltas -----------------
// Broken-lock shapes seen in a live event capture (KDE Wayland + Firefox,
// July 2026): lock granted, mousemove firing, but real mouse sweeps arrive as
// ±1..±4 noise in BOTH axes — plus one wild spike (-19,-116) as the first
// event after each lock engage, which must be swallowed (it was yanking the
// view and resetting the dead-streak). Replays that exact stream. Needs a
// fresh page: the block above already latched lockBroken on the main one.
{
    const degPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await degPage.goto(URL, { waitUntil: 'domcontentloaded' })
    await degPage.waitForSelector('canvas', { timeout: 20000 })
    await degPage.waitForFunction(() => window.__diiWalkerRef?.current, null, { timeout: 20000 })
    await degPage.waitForTimeout(2500)
    const dbox = await degPage.locator('canvas').first().boundingBox()
    const dcx = dbox.x + dbox.width / 2
    const dcy = dbox.y + dbox.height / 2
    const dstate = () => degPage.evaluate(() => ({ ...window.__diiWalkerRef.current }))
    await degPage.mouse.click(dcx, dcy)
    await degPage.waitForTimeout(400)
    const locked = await degPage.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')
    const preSpike = await dstate()
    await degPage.evaluate(() => {
        const noise = [[-2, 1], [0, 1], [1, 0], [2, 0], [-1, 1], [4, 0], [0, 0]]
        const mv = (x, y) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, bubbles: true }))
        mv(-19, -116) // first-after-engage spike from the live capture
        for (let i = 0; i < 35; i++) mv(...noise[i % noise.length])
    })
    await degPage.waitForTimeout(400)
    const postSpike = await dstate()
    const released = await degPage.evaluate(() => document.pointerLockElement === null)
    check('broken lock (±4 noise locked moves): lock is abandoned', locked && released)
    check('first locked move (spike) is swallowed: view did not rail',
        Math.abs(postSpike.pitch - preSpike.pitch) < 0.5,
        `pitch ${preSpike.pitch.toFixed(2)} → ${postSpike.pitch.toFixed(2)}`)

    const before = await dstate()
    await degPage.mouse.move(dcx, dcy)
    await degPage.mouse.down()
    await degPage.mouse.move(dcx + 200, dcy + 60, { steps: 10 })
    await degPage.mouse.up()
    await degPage.waitForTimeout(350)
    const after = await dstate()
    const stillFree = await degPage.evaluate(() => document.pointerLockElement === null)
    check('broken lock (constant deltas): never re-requested, drag-look takes over',
        stillFree && after.yaw !== before.yaw && after.pitch !== before.pitch,
        `yaw Δ ${(after.yaw - before.yaw).toFixed(3)}, pitch Δ ${(after.pitch - before.pitch).toFixed(3)}`)
    await degPage.close()
}

// -- drag-look fallback when pointer lock is denied ---------------------------
{
    await page.evaluate(() => {
        Element.prototype.requestPointerLock = () => Promise.reject(new DOMException('denied'))
    })
    const before = await state()
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 200, cy + 60, { steps: 10 })
    await page.mouse.up()
    await settle()
    const after = await state()
    const lockEl = await page.evaluate(() => document.pointerLockElement?.tagName || null)
    check('pointer lock denied: drag still looks around', lockEl === null && after.yaw !== before.yaw && after.pitch !== before.pitch,
        `yaw Δ ${(after.yaw - before.yaw).toFixed(3)}, pitch Δ ${(after.pitch - before.pitch).toFixed(3)}`)
    const b2 = await state()
    await page.mouse.move(cx - 150, cy - 150, { steps: 8 }); await settle()
    const a2 = await state()
    check('unlocked move without button: does not look', a2.yaw === b2.yaw && a2.pitch === b2.pitch)

    // Broken Wayland compositors poison movementX/movementY on UNLOCKED moves
    // too (constant -1,0 — the fourth WCC look report, Firefox/Wayland), so
    // drag-look must derive deltas from clientX/clientY, never movement*.
    const b3 = await state()
    await page.evaluate(({ x, y }) => {
        const el = document.querySelector('canvas')
        el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 99, bubbles: true }))
        for (let i = 1; i <= 25; i++) {
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: -1, movementY: 0, clientX: x + i * 8, clientY: y + i * 3, buttons: 1, bubbles: true }))
        }
        document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99, bubbles: true }))
    }, { x: cx, y: cy })
    await settle()
    const a3 = await state()
    check('drag with poisoned movementX/Y (constant -1,0): still looks via cursor position',
        a3.yaw !== b3.yaw && a3.pitch !== b3.pitch,
        `yaw Δ ${(a3.yaw - b3.yaw).toFixed(3)}, pitch Δ ${(a3.pitch - b3.pitch).toFixed(3)}`)

    // The inverse glitch (seen in headless Firefox around lock release):
    // clientX/Y zeroed or frozen while movementX/Y is healthy — drag-look
    // must fall back to movement deltas for those events.
    const b4 = await state()
    await page.evaluate(({ x, y }) => {
        const el = document.querySelector('canvas')
        el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 98, bubbles: true }))
        for (let i = 1; i <= 25; i++) {
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: 9, movementY: 4, clientX: 0, clientY: 0, buttons: 1, bubbles: true }))
        }
        document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 98, bubbles: true }))
    }, { x: cx, y: cy })
    await settle()
    const a4 = await state()
    check('drag with zeroed clientX/Y (lock-release glitch): still looks via movement deltas',
        a4.yaw !== b4.yaw && a4.pitch !== b4.pitch,
        `yaw Δ ${(a4.yaw - b4.yaw).toFixed(3)}, pitch Δ ${(a4.pitch - b4.pitch).toFixed(3)}`)
}

// -- failed document load: visible error + Retry, not a silent stuck overlay --
{
    const errPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    let failCount = 0
    await errPage.route('**/serverXR/api/projects/**', async (route) => {
        if (route.request().method() === 'GET' && failCount < 2) {
            failCount++
            return route.fulfill({ status: 502, body: 'Bad Gateway' })
        }
        return route.continue()
    })
    await errPage.goto(URL, { waitUntil: 'domcontentloaded' })
    await errPage.waitForSelector('canvas', { timeout: 20000 })
    await errPage.waitForTimeout(1500)
    const errorShown = await errPage.evaluate(() => !!document.querySelector('.live-scene-loading-error'))
    check('failed document load: shows visible error (not a silent stuck overlay)', errorShown)
    await errPage.waitForTimeout(4500) // auto-retry fires after 3s
    const recovered = await errPage.evaluate(() => !document.querySelector('.live-scene-loading-error'))
    const finalOpacity = await errPage.evaluate(() => getComputedStyle(document.querySelector('.live-scene-loading')).opacity)
    check('auto-retry recovers once the fetch succeeds', recovered && finalOpacity === '0', `opacity=${finalOpacity}`)
    await errPage.close()
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n[input-check] ${results.length - failed.length}/${results.length} contracts hold${failed.length ? ` — ${failed.length} FAILED` : ''}`)
process.exitCode = failed.length ? 1 : 0
