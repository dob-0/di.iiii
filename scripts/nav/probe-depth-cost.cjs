// The cost of the scene-distance depth picture per Edit (Blender tool) wheel notch, and where each notch got it:
// 'peek' = the picture asked for in the background after the last move was ready (no wait), 'sync' = rendered and read on the
// spot (the notch waits for the GPU). Per phase: the share of each source, the sync cost (ms) of the notches that paid it, the
// wheel handler's own duration (a capture + a bubble listener on window around it), and the background reads' submit and
// latency times. Dev build only (window.__diSceneDistance, __diSceneDistanceReads). Extended 2026-10-13 from probe-depth-cost.cjs.
//   NAV_URL=<studio url> [NAV_PHASES=off@120,on@120,off@120,on@120,off@40,on@40] [NAV_NOTCHES=30] [NAV_WARM=4]
//     di-test-browser run scripts/nav/probe-depth-cost.cjs
// A phase is <off|on>@<ms between notches>: `off` sets window.__diSceneDistanceOff = true (every notch takes the unchanged
// synchronous path: the "before", same build, same page, same GPU state), `on` takes the background path. Phases alternate so
// the heat and the GPU clock hit both alike. Each phase: half the notches in, half out, so it ends near where it began.
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NOTCHES = Number(process.env.NAV_NOTCHES || 30), WARM = Number(process.env.NAV_WARM || 4)
const PHASES = (process.env.NAV_PHASES || 'off@120,on@120,off@120,on@120,off@40,on@40').split(',').map((p) => { const [mode, gap] = p.split('@'); return { mode, gap: Number(gap || 120) } })
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
setTimeout(() => { console.log('ERR watchdog 240 s'); bye(4) }, 240000)
const stats = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? { n: s.length, median: +s[s.length >> 1].toFixed(2), p90: +s[Math.floor(s.length * 0.9)].toFixed(2), max: +s[s.length - 1].toFixed(2) } : { n: 0 } }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    page.on('console', (m) => { if (/sceneDistance|GL_|GL ERROR|WebGL/i.test(m.text())) console.log('PAGE', m.type(), m.text().slice(0, 240)) }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 240)))
    await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(6000)
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300)
    const box = await page.locator('canvas').first().boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.evaluate(() => {
        window.__wheelMs = []; window.__wheelAt = []; let t0 = 0
        window.addEventListener('wheel', () => { t0 = performance.now(); window.__wheelAt.push(t0) }, { capture: true, passive: true })
        window.addEventListener('wheel', () => { window.__wheelMs.push(performance.now() - t0) }, { passive: true })
    })
    // three's async read leaves the pixel-pack buffer bound while it waits (WebGLRenderer.js r185); with one bound a client-memory
    // readPixels is an INVALID_OPERATION. Shown on this GPU with a scratch renderer, apart from the app (NAV_PBO=0 skips it).
    if (process.env.NAV_PBO !== '0') console.log('PBO', JSON.stringify(await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n)); if (!url) return { error: 'no three url' }
        const THREE = await import(url); const canvas = document.createElement('canvas'); const r = new THREE.WebGLRenderer({ canvas }); const gl = r.getContext()
        try {
            if (!r.extensions.has('EXT_color_buffer_float')) return { error: 'no EXT_color_buffer_float' }
            const t = new THREE.WebGLRenderTarget(64, 36, { type: THREE.FloatType, format: THREE.RGBAFormat }); r.setRenderTarget(t); r.render(new THREE.Scene(), new THREE.PerspectiveCamera()); r.setRenderTarget(null)
            gl.getError(); const p = r.readRenderTargetPixelsAsync(t, 0, 0, 64, 36, new Float32Array(64 * 36 * 4)); const boundDuring = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null
            gl.getError(); r.readRenderTargetPixels(t, 0, 0, 64, 36, new Float32Array(64 * 36 * 4)); const errorOfSyncRead = gl.getError()
            await p; const boundAfter = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null; t.dispose()
            return { packBufferBoundWhileWaiting: boundDuring, syncReadErrorWhileWaiting: errorOfSyncRead, INVALID_OPERATION: gl.INVALID_OPERATION, packBufferBoundAfter: boundAfter, renderer: gl.getParameter(gl.RENDERER).slice(0, 60) }
        } finally { r.dispose(); r.forceContextLoss() }
    })))
    const notch = async (i, n, gap) => {
        await page.evaluate(() => { window.__diSceneDistance = null })
        await page.mouse.wheel(0, i < n / 2 ? -100 : 100); await sleep(gap)
        return page.evaluate(() => { const d = window.__diSceneDistance; return d ? { source: d.source || 'sync', ms: d.ms } : null })
    }
    await page.evaluate(() => { window.__diSceneDistanceOff = true }); for (let i = 0; i < WARM; i++) await notch(i, WARM, 150) // warm-up: the depth shader compiles on the first draw
    const all = []
    for (const { mode, gap } of PHASES) {
        await page.evaluate((off) => { window.__diSceneDistanceOff = off; window.__wheelMs.length = 0; window.__wheelAt.length = 0 }, mode === 'off')
        await sleep(300)
        const r0 = await page.evaluate(() => { const r = window.__diSceneDistanceReads; return r ? { requested: r.requested, resolved: r.resolved, coalesced: r.coalesced, failed: r.failed, submit: r.submitMs.length, latency: r.latencyMs.length, askedOn: { ...r.askedOn } } : null })
        const rows = []; for (let i = 0; i < NOTCHES; i++) rows.push(await notch(i, NOTCHES, gap))
        await sleep(400)
        const out = await page.evaluate((r0) => { const r = window.__diSceneDistanceReads, at = window.__wheelAt; return { handler: window.__wheelMs.slice(), gaps: at.slice(1).map((t, i) => t - at[i]), reads: r ? { requested: r.requested - (r0?.requested || 0), resolved: r.resolved - (r0?.resolved || 0), coalesced: r.coalesced - (r0?.coalesced || 0), failed: r.failed - (r0?.failed || 0), submitMs: r.submitMs.slice(r0?.submit || 0), latencyMs: r.latencyMs.slice(r0?.latency || 0), askedOn: r.askedOn } : null } }, r0)
        const peek = rows.filter((r) => r && r.source === 'peek').length, sync = rows.filter((r) => r && r.source === 'sync').length, none = rows.filter((r) => !r).length
        const row = { mode, gapMs: gap, actualGapMs: stats(out.gaps).median, notches: rows.length, peek, sync, none, peekShare: +(peek / (rows.length - none || 1)).toFixed(3), syncMs: stats(rows.filter((r) => r && r.source === 'sync').map((r) => r.ms)), handlerMs: stats(out.handler), reads: out.reads && { requested: out.reads.requested, resolved: out.reads.resolved, coalesced: out.reads.coalesced, failed: out.reads.failed, submitMs: stats(out.reads.submitMs), latencyMs: stats(out.reads.latencyMs), askedOn: out.reads.askedOn } }
        all.push({ ...row, handlerRaw: out.handler, syncRaw: rows.filter((r) => r && r.source === 'sync').map((r) => r.ms), submitRaw: out.reads?.submitMs || [] })
        console.log('PHASE', JSON.stringify(row))
        console.log('ROWS ', rows.map((r) => (r ? (r.source === 'peek' ? 'P' : 'S') : '-')).join(''))
    }
    for (const mode of ['off', 'on']) {
        const ph = all.filter((p) => p.mode === mode && p.gapMs >= 100)
        if (!ph.length) continue
        const peek = ph.reduce((a, p) => a + p.peek, 0), n = ph.reduce((a, p) => a + p.notches, 0)
        console.log('TOTAL', mode, '@>=100ms', JSON.stringify({ phases: ph.length, notches: n, peekShare: +(peek / n).toFixed(3), syncMs: stats(ph.flatMap((p) => p.syncRaw)), handlerMs: stats(ph.flatMap((p) => p.handlerRaw)), submitMs: stats(ph.flatMap((p) => p.submitRaw)) }))
    }
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
