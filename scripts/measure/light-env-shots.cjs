/**
 * light-env-shots.cjs — same-camera pictures of several versions' light environment, Lite or Full, with the frame rate
 * and the renderer string of each. Read-only: nothing is written to any server (2026-10-15, the light-environment audit).
 *
 *   DI_TEST_LANES=3 DI_TEST_LANE=3 timeout 2400 di-test-browser run scripts/measure/light-env-shots.cjs \
 *       --base http://moxir-test.diiii.localhost --space moxir --plan plan.json --out <dir> [--heat 85]
 *
 * plan.json: [{ "name": "v2-10-floor15-lite", "project": "moxir-v2-10", "look": "red-wave", "quality": "lite"|"full",
 *               "camera": { "position": [x,y,z], "target": [x,y,z], "fov": 70 } | null,     // null = the document's own
 *               "docFile": "<saved document.json>",
 *               "query": "render=tech" }]                                       // optional: served instead
 * The browser's copy of the project document is changed on the way in (Playwright intercepts GET
 * /api/projects/<id>/document, as scripts/measure/lite-vs-full-gpu.cjs does): one cue holds the look on the show clock
 * (docFor below is that script's rule), and presentationState.fixedCamera is the plan's camera.
 *
 * Measured per shot: the frame rate as the page's own rAF cadence over 8 s after a fixed 25 s settle (median and p95 frame
 * time; capped by the display's vsync, so a number at the cap means "at least"), the WebGL renderer string
 * (WEBGL_debug_renderer_info on a fresh WebGL2 canvas in the same browser), the package temperature before. Waits while the
 * CPU package is above --heat (the owner's rule: never raised). Refuses a software renderer. Ends on about:blank, also on error.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('../place/close-on-signal.cjs')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const BASE = String(arg('base', 'http://moxir-test.diiii.localhost')).replace(/\/+$/, '')
const SPACE = arg('space', 'moxir')
const PLAN = JSON.parse(fs.readFileSync(String(arg('plan', 'plan.json')), 'utf8'))
const OUT = path.resolve(String(arg('out', '.')))
const HEAT_LIMIT = Number(arg('heat', 85))
const SIZE = [1600, 900]
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|lavapipe/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const packageTemp = () => {
    try {
        for (const h of fs.readdirSync('/sys/class/hwmon')) {
            const dir = path.join('/sys/class/hwmon', h)
            if (fs.readFileSync(path.join(dir, 'name'), 'utf8').trim() === 'coretemp') return Math.round(Number(fs.readFileSync(path.join(dir, 'temp1_input'), 'utf8')) / 1000)
        }
    } catch { /* no sensor */ }
    return null
}
const waitCool = async (limit, maxWaitS) => {
    const t0 = Date.now()
    let t = packageTemp()
    while (t !== null && t > limit && Date.now() - t0 < maxWaitS * 1000) {
        console.log(`   heat: package ${t} C > ${limit} C, waiting 15 s`)
        await sleep(15000)
        t = packageTemp()
    }
    return { ok: t === null || t <= limit, now: t, waited_s: Math.round((Date.now() - t0) / 1000) }
}

/** One cue holds `look` on the show clock (lite-vs-full-gpu.cjs docFor); the camera is the plan's. */
const docFor = (doc, { look, camera }, now = Date.now()) => {
    const cue = { id: `held-${look}`, name: `held: ${look}`, key: '', fade: 0, hold: 3600, lightLook: `rig-${look}`, surfaces: {} }
    doc.mappingState = { ...(doc.mappingState || {}), cues: [cue], loop: true, showEpoch: now - 500, showSource: 'clock' }
    if (camera) {
        const ps = doc.presentationState || {}
        doc.presentationState = { ...ps, entryView: 'fixed-camera', fixedCamera: { ...(ps.fixedCamera || {}), projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, ...camera } }
    }
    return doc
}

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    fs.mkdirSync(OUT, { recursive: true })
    const results = { script: 'scripts/measure/light-env-shots.cjs', at: new Date().toISOString(), base: BASE, lane: process.env.DI_TEST_LANE || null, size: SIZE, shots: [] }
    const save = () => fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(results, null, 1))
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page)
    let current = null
    await page.route('**/api/projects/*/document*', async (route) => {
        const res = await route.fetch()
        if (!current || !route.request().url().includes(`/api/projects/${current.project}/document`)) return route.fulfill({ response: res })
        let body = await res.json()
        if (current.docFile) {
            const saved = JSON.parse(fs.readFileSync(current.docFile, 'utf8'))
            body = { ...body, document: saved.document || saved }
        }
        if (body?.document) body.document = docFor(body.document, current)
        return route.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } })
    })
    try {
        await page.setViewportSize({ width: SIZE[0], height: SIZE[1] })
        await page.goto('about:blank')
        results.renderer = await page.evaluate(() => {
            const gl = document.createElement('canvas').getContext('webgl2')
            const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'no webgl2')
        })
        console.log('renderer:', results.renderer)
        if (SOFTWARE.test(results.renderer)) throw new Error(`refused: software renderer (${results.renderer})`)
        for (const shot of PLAN) {
            const r = { ...shot, docFile: shot.docFile ? path.basename(shot.docFile) : undefined, tempBefore: packageTemp() }
            results.shots.push(r)
            await page.goto('about:blank')
            r.cool = await waitCool(HEAT_LIMIT, 900)
            if (!r.cool.ok) { r.error = `refused: package ${r.cool.now} C after ${r.cool.waited_s} s`; save(); continue }
            current = shot
            const url = `${BASE}/${SPACE}/${shot.project}?quality=${shot.quality}${shot.query ? `&${shot.query}` : ''}`
            r.url = url
            const t0 = Date.now()
            await page.goto(url, { waitUntil: 'load', timeout: 90000 })
            await page.bringToFront()
            r.loadMs = Date.now() - t0
            await sleep(25000)
            if (shot.camera) {
                // the plan's camera, through the page's own handle (RawViewport's window.__diView, dev build): fixedCamera in the document does not move the room's view
                r.camera = await page.evaluate(async (c) => {
                    const v = window.__diView
                    if (!v) return { error: 'no window.__diView (dev build of RawViewport.jsx needed)' }
                    const set = v.setView(c)
                    await new Promise((r) => setTimeout(r, 4000))
                    return { position: v.camera.position.toArray().map((n) => Math.round(n * 100) / 100), fov: v.camera.fov, set: set.position }
                }, shot.camera)
                console.log(`${shot.name}: camera`, JSON.stringify(r.camera))
            }
            r.frames = await page.evaluate(() => new Promise((resolve) => {
                const dts = []
                let last = performance.now()
                const t0 = last
                const step = (t) => { dts.push(t - last); last = t; if (t - t0 < 8000) requestAnimationFrame(step); else resolve(dts) }
                requestAnimationFrame(step)
            }))
            const v = r.frames.slice(1).sort((a, b) => a - b)
            const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))]
            r.fps = { frames: v.length, mean: Math.round((1000 * v.length / v.reduce((a, b) => a + b, 0)) * 10) / 10, medianMs: Math.round(q(0.5) * 10) / 10, p95Ms: Math.round(q(0.95) * 10) / 10 }
            delete r.frames
            r.file = `${shot.name}.png`
            await page.screenshot({ path: path.join(OUT, r.file) })
            console.log(`${shot.name}: ${r.fps.mean} fps (median ${r.fps.medianMs} ms, p95 ${r.fps.p95Ms} ms), ${r.tempBefore} C before`)
            save()
        }
    } finally {
        current = null
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        save()
        // disconnect only (connectOverCDP): the lane's browser stays up; without this node never exits (seen 2026-10-15)
        await browser.close().catch(() => {})
    }
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
