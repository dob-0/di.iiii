#!/usr/bin/env node
/**
 * measure-raw-lag.mjs: frame times and long tasks on the Raw canvas, real pointer input.
 *   Chromium (Playwright), 1568x882, DPR 1.25, the MOCT-like project from raw-preview-seed.mjs.
 *   Per run: requestAnimationFrame deltas (p50 / p95 / max, ms), PerformanceObserver 'longtask'
 *   (count, total ms, longest ms), CPU package temperature at start / max / end and the mean
 *   scaling_cur_freq of all cores, sampled every 250 ms. Waits for <= 80 C before a run if the
 *   package is >= 90 C (a throttled CPU is not comparable).
 *   a  2 s real-mouse drag of a card      b  2 s canvas pan
 *   c  5 zoom steps (the + button)        d  typing 20 characters in a Text card's field
 *   node scripts/measure-raw-lag.mjs --base URL --api URL --tag now --runs 3 --out file.json
 */
import fs from 'node:fs'
import { seedAndOpen, arg } from './raw-preview-seed.mjs'
const BASE = arg('base'), API = arg('api'), TAG = arg('tag', 'x'), RUNS = Number(arg('runs', '3')), OUT = arg('out', `/tmp/claude-1000/rawprev/lag-${TAG}.json`)

const hw = fs.readdirSync('/sys/class/hwmon').map((d) => `/sys/class/hwmon/${d}`).find((d) => fs.readFileSync(`${d}/name`, 'utf8').trim() === 'coretemp')
const temp = () => Number(fs.readFileSync(`${hw}/temp1_input`, 'utf8')) / 1000
const mhz = () => {
    const f = fs.readdirSync('/sys/devices/system/cpu').filter((n) => /^cpu\d+$/.test(n)).map((n) => Number(fs.readFileSync(`/sys/devices/system/cpu/${n}/cpufreq/scaling_cur_freq`, 'utf8')) / 1000)
    return f.reduce((a, b) => a + b, 0) / f.length
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitCool = async () => {
    if (temp() < 90) return 0
    const t0 = Date.now()
    while (temp() > 80) await sleep(3000)
    return Math.round((Date.now() - t0) / 1000)
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }

const { browser, page, projectId } = await seedAndOpen({ base: BASE, api: API, db: 'x' })
const reload = async () => {
    await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-card-id="n-night"]').waitFor({ timeout: 30000 })
    await page.waitForTimeout(2500)
}
await page.addInitScript(() => {
    window.__m = { frames: [], tasks: [], on: false }
    new PerformanceObserver((l) => { if (window.__m.on) for (const e of l.getEntries()) window.__m.tasks.push(e.duration) }).observe({ entryTypes: ['longtask'] })
    let last = performance.now()
    const tick = (t) => { if (window.__m.on) window.__m.frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
})
// a point inside the card's header that really belongs to that card (windows may stand over it)
const grab = (id) => page.evaluate((cid) => {
    const el = document.querySelector(`[data-card-id="${cid}"]`)
    const r = el.getBoundingClientRect()
    for (let y = r.y + 12; y < r.y + 40; y += 6) for (let x = r.x + 20; x < r.x + r.width - 20; x += 8) {
        if (document.elementFromPoint(x, y)?.closest('[data-card-id]') === el) return { x, y }
    }
    return null
}, id)
const emptyPoint = () => page.evaluate(() => {
    for (let y = 700; y > 150; y -= 25) for (let x = 60; x < 400; x += 25) {
        const e = document.elementFromPoint(x, y)
        if (e && !e.closest('[data-card-id],button,aside,nav,.raw-desktop-window,[class*="window"],[class*="zoom"]')) return { x, y }
    }
    return null
})

const scenarios = {
    a: async () => { const g = await grab('n-across'); if (!g) throw new Error('no free grab point'); await page.mouse.move(g.x, g.y); await page.mouse.down(); const t0 = Date.now(); let i = 0; while (Date.now() - t0 < 2000) { i += 1; await page.mouse.move(g.x + 90 * Math.sin(i / 12), g.y + 60 * Math.cos(i / 12) - 60 + 60); await sleep(8) } await page.mouse.up() },
    b: async () => { const g = await emptyPoint(); if (!g) throw new Error('no empty point'); await page.mouse.move(g.x, g.y); await page.mouse.down(); const t0 = Date.now(); let i = 0; while (Date.now() - t0 < 2000) { i += 1; await page.mouse.move(g.x + 120 * Math.sin(i / 14), g.y - 80 + 80 * Math.cos(i / 14)); await sleep(8) } await page.mouse.up() },
    c: async () => { const b = await page.getByLabel('Zoom in').boundingBox(); for (let i = 0; i < 5; i += 1) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(400) } },
    d: async () => {
        const edit = page.locator('textarea.raw-text-panel-input').first()
        if (await edit.count()) { const b = await edit.boundingBox(); await page.mouse.click(b.x + 20, b.y + 20) }
        else {
            const g = await grab('n-pricing'); await page.mouse.click(g.x, g.y); await sleep(500)
            const c = await page.locator('[data-card-id="n-pricing"] .raw-graph-node-content').boundingBox(); await page.mouse.click(c.x + 20, c.y + 8)
            await page.locator('textarea.raw-graph-node-edit').waitFor({ timeout: 5000 })
        }
        await sleep(300)
        await page.keyboard.type('abcdefghij0123456789', { delay: 60 })
    }
}
const out = []
for (const key of Object.keys(scenarios)) {
    for (let run = 1; run <= RUNS; run += 1) {
        await reload()
        const waited = await waitCool()
        const t0 = temp(); const temps = [t0]; const freqs = [mhz()]
        const sampler = setInterval(() => { temps.push(temp()); freqs.push(mhz()) }, 250)
        await page.evaluate(() => { window.__m.frames = []; window.__m.tasks = []; window.__m.on = true })
        let err = null
        try { await scenarios[key]() } catch (e) { err = String(e.message).split('\n')[0] }
        await page.waitForTimeout(150)
        const m = await page.evaluate(() => { window.__m.on = false; return { frames: window.__m.frames.slice(1), tasks: window.__m.tasks } })
        clearInterval(sampler)
        const row = { tag: TAG, scenario: key, run, err, frames: m.frames.length, p50: +pct(m.frames, 0.5).toFixed(1), p95: +pct(m.frames, 0.95).toFixed(1), max: +Math.max(0, ...m.frames).toFixed(1), longtasks: m.tasks.length, longtaskMs: Math.round(m.tasks.reduce((a, b) => a + b, 0)), longest: Math.round(Math.max(0, ...m.tasks)), tStart: t0, tMax: Math.max(...temps), tEnd: temps.at(-1), mhz: Math.round(freqs.reduce((a, b) => a + b, 0) / freqs.length), waitedS: waited }
        out.push(row); console.log(JSON.stringify(row))
    }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
await browser.close()
