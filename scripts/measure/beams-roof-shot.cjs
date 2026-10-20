#!/usr/bin/env node
/*
 * beams-roof-shot.cjs — PHYSICS FIRST (owner 2026-10-13): a shot from OUTSIDE and above a closed test hall whose lamps
 * hold a stored 120 m throw aimed at the roof and a wall (src/project/viewport/measure/harness/beams-roof.html). The
 * beams are pure green, the hall dark red, the sky black: every green pixel is light that left the hall. Writes the
 * shot(s) and prints the green pixel count; exits 1 when the outside shot has any beam pixel above --max (default 0).
 * The inside shot is the control: the beams must still be drawn there.
 *   npx vite --port 5199 &   # the dev server (vite root is src/)
 *   node scripts/measure/beams-roof-shot.cjs --url http://127.0.0.1:5199/project/viewport/measure/harness/beams-roof.html --out <dir>
 * Software GL (SwiftShader) is fine for a yes/no on where a beam is drawn; brightness is not checked here.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const url = arg('url', 'http://127.0.0.1:5199/project/viewport/measure/harness/beams-roof.html')
const out = arg('out', '.verify-surfaces/beams-roof')
const max = Number(arg('max', 0))

const greenPixels = async (page) => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('webgl2') || c.getContext('webgl')
    const w = g.drawingBufferWidth
    const h = g.drawingBufferHeight
    const px = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px)
    let n = 0
    let faint = 0
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 1] > 40 && px[i + 1] > 1.5 * px[i] && px[i + 1] > 1.5 * px[i + 2]) n += 1
        // any trace at all: green above the hall's own (dark red, green 0) by a few codes
        if (px[i + 1] > 4 && px[i + 1] > px[i + 2]) faint += 1
    }
    return { n, faint, total: w * h }
})

const main = async () => {
    fs.mkdirSync(out, { recursive: true })
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    const result = {}
    for (const view of ['outside', 'inside']) {
        await page.goto(`${url}?view=${view}`, { waitUntil: 'load', timeout: 120000 })
        await page.waitForFunction(() => window.__beamsRoof?.ready, null, { timeout: 120000, polling: 250 })
        await page.waitForTimeout(500)
        const shot = path.join(out, `beams-roof-${view}.png`)
        await page.screenshot({ path: shot })
        result[view] = { ...(await greenPixels(page)), shot }
        console.log(`${view}: ${result[view].n} beam (green) pixels, ${result[view].faint} with any green trace, of ${result[view].total} → ${shot}`)
    }
    if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`)
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ url, result, errors }, null, 2))
    await browser.close()
    process.exit(result.outside.n > max ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
