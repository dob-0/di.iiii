#!/usr/bin/env node
// The view page's walk across the device matrix (docs/ai/audits/2026-10-14-viewer-navigation.md).
// Needs a DEV build (window.__diiWalkerRef) and a space with a walkable scene.
//   node scripts/audit/viewer-navigation.cjs [url]    default http://localhost:5173/wcc/scene
// Prints one measured line per matrix row: input -> yaw / pitch / metres moved.
const { chromium, devices } = require('playwright')

const URL = process.argv[2] || 'http://localhost:5173/wcc/scene'
const rows = []
const note = (row, what, ok, detail) => {
    rows.push({ row, what, ok })
    console.log(`${ok ? 'ok  ' : 'FAIL'}  [${row}] ${what} — ${detail}`)
}

const open = async (browser, ctxOpts) => {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror', e.message))
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForFunction(() => window.__diiWalkerRef?.current, null, { timeout: 30000 })
    await page.waitForTimeout(2500)
    return { ctx, page }
}
const pose = (page) => page.evaluate(() => ({ ...window.__diiWalkerRef.current }))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const wheel = (page, props, times = 10) => page.evaluate(({ props, times }) => {
    const el = document.querySelector('canvas')
    const prevented = []
    for (let i = 0; i < times; i++) {
        const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...props })
        el.dispatchEvent(e); prevented.push(e.defaultPrevented)
    }
    return prevented.every(Boolean)
}, { props, times })

(async () => {
const browser = await chromium.launch()

// -- mouse + keyboard, 1440x900, DPR 1 and 2 ---------------------------------
for (const dpr of [1, 2]) {
    const row = `mouse+kbd 1440x900 @${dpr}x`
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
    const b = await page.locator('canvas').first().boundingBox()
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2
    let p0 = await pose(page)
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 200, cy + 60, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(300)
    let p1 = await pose(page)
    const lock = await page.evaluate(() => document.pointerLockElement?.tagName || null)
    note(row, 'drag looks, no pointer lock', lock === null && p1.yaw !== p0.yaw, `yaw ${(p1.yaw - p0.yaw).toFixed(3)} pitch ${(p1.pitch - p0.pitch).toFixed(3)} lock=${lock}`)
    p0 = p1
    await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w')
    p1 = await pose(page)
    note(row, 'W walks', dist(p0, p1) > 0.3, `${dist(p0, p1).toFixed(2)} m`)
    p0 = p1
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft')
    p1 = await pose(page)
    note(row, 'ArrowLeft turns', p1.yaw !== p0.yaw, `yaw ${(p1.yaw - p0.yaw).toFixed(3)}`)
    await ctx.close()
}

// -- touchpad: two-finger scroll and pinch ------------------------------------
{
    const row = 'touchpad 1440x900'
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } })
    let p0 = await pose(page)
    let pd = await wheel(page, { deltaX: 0, deltaY: -60, deltaMode: 0 })
    let p1 = await pose(page); await page.waitForTimeout(300); p1 = await pose(page)
    note(row, 'two-finger scroll up = forward, page not scrolled', dist(p0, p1) > 0.1 && pd, `${dist(p0, p1).toFixed(2)} m, prevented=${pd}`)
    p0 = p1
    pd = await wheel(page, { deltaX: 25, deltaY: 0, deltaMode: 0 }, 15)
    await page.waitForTimeout(300); p1 = await pose(page)
    note(row, 'two-finger scroll sideways (deltaX) turns', Math.abs(p1.yaw - p0.yaw) > 0.05 && p1.pitch === p0.pitch, `yaw ${(p1.yaw - p0.yaw).toFixed(3)} pitch ${(p1.pitch - p0.pitch).toFixed(3)}`)
    p0 = p1
    pd = await wheel(page, { deltaX: 0, deltaY: -6, deltaMode: 0, ctrlKey: true })
    await page.waitForTimeout(300); p1 = await pose(page)
    note(row, 'pinch (ctrl+wheel) zooms, page not zoomed', dist(p0, p1) > 0.1 && p1.yaw === p0.yaw && pd, `${dist(p0, p1).toFixed(2)} m, prevented=${pd}`)
    await ctx.close()
}

// -- touch: phone and tablet -----------------------------------------------------
for (const [name, opts] of [['phone 390x844 @3x', devices['iPhone 13']], ['tablet 820x1180', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
    const { ctx, page } = await open(browser, opts)
    const vw = page.viewportSize()
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, x, y, id) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] })
    let p0 = await pose(page)
    await touch('touchStart', vw.width * 0.75, vw.height * 0.5, 1)
    for (let i = 1; i <= 10; i++) await touch('touchMove', vw.width * 0.75 + i * 12, vw.height * 0.5 + i * 4, 1)
    await touch('touchEnd')
    let p1 = await pose(page)
    note(name, 'right-half drag looks', p1.yaw !== p0.yaw, `yaw ${(p1.yaw - p0.yaw).toFixed(3)} pitch ${(p1.pitch - p0.pitch).toFixed(3)}`)
    p0 = p1
    await touch('touchStart', vw.width * 0.25, vw.height * 0.7, 2)
    for (let i = 1; i <= 8; i++) await touch('touchMove', vw.width * 0.25, vw.height * 0.7 - i * 6, 2)
    await page.waitForTimeout(800)
    p1 = await pose(page)
    await touch('touchEnd')
    note(name, 'left-half stick moves', dist(p0, p1) > 0.2, `${dist(p0, p1).toFixed(2)} m`)
    await ctx.close()
}
await browser.close()
const bad = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - bad.length}/${rows.length} rows hold`)
process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error(e); process.exit(1) })
