#!/usr/bin/env node
/*
 * t1-gpu.cjs — T1, the measurement mode's analytical check, on a REAL GPU
 * (docs/architecture/MEASUREMENT_MODE.md; simulation-method.md §3.3 T1).
 *
 * Opens the harness page (src/project/viewport/measure/harness/t1.html, served by a tree's
 * dev server) in an already running Chromium reached over CDP, waits for it to finish,
 * checks every reading against the inverse-square and cosine law within 1 %, refuses a
 * software renderer, writes the whole result as JSON and exits 0 only when every check
 * passed AND the control (the mode off, the work light on) failed as it must.
 *
 * On aylmo (the RTX 3080, under the browser lock, on the agent screen):
 *   di-dev up sim-measure
 *   di-test-browser run scripts/measure/t1-gpu.cjs \
 *       --url http://sim-measure.diiii.localhost/project/viewport/measure/harness/t1.html --out /tmp/t1.json
 * Elsewhere: DI_TEST_CDP=http://127.0.0.1:9222 node scripts/measure/t1-gpu.cjs --url … [--allow-software]
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const url = arg('url', 'http://sim-measure.diiii.localhost/project/viewport/measure/harness/t1.html')
const out = arg('out', path.join(process.cwd(), `t1-gpu-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
const allowSoftware = process.argv.includes('--allow-software')
const cdp = process.env.DI_TEST_CDP
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|lavapipe/i

const pct = (e) => (Number.isFinite(e) ? `${(e * 100).toFixed(3)} %` : 'n/a')

const main = async () => {
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`, or set it to a Chromium DevTools address')
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    const logs = []
    page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()) })
    try {
        // preflight: can this browser give a WebGL2 context at all (a crashed GPU process blocks it)?
        const pre = await page.evaluate(() => {
            const gl = document.createElement('canvas').getContext('webgl2')
            if (!gl) return { webgl2: false }
            const ext = gl.getExtension('WEBGL_debug_renderer_info')
            return { webgl2: true, gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), floatTargets: Boolean(gl.getExtension('EXT_color_buffer_float')) }
        })
        console.log(`preflight: ${JSON.stringify(pre)}; tabs open in the test browser: ${context.pages().length}`)
        if (!pre.webgl2) throw new Error('this browser cannot create a WebGL2 context (GPU process crashed or blocked?): restart the test browser (di-test-browser down; di-test-browser up)')
        await page.goto(url, { waitUntil: 'load', timeout: 60000 })
        // the same question on the harness's own origin: Chrome blocks WebGL per site after a GPU reset it blames on it
        const onOrigin = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))
        console.log(`WebGL2 on ${new URL(url).origin}: ${onOrigin}`)
        // a background tab gets no animation frames: the scene would never draw
        await page.bringToFront()
        const visibility = await page.evaluate(() => document.visibilityState)
        if (visibility !== 'visible') console.log(`warning: the page is ${visibility}; frames may be throttled`)
        await page.waitForFunction(() => window.__T1 && window.__T1.done, null, { timeout: 180000, polling: 500 }).catch(async (e) => {
            const where = await page.evaluate(() => ({ visibility: document.visibilityState, mode: Boolean(window.__diMeasure), t1: window.__T1 || null })).catch(() => null)
            throw new Error(`${e.message}; page state ${JSON.stringify(where)}; console errors ${JSON.stringify(logs.slice(0, 10))}`)
        })
        const r = await page.evaluate(() => window.__T1)
        if (r.error) throw new Error(`the harness failed: ${r.error}`)
        const gpu = r.state?.renderer?.gpu || 'unknown'
        r.runner = { url, at: new Date().toISOString(), cdp, consoleErrors: logs }
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, JSON.stringify(r, null, 2))
        console.log(`GPU: ${gpu}`)
        console.log(`EV100 ${r.state?.camera?.ev100} (${r.state?.camera?.ev100Source}); sceneScale ${r.state?.sceneScale} (${r.state?.sceneScaleSource})`)
        for (const c of r.cases) for (const k of c.checks) {
            console.log(`${k.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(7)} ${k.name.padEnd(18)} expected ${k.expected.toFixed(3)} lx  measured ${Number(k.measured).toFixed(3)} lx  error ${pct(k.error)}  (${k.law})`)
        }
        for (const b of r.beam) {
            const k = b.check
            console.log(`${k.pass ? 'PASS' : 'FAIL'}  beam    FWHM at ${String(b.distance_m).padStart(2)} m      expected ${k.expected.toFixed(4)} m   measured ${Number(k.measured).toFixed(4)} m   error ${pct(k.error)}`)
        }
        for (const k of r.switches) console.log(`${k.pass ? 'PASS' : 'FAIL'}  mode    ${k.name.padEnd(36)} ${k.law}`)
        console.log(`${r.control.pass ? 'WRONG' : 'OK  '}  control (${r.control.what}): expected ${r.control.expected.toFixed(3)} lx measured ${Number(r.control.measured).toFixed(3)} lx error ${pct(r.control.error)} — must FAIL`)
        console.log(`T1: ${r.passed} passed of ${r.total}; control failed as it should: ${r.controlFailedAsItShould}`)
        console.log(`written: ${out}`)
        if (SOFTWARE.test(gpu) && !allowSoftware) throw new Error(`refused: a software renderer (${gpu}) is not the real GPU`)
        if (r.passed !== r.total || !r.controlFailedAsItShould || r.total === 0) process.exitCode = 1
    } finally {
        await page.close()
        await browser.close().catch(() => {}) // disconnects CDP only; the browser stays
    }
}

main().catch((error) => {
    console.error(error.stack || String(error))
    process.exitCode = 1
})
