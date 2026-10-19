#!/usr/bin/env node
/**
 * input-check-drag.mjs — input-device contracts for the walk with walkLook="drag",
 * the view page (/<space>/p/<slug>, PublicProjectViewer). Surfaces that keep the
 * pointer lock (/wcc/scene, /build, Jam) are checked by input-check.mjs.
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
 *   4. ctrlKey wheel (touchpad pinch) zooms (dollies); the page never zooms.
 *   5. Drag looks (client coordinates, never movement*), with no pointer lock.
 *
 * Usage: node scripts/input-check-drag.mjs [url]   (default http://localhost:5173/wcc/p/main,
 *        the view page of the project scripts/seed-input-check.mjs makes)
 * Requires the dev server (probe hook is DEV-only).
 */

import { chromium } from 'playwright'

const URL = process.argv[2] || 'http://localhost:5173/wcc/p/main'
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
// The view page opens in orbit; its Walk / Fly button enters the walk.
await page.getByRole('button', { name: 'Walk / Fly' }).click({ timeout: 20000 })
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

console.log(`[input-check-drag] ${URL}`)

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
    check('ctrl+wheel (touchpad pinch): zooms (dollies), no turn, no pitch', moved > 0.1 && after.pitch === before.pitch && after.yaw === before.yaw, `moved ${moved.toFixed(2)}m`)
}

// -- drag look: the one look mode (no pointer lock) --------------------------
{
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    const lockEl = await page.evaluate(() => document.pointerLockElement?.tagName || null)
    const before = await state()
    await page.mouse.move(cx + 200, cy + 60, { steps: 10 })
    await page.mouse.up()
    await settle()
    const after = await state()
    check('drag looks around and never takes a pointer lock',
        lockEl === null && after.yaw !== before.yaw && after.pitch !== before.pitch,
        `yaw Δ ${(after.yaw - before.yaw).toFixed(3)}, pitch Δ ${(after.pitch - before.pitch).toFixed(3)}`)
    const b2 = await state()
    await page.mouse.move(cx - 150, cy - 150, { steps: 8 }); await settle()
    const a2 = await state()
    check('move without a button: does not look', a2.yaw === b2.yaw && a2.pitch === b2.pitch)

    // Poisoned movementX/Y (constant -1,0, Wayland): deltas come from clientX/Y.
    const b3 = await state()
    await page.evaluate(({ x, y }) => {
        const el = document.querySelector('canvas')
        const ev = (type, o) => new PointerEvent(type, { pointerId: 99, bubbles: true, ...o })
        el.dispatchEvent(ev('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y }))
        for (let i = 1; i <= 25; i++) {
            el.dispatchEvent(ev('pointermove', { clientX: x + i * 8, clientY: y + i * 3, buttons: 1 }))
        }
        el.dispatchEvent(ev('pointerup', {}))
    }, { x: cx, y: cy })
    await settle()
    const a3 = await state()
    check('drag with poisoned movementX/Y: still looks via cursor position',
        a3.yaw !== b3.yaw && a3.pitch !== b3.pitch,
        `yaw Δ ${(a3.yaw - b3.yaw).toFixed(3)}, pitch Δ ${(a3.pitch - b3.pitch).toFixed(3)}`)
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n[input-check-drag] ${results.length - failed.length}/${results.length} contracts hold${failed.length ? ` — ${failed.length} FAILED` : ''}`)
process.exitCode = failed.length ? 1 : 0
