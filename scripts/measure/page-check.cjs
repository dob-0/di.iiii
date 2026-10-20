/**
 * page-check.cjs — ONE shot of a visitor page with its console: page errors, console errors, renderer, fps. Read-only.
 *   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/measure/page-check.cjs --url <full url> --out <png> [--settle 20]
 * Writes <png> and <png>.json. Ends on about:blank, also on error (2026-10-15, re-render job).
 */
const fs = require('node:fs')
const { chromium } = require('playwright')
const arg = (n, f = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('run through di-test-browser run')
    const browser = await chromium.connectOverCDP(cdp)
    const page = await (browser.contexts()[0] || (await browser.newContext())).newPage()
    const out = { url: arg('url'), pageErrors: [], consoleErrors: [], consoleWarnings: 0 }
    try {
        await page.setViewportSize({ width: 1600, height: 900 })
        page.on('pageerror', (e) => out.pageErrors.push(String(e.message).slice(0, 300)))
        page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 300)); else if (m.type() === 'warning') out.consoleWarnings++ })
        await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.bringToFront()
        await sleep(Number(arg('settle', 20)) * 1000)
        out.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a' })
        out.fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n * 1000 / (t - t0))) }; requestAnimationFrame(f) }))
        await page.screenshot({ path: arg('out') })
    } catch (e) { out.error = String(e.message).slice(0, 300) } finally {
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        fs.writeFileSync(`${arg('out')}.json`, JSON.stringify(out, null, 1))
        console.log(JSON.stringify(out).slice(0, 900))
        await browser.close().catch(() => {})
        process.exit(0)
    }
})()
