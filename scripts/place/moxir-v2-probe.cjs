#!/usr/bin/env node
/*
 * moxir-v2-probe.cjs — the light ON the stage, read by the room's own lux probe (measurement mode,
 * docs/architecture/MEASUREMENT_MODE.md: an ideal white Lambertian patch read back from the GPU before tone mapping, E = pi L).
 * For each job: the room as a visitor opens it, one look held (the browser's copy of the document only, as
 * moxir-v2-true-frames.cjs docForJob: nothing is written to a server), then `window.__diMeasure.lux(points)`.
 *
 *   timeout 600 di-test-browser run scripts/place/moxir-v2-probe.cjs --plan <probe-plan.json> --out <probe.json>
 * probe-plan.json: { base, query: 'quality=full&measure&ev100=2.84&scale=0.02', settle_s, points: [{ name, position, normal }],
 *   jobs: [{ name, layout, look, project, path, atmosphere, camera }] }
 * Writes { <layout>: { <look>: { <point name>: { E_lx, ... } } }, _envelopes: {...} }. Refuses a software renderer.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('./close-on-signal.cjs')
const { docForJob } = require('./moxir-v2-true-frames.cjs')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|lavapipe/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    const plan = JSON.parse(fs.readFileSync(String(arg('plan')), 'utf8'))
    const outFile = path.resolve(String(arg('out', 'probe.json')))
    const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { _envelopes: {} }
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page) // a `timeout` kill must not leave the tab drawing the room (2026-10-09)
    let current = null
    await page.route('**/api/projects/*/document*', async (route) => {
        const res = await route.fetch()
        if (!current || !route.request().url().includes(`/api/projects/${current.project}/document`)) return route.fulfill({ response: res })
        const body = await res.json()
        if (body?.document) body.document = docForJob(body.document, current)
        return route.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } })
    })
    try {
        await page.setViewportSize({ width: 1440, height: 900 })
        for (const job of plan.jobs) {
            current = job
            await page.goto('about:blank')
            await page.goto(`${plan.base}${job.path}?${plan.query}`, { waitUntil: 'load', timeout: 90000 })
            await page.bringToFront()
            await page.waitForSelector('canvas[data-measure-ev100]', { timeout: 90000 })
            await sleep((plan.settle_s || 12) * 1000)
            const res = await page.evaluate((pts) => window.__diMeasure.lux(pts), plan.points)
            const gpu = res?.renderer?.gpu || 'unknown'
            if (SOFTWARE.test(gpu)) throw new Error(`refused: a software renderer (${gpu})`)
            out[job.layout] = out[job.layout] || {}
            out[job.layout][job.look] = Object.fromEntries((res.data || []).map((d) => [d.name, { E_lx: d.E_lx == null ? null : Math.round(d.E_lx * 10) / 10, overflow: d.overflow, position: d.position, normal: d.normal }]))
            out._envelopes[job.name] = { ...res, data: undefined }
            fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
            console.log(`${job.name}: ${(res.data || []).map((d) => `${d.name} ${d.E_lx == null ? '-' : d.E_lx.toFixed(1)} lx`).join(' · ')} · ${gpu.slice(0, 50)}`)
        }
    } finally {
        await page.close().catch(() => {})
        await browser.close().catch(() => {})
    }
}

main().catch((error) => {
    console.error(error.stack || String(error))
    process.exitCode = 1
})
