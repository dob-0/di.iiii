// The look proof and the numbers for solid walls, on the agent screen (real GPU).
//
//   LOOK_ON=<project url, walls on> LOOK_OFF=<same forest, walls off> LOOK_OUT=<picture dir> \
//     di-test-browser run scripts/solid-walls/look.cjs
//
// Per variant: open the project, press Walk, then (1) hold W straight at the head-on trunk, (2) hold W diagonally
// into the cabin wall, (3) walk the same lane three times and record every animation frame's time. Pictures and a
// JSON of the numbers go to LOOK_OUT. Needs the dev tier (the pose is read from window.__diiWalkerRef, DEV only).
// Every page ends on about:blank, also on an error.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const OUT = process.env.LOOK_OUT || path.resolve(process.cwd(), 'solid-walls-look')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pose(page) {
    return page.evaluate(() => { const p = window.__diiWalkerRef?.current; return p ? { x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3) } : null })
}
const place = (page, p) => page.evaluate((q) => Object.assign(window.__diiWalkerRef.current, { pitch: 0, ...q }), p)
async function hold(page, ms) {
    await page.keyboard.down('w')
    await wait(ms)
    await page.keyboard.up('w')
    await wait(700) // slides to rest (friction) before the picture
}
async function frames(page, ms) {
    await page.evaluate(() => {
        window.__ft = []
        window.__ftOn = true
        let last = performance.now()
        const tick = (t) => { if (!window.__ftOn) return; window.__ft.push(t - last); last = t; requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
    })
    await hold(page, ms)
    return page.evaluate(() => {
        window.__ftOn = false
        const a = window.__ft.slice(5).sort((x, y) => x - y)
        const q = (f) => a[Math.min(a.length - 1, Math.floor(a.length * f))]
        const mean = a.reduce((s, v) => s + v, 0) / a.length
        return { n: a.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +a[a.length - 1].toFixed(2) }
    })
}

async function variant(context, label, url, shotPrefix, quick = false) {
    const page = await context.newPage()
    const result = { label, url }
    try {
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
        await page.bringToFront()
        await page.locator('button:has-text("Walk")').first().click({ timeout: 20000 })
        await page.waitForFunction(() => !!window.__diiWalkerRef?.current && !!document.querySelector('canvas'), null, { timeout: 30000 })
        await wait(quick ? 8000 : 4500) // models, shaders, the first look at the scene, the walls' first rebuild
        result.status = await page.evaluate(() => document.querySelector('canvas')?.dataset.solidWalls || null)
        result.spawn = await pose(page)
        await page.screenshot({ path: path.join(OUT, `${shotPrefix}-0-spawn.png`) })

        if (!quick) {
        // 1. head-on at the trunk at (0, 2): from (0, 9) facing -z, W held 2.4 s (arrives at about 1.7 s, then pushes on it).
        // A round trunk met dead centre is an unstable balance: pushed on for a second or two the walker slides off it
        // (measured: 3.5 s of W ended at x 0.55, past the trunk), so the stop is read after a short push, the slide in step 1b.
        await place(page, { x: 0, z: 9, yaw: Math.PI })
        await hold(page, 2400)
        result.headOn = await pose(page)
        await page.screenshot({ path: path.join(OUT, `${shotPrefix}-1-trunk.png`) })
        // 1b. the same trunk, 15 cm off centre, 3.5 s of W: it slides round the trunk and on
        await place(page, { x: 0.15, z: 9, yaw: Math.PI })
        await hold(page, 3500)
        result.glance = await pose(page)
        await page.screenshot({ path: path.join(OUT, `${shotPrefix}-1b-glance.png`) })

        // 2. diagonally into the cabin wall along z = -3 (x 0..16): from (3, 3) facing (+x, -z), 3.4 s of W
        await place(page, { x: 3, z: 3, yaw: (3 * Math.PI) / 4 })
        await hold(page, 3400)
        result.cabin = await pose(page)
        await page.screenshot({ path: path.join(OUT, `${shotPrefix}-2-cabin.png`) })
        }

        // 3. the same lane x = -8, z 9 -> -12 (no tree on it), a warm-up and three timed walks
        const walks = []
        for (let i = 0; i < 4; i += 1) {
            await place(page, { x: -8, z: 9, yaw: Math.PI })
            await wait(300)
            const stats = await frames(page, 4000)
            if (i > 0) walks.push({ ...stats, end: await pose(page) })
        }
        result.walks = walks
        result.part = await page.evaluate(() => {
            const s = document.querySelector('canvas')?.__solidWallsStats
            return s ? { buildMs: +s.buildMs.toFixed(2), mergeMs: +s.mergeMs.toFixed(2), calls: s.calls, totalMs: +s.totalMs.toFixed(2), usPerCall: +((s.totalMs / Math.max(1, s.calls)) * 1000).toFixed(1), maxMs: +s.maxMs.toFixed(3) } : null
        })
        result.status = await page.evaluate(() => document.querySelector('canvas')?.dataset.solidWalls || null)
    } catch (error) {
        result.error = String(error.message || error)
        await page.screenshot({ path: path.join(OUT, `${shotPrefix}-error.png`) }).catch(() => {})
    } finally {
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
    }
    return result
}

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const context = browser.contexts()[0] || await browser.newContext()
    const results = []
    for (const [label, env, prefix, quick] of [['on', 'LOOK_ON', 'on', false], ['off', 'LOOK_OFF', 'off', false], ['big', 'LOOK_BIG', 'big', true], ['bigoff', 'LOOK_BIGOFF', 'bigoff', true]]) {
        if (process.env[env]) results.push(await variant(context, label, process.env[env], prefix, quick))
    }
    fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results, null, 1).slice(0, 6000))
// the CDP connection keeps node alive: exit, or the lane's lock is never released (seen: a hung run blocked the next one)
})().then(() => process.exit(0), (error) => { console.error('look failed:', error.message); process.exit(1) })
