#!/usr/bin/env node
/*
 * moxir-v2-true-frames.cjs — MOXIR v2's layouts as the ONE smoke machine leaves the air, in MEASUREMENT MODE at one stated
 * EV100 (docs/architecture/MEASUREMENT_MODE.md): no auto exposure, no bloom, no glare veil, no work light. One frame per
 * job of a plan (layout × haze state × look × view), each from the room as a visitor opens it.
 *
 * Nothing is written to any server: for each job the browser's copy of the document is changed on the way in (Playwright
 * intercepts GET /api/projects/<id>/document, as cue-frames.mjs does) — its air (renderSettings.atmosphere: the haze state),
 * its cue list (one cue: the look asked for, held), and its camera (the view). The server keeps the room as epic-build made it.
 *
 * Run on aylmo, on the real GPU, under the browser lock (the agent screen, never the owner's):
 *   di-dev up <tree> --api scratch            # the tree's scratch stack holding the rooms (epic-build.mjs --rig … --apply)
 *   timeout 600 di-test-browser run scripts/place/moxir-v2-true-frames.cjs --plan <plan.json> --out <dir> [--only <name,…>]
 * plan.json: { base: 'http://<tree>.diiii.localhost', query: 'measure&ev100=2.84&scale=0.02&bounce=1', size: [1440, 900],
 *   settle_s: 8, jobs: [ { name, project, path, atmosphere, look, camera: { position, target, fov } } ] }
 * Writes <out>/<name>.png and <out>/frames.json (per frame: the job, the measurement state the page reports — EV100, GPU —
 * and the time). Refuses a software renderer.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('./close-on-signal.cjs')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|lavapipe/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The browser's copy of the document for one job (pure): its air, one held cue for the look, the camera. */
const docForJob = (doc, job, now = Date.now()) => {
    const camera = { projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, position: job.camera.position, target: job.camera.target, fov: job.camera.fov }
    doc.presentationState = { ...(doc.presentationState || {}), mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: camera }
    doc.worldState = { ...(doc.worldState || {}), savedView: { mode: 'perspective', ...camera } }
    doc.renderSettings = { ...(doc.renderSettings || {}), atmosphere: job.atmosphere }
    const cue = { id: `true-${job.look}`, name: `held: ${job.look}`, key: '', fade: 0, hold: 3600, lightLook: `rig-${job.look}`, surfaces: {} }
    doc.mappingState = { ...(doc.mappingState || {}), cues: [cue], loop: true, showEpoch: now - 500, showSource: 'clock' }
    // job.zeroKeys: hold the look's groups whose key holds one of these words at 0 (a measurement split, e.g. the laser lines
    // off to see what the lamps alone white out); the browser's copy only
    if (Array.isArray(job.zeroKeys) && job.zeroKeys.length) {
        const show = (doc.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks))
        for (const lk of show ? show.components.rigLooks.looks : []) {
            for (const key of Object.keys(lk.levels || {})) if (job.zeroKeys.some((w) => key.includes(w))) lk.levels[key] = 0
        }
    }
    return doc
}

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    const plan = JSON.parse(fs.readFileSync(String(arg('plan')), 'utf8'))
    const out = path.resolve(String(arg('out', '.')))
    const only = arg('only') ? new Set(String(arg('only')).split(',')) : null
    fs.mkdirSync(out, { recursive: true })
    const indexFile = path.join(out, 'frames.json')
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {}
    const [w, h] = plan.size || [1440, 900]
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page) // a `timeout` kill must not leave the tab drawing the room (2026-10-09)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)))
    let current = null
    await page.route('**/api/projects/*/document*', async (route) => {
        const res = await route.fetch()
        if (!current || !route.request().url().includes(`/api/projects/${current.project}/document`)) return route.fulfill({ response: res })
        const body = await res.json()
        if (body?.document) body.document = docForJob(body.document, current)
        return route.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } })
    })
    try {
        await page.setViewportSize({ width: w, height: h })
        for (const job of plan.jobs) {
            if (only && !only.has(job.name)) continue
            current = job
            errors.length = 0
            const url = `${plan.base}${job.path}?${plan.query}`
            await page.goto('about:blank')
            await page.goto(url, { waitUntil: 'load', timeout: 90000 })
            await page.bringToFront()
            await page.waitForSelector('canvas[data-measure-ev100]', { timeout: 90000 })
            await sleep((plan.settle_s || 8) * 1000)
            const state = await page.evaluate(() => (window.__diMeasure ? window.__diMeasure.state() : null))
            const gpu = state?.renderer?.gpu || 'unknown'
            if (SOFTWARE.test(gpu)) throw new Error(`refused: a software renderer (${gpu})`)
            const file = path.join(out, `${job.name}.png`)
            await page.screenshot({ path: file })
            index[job.name] = { job: { ...job, atmosphere: job.atmosphere }, url, at: new Date().toISOString(), ev100: state?.camera?.ev100, ev100Source: state?.camera?.ev100Source,
                toneMappingExposure: state?.camera?.toneMappingExposure, sceneScale: state?.sceneScale, switchedOff: (state?.switchedOff || []).map((s) => s.kind + ':' + (s.name || '')),
                gpu, commit: state?.renderer?.commit, pageErrors: [...errors] }
            fs.writeFileSync(indexFile, JSON.stringify(index, null, 1))
            console.log(`${job.name}: EV100 ${state?.camera?.ev100} · ${gpu.slice(0, 60)} · errors ${errors.length}`)
        }
    } finally {
        await page.close().catch(() => {})
        await browser.close().catch(() => {}) // disconnects CDP only; the browser stays
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || String(error))
        process.exitCode = 1
    })
}
module.exports = { docForJob }
