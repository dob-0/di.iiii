#!/usr/bin/env node
// motion-probe.cjs - run by `di-test-browser run scripts/rigbuild/motion-probe.cjs` (the agent screen, real GPU).
// Env: PROBE=scenes|frametime|phone  URL=<room url>  OUT=<dir>  SECONDS=<n, frametime>
//  all        phone, scenes, frametime in one run (one turn of the browser lock)
//  scenes     press each of the 10 favourite buttons (a real tap), wait out the fade, take 4 frames 250 ms apart (PNG), save them
//             and frames.json (the real gaps between them). Contact sheet + luminance maths: scripts/rigbuild/motion-sheet.py.
//  frametime  rAF counted for SECONDS in a moving scene and in a still scene (and the moving one again), median + p95 frame time.
//  phone      390x844 DPR 3 and 1440x900: the favourites buttons' boxes, overlaps counted, a picture of the row.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const OUT = process.env.OUT || '.'
const URL = process.env.URL || 'http://moxir-motion.diiii.localhost/moxir/p/moxir-v1-1-motion'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const open = async (browser, viewport, dpr = 1) => {
    const context = browser.contexts()[0]
    // reuse the tab `di-test-browser up <url>` opened (a fresh tab over CDP stayed on about:blank here)
    const page = context.pages().find((p) => /moxir-motion/.test(p.url())) || context.pages().find((p) => p.url() !== 'about:blank') || await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: dpr, mobile: viewport.width < 600 })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="room-favourites"] [data-fav]', { timeout: 90000 })
    await page.waitForFunction(() => window.__diRoom && window.__diRoom.camera, null, { timeout: 90000 }).catch(() => {})
    await sleep(4000)
    return { page, cdp }
}
const clear = async (page) => { const c = await page.context().newCDPSession(page); await c.send('Emulation.clearDeviceMetricsOverride') }
const favs = (page) => page.$$eval('[data-fav]', (els) => els.map((e) => e.getAttribute('data-fav')))
const press = async (page, id) => { await page.click(`[data-fav="${id}"]`); }
const renderer = (page) => page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown' })

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    // PROBE=all runs the three in one go (one turn of the machine-wide browser lock)
    const modes = (process.env.PROBE || 'scenes') === 'all' ? ['phone', 'scenes', 'frametime'] : [process.env.PROBE || 'scenes']
    for (const mode of modes) {
    if (mode === 'scenes') {
        const { page } = await open(browser, { width: 1280, height: 720 })
        const ids = await favs(page)
        const manifest = { renderer: await renderer(page), scenes: [] }
        for (const id of ids) {
            await press(page, id)
            await sleep(2200) // the fade is 1 s; the press goes to the server, the desk, and back
            const shots = []
            const t0 = Date.now()
            for (let k = 0; k < 4; k++) {
                const want = t0 + k * 250
                const wait = want - Date.now()
                if (wait > 0) await sleep(wait)
                const t = Date.now()
                await page.screenshot({ path: path.join(OUT, `${id}-${k}.png`), type: 'png' })
                shots.push(t - t0)
            }
            manifest.scenes.push({ id, live: await page.$eval(`[data-fav="${id}"]`, (e) => e.getAttribute('aria-current')), shotsAtMs: shots })
            console.log(id, shots.join(' '))
        }
        fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(manifest, null, 1))
        await clear(page)
    } else if (mode === 'frametime') {
        const seconds = Number(process.env.SECONDS || 12)
        const { page } = await open(browser, { width: 1280, height: 720 })
        const ids = await favs(page)
        const moving = process.env.MOVING || 'rig-pump-beat'
        const still = process.env.STILL || 'rig-work-light'
        const measure = () => page.evaluate((s) => new Promise((resolve) => {
            const ts = []
            const end = performance.now() + s * 1000
            const tick = (t) => { ts.push(t); if (t < end) requestAnimationFrame(tick); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); resolve({ frames: ts.length, medianMs: d[d.length >> 1], p95Ms: d[Math.floor(d.length * 0.95)], maxMs: d[d.length - 1], seconds: s }) } }
            requestAnimationFrame(tick)
        }), seconds)
        const setLook = async (id) => {
            // a look the favourites do not show (the work light) is chosen through the same server route
            const r = await page.evaluate(async (look) => {
                const show = await (await fetch(`/serverXR/api/spaces/moxir/show/moxir-v1-1-motion`, { credentials: 'same-origin' })).json()
                const cue = show.cues.find((c) => c.lookId === look)
                const res = await fetch(`/serverXR/api/spaces/moxir/show/moxir-v1-1-motion/choose`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: cue.index, cueId: cue.id }) })
                return res.status
            }, id)
            await sleep(3500)
            return r
        }
        const out = { renderer: await renderer(page), rounds: [] }
        for (const [label, id] of [['motion on', moving], ['motion off', still], ['motion on', moving], ['motion off', still]]) {
            const status = await setLook(id)
            const m = await measure()
            out.rounds.push({ label, look: id, choose: status, ...m })
            console.log(label, id, JSON.stringify(m))
        }
        out.ids = ids
        fs.writeFileSync(path.join(OUT, 'frametime.json'), JSON.stringify(out, null, 1))
        await clear(page)
    } else if (mode === 'phone') {
        for (const [name, vp, dpr] of [['phone', { width: 390, height: 844 }, 3], ['desktop', { width: 1440, height: 900 }, 1]]) {
            const { page } = await open(browser, vp, dpr)
            const boxes = await page.$$eval('[data-fav]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-fav'), x: r.x, y: r.y, w: r.width, h: r.height } }))
            let overlaps = 0
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]; const b = boxes[j]
                if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlaps++
            }
            const rows = [...new Set(boxes.map((b) => Math.round(b.y)))].length
            const perRow = rows ? boxes.length / rows : 0
            const bar = await page.$eval('[data-smart-view-bar]', (e) => { const r = e.getBoundingClientRect(); return { y: r.y, h: r.height } }).catch(() => null)
            const lowest = Math.max(...boxes.map((b) => b.y + b.h))
            const res = { name, viewport: vp, dpr, buttons: boxes.length, rows, perRow, overlaps, minW: Math.min(...boxes.map((b) => b.w)), minH: Math.min(...boxes.map((b) => b.h)), viewBar: bar, rowBottom: lowest, boxes }
            fs.writeFileSync(path.join(OUT, `row-${name}.json`), JSON.stringify(res, null, 1))
            await page.screenshot({ path: path.join(OUT, `row-${name}.png`) })
            console.log(name, JSON.stringify({ ...res, boxes: undefined }))
            await clear(page)
        }
    }
    }
    process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
