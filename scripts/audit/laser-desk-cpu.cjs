'use strict'
// Laser desk page cost: CPU per Chromium process type (from /proc) and canvas calls a second, on the agent screen (2026-10-31, desk-calm).
// Run: di-test-browser run scripts/audit/laser-desk-cpu.cjs   (the page must be served by a serverXR so the laser API accepts it)
//   DESK_URL=http://127.0.0.1:<api port>/serverXR/laser/  SECS=60  ONLY=before,after-calm  OUT=<prefix for .json and .png>
//   ORIG_DESK_JS=<the desk.js to call "before", e.g. git show <old commit>:serverXR/src/laser/ui/desk.js > file>
// Setup used on 2026-10-31 (a scratch tree, the Mac's looks read-only into it only):
//   ssh dob@<mac> 'curl -s http://127.0.0.1:4000/serverXR/laser/desk/api/state' > mac.json
//   write {v:1,bpm,master:1,looks:<mac.json looks>,cubes:{},seeded:<look ids>} to <scratch data>/laser/desk.json, di-dev down/up <tree> --api scratch
//   curl -X POST -H 'Origin: <api origin>' -d '{"look":"<id>"}' <api origin>/serverXR/laser/desk/api/go   (a live look, as on the Mac)
// Each config: new page at 1280x760 CSS px, device scale factor 2, one stage cube, 8 s warm-up, then SECS; the page ends on about:blank.
// Measures the laser desk page (Control tab) on the agent screen: CPU per process type from /proc, canvas calls per second.
// Run under: di-test-browser run measure-desk.cjs   (env: PW, DESK_URL, ORIG_DESK_JS, OUT, SECS, ONLY)
const fs = require('fs')
const { execSync } = require('child_process')
const { chromium } = require(process.env.PW || 'playwright')
const URL_ = process.env.DESK_URL
const SECS = Number(process.env.SECS || 60)
const WARM_MS = 8000
const ORIG = fs.readFileSync(process.env.ORIG_DESK_JS, 'utf8')
const TCK = 100
const CSS_FIX = '.tiles{grid-auto-rows:max-content}'
const CONFIGS = [
    { id: 'before', desk: 'orig', motion: null, css: false },
    { id: 'after-full', desk: 'new', motion: 'full', css: false },
    { id: 'after-calm', desk: 'new', motion: 'calm', css: false },
    { id: 'before+gridfix', desk: 'orig', motion: null, css: true },
    { id: 'after-full+gridfix', desk: 'new', motion: 'full', css: true },
    { id: 'after-calm+gridfix', desk: 'new', motion: 'calm', css: true },
    { id: 'floor-blank', blank: true, secs: 30 },
    { id: 'floor-calm-idle', desk: 'new', motion: 'calm', css: true, release: true, secs: 30 }
].filter((c) => !process.env.ONLY || process.env.ONLY.split(',').includes(c.id))

const counter = () => {
    const C = { stroke: 0, fill: 0, clearRect: 0, strokeRect: 0, fillRect: 0 }
    window.__cc = C
    for (const m of Object.keys(C)) {
        const o = CanvasRenderingContext2D.prototype[m]
        CanvasRenderingContext2D.prototype[m] = function (...a) { C[m] += 1; return o.apply(this, a) }
    }
}
const statOf = (path) => { const s = fs.readFileSync(path, 'utf8'); const i = s.lastIndexOf(')'); return { comm: s.slice(s.indexOf('(') + 1, i), f: s.slice(i + 2).split(' ') } }
const listProcs = () => {
    const out = []
    for (const d of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(d)) continue
        try { statOf(`/proc/${d}/stat`); out.push({ pid: +d, line: fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').join(' ') }) } catch { /* gone */ }
    }
    return out
}
// Chromium rewrites its children's argv into one string, so a process is matched on its whole command line.
const typeOf = (line) => (/--type=([\w-]+)/.exec(line) || [null, 'browser'])[1]
const snapshot = (port) => {
    const all = listProcs()
    const holder = all.find((p) => p.line.includes(`--remote-debugging-port=${port}`))
    const profile = holder && /--user-data-dir=(\S+)/.exec(holder.line)?.[0]
    if (!profile) throw new Error('browser not found for port ' + port)
    const snap = {}
    for (const p of all) {
        if (!p.line.includes(profile + ' ') && !p.line.endsWith(profile)) continue
        if (/^(\S*\/)?(bwrap|flatpak|xdg-dbus-proxy)\b/.test(p.line)) continue
        const proc = { type: typeOf(p.line), ticks: 0, threads: {} }
        try {
            const st = statOf(`/proc/${p.pid}/stat`)
            proc.ticks = Number(st.f[11]) + Number(st.f[12])
            for (const tid of fs.readdirSync(`/proc/${p.pid}/task`)) {
                try { const t = statOf(`/proc/${p.pid}/task/${tid}/stat`); proc.threads[tid] = { comm: t.comm, ticks: Number(t.f[11]) + Number(t.f[12]) } } catch { /* gone */ }
            }
        } catch { /* task list not readable: the process total still counts */ }
        snap[p.pid] = proc
    }
    return snap
}
const diff = (a, b, secs) => {
    const types = {}
    const threads = {}
    for (const [pid, p1] of Object.entries(b)) {
        const p0 = a[pid]
        if (!p0) continue
        const pct = ((p1.ticks - p0.ticks) / (TCK * secs)) * 100
        types[p1.type] = (types[p1.type] || 0) + pct
        for (const [tid, t1] of Object.entries(p1.threads)) {
            const t0 = p0.threads[tid]
            if (!t0) continue
            const key = `${p1.type}:${t1.comm}`
            threads[key] = Math.max(threads[key] || 0, ((t1.ticks - t0.ticks) / (TCK * secs)) * 100)
        }
    }
    return { types, threads }
}
const temp = () => { try { return /Package id 0:\s+\+([\d.]+)/.exec(execSync('sensors', { encoding: 'utf8' }))?.[1] } catch { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
    const base = URL_.replace(/\/serverXR\/laser\/.*$/, '')
    const port = new globalThis.URL(process.env.DI_TEST_CDP).port
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const ctx = browser.contexts()[0]
    const results = []
    for (const cfg of CONFIGS) {
        const page = await ctx.newPage()
        try {
            const cdp = await ctx.newCDPSession(page)
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 2, mobile: false })
            await page.addInitScript(counter)
            if (cfg.motion) await page.addInitScript((m) => { try { localStorage.setItem('diLaserDeskMotion', m) } catch { /* none */ } }, cfg.motion)
            await page.route('**/desk/api/state', async (route) => {
                try { const r = await route.fetch(); const j = await r.json(); j.cubes = j.cubes.slice(0, 1); await route.fulfill({ response: r, json: j }) } catch { await route.continue() }
            })
            if (cfg.desk === 'orig') await page.route('**/laser/desk.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: ORIG }))
            if (cfg.release) { const base = URL_.replace(/\/serverXR\/laser\/.*$/, ''); execSync(`curl -s -m 5 -X POST -H 'Content-Type: application/json' -H 'Origin: ${base}' -d '{}' ${base}/serverXR/laser/desk/api/release`) }
            await page.goto(cfg.blank ? 'about:blank' : URL_, { waitUntil: 'load' })
            if (cfg.css) await page.addStyleTag({ content: CSS_FIX })
            const liveId = cfg.blank ? 'n/a' : await page.evaluate(() => fetch('desk/api/state').then((r) => r.json()).then((j) => j.liveId))
            await sleep(WARM_MS)
            const raf = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f) }))
            const c0 = await page.evaluate(() => ({ ...window.__cc }))
            const s0 = snapshot(port)
            const w0 = Date.now()
            await sleep((cfg.secs || SECS) * 1000)
            const s1 = snapshot(port)
            const secs = (Date.now() - w0) / 1000
            const c1 = await page.evaluate(() => ({ ...window.__cc }))
            const info = cfg.blank ? { blank: true } : await page.evaluate((fix) => {
                const tiles = [...document.querySelectorAll('.tile')]
                const inView = tiles.filter((t) => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0 }).length
                const tilesBox = document.querySelector('#tiles').getBoundingClientRect()
                return { motion: document.body.dataset.motion || '(none: original page)', tiles: tiles.length, tilesBoxHeight: Math.round(tilesBox.height), tilesGeometricallyInView: inView, playing: document.querySelectorAll('.tile.is-playing').length, stageCanvases: document.querySelectorAll('#stage canvas').length, hidden: document.hidden, dpr: window.devicePixelRatio, innerW: window.innerWidth, innerH: window.innerHeight }
            })
            const d = diff(s0, s1, secs)
            const perSec = Object.fromEntries(Object.keys(c1).map((k) => [k, +((c1[k] - c0[k]) / secs).toFixed(1)]))
            const row = { id: cfg.id, liveId, secs: +secs.toFixed(1), rafHz: raf, cpu: Object.fromEntries(Object.entries(d.types).map(([k, v]) => [k, +v.toFixed(1)])), topThreads: Object.entries(d.threads).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}=${v.toFixed(1)}`), canvasPerSec: perSec, info, tempC: temp() }
            results.push(row)
            console.log(JSON.stringify(row))
            if (cfg.motion === 'calm' || cfg.id === 'before') {
                await page.screenshot({ path: `${process.env.OUT}.${cfg.id}.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } }).catch(() => {})
            }
        } catch (e) {
            console.log('ERR', cfg.id, e.message)
        } finally {
            try { await page.goto('about:blank') } catch { /* gone */ }
            try { await page.close() } catch { /* gone */ }
        }
        await sleep(3000)
    }
    fs.writeFileSync(`${process.env.OUT}.json`, JSON.stringify(results, null, 1))
    console.log('DONE', results.length, 'runs')
    process.exit(0)
})().catch((e) => { console.log('FATAL', e.message); process.exit(1) })
