// Deck picture-path bench: 4 playing sources (a 1920x1080 and a 640x480 "camera"
// from canvas.captureStream, two 1280x720 mp4 clips), a blend chain, one
// Feedback, thumbnails on every node, the engine canvas at 1280x720.
// Run:  di-test-browser run scripts/perf/deck-bench.cjs
// Env:  BENCH_URL (default http://127.0.0.1:5321/), BENCH_SECONDS (20),
//       BENCH_CLIPS (dir holding clipa.mp4 clipb.mp4), BENCH_OUT (json file).
// Measures through CDP: Performance.getMetrics (ScriptDuration, TaskDuration,
// LayoutDuration), Profiler self-time top 10, in-page rAF fps and engine frames.
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')

const URL_ = process.env.BENCH_URL || 'http://127.0.0.1:5321/'
const SECONDS = Number(process.env.BENCH_SECONDS || 20)
const CLIPS = process.env.BENCH_CLIPS
const OUT = process.env.BENCH_OUT || ''

const serveClips = () => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
        const file = path.join(CLIPS, path.basename(req.url.split('?')[0]))
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return }
        const size = fs.statSync(file).size
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
        const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }
        if (range) {
            const start = Number(range[1]); const end = range[2] ? Number(range[2]) : size - 1
            res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
            fs.createReadStream(file, { start, end }).pipe(res)
        } else {
            res.writeHead(200, { ...headers, 'Content-Length': size })
            fs.createReadStream(file).pipe(res)
        }
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const inPage = async ({ clipBase }) => {
    const { createTopEngine } = await import('/project/tops/topEngine.js')
    let plan = null
    try { plan = await import('/project/tops/thumbnailPlan.js') } catch { /* before the fix */ }
    document.body.innerHTML = ''
    const canvas = document.createElement('canvas')
    canvas.width = 1280; canvas.height = 720
    canvas.style.cssText = 'width:640px;height:360px'
    document.body.append(canvas)
    const engine = createTopEngine({ canvas, width: 1280, height: 720 })

    const feed = (w, h, hue) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h
        const g = c.getContext('2d'); let t = 0
        const timer = setInterval(() => { t += 1; g.fillStyle = `hsl(${(hue + t * 3) % 360} 80% 50%)`; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect((t * 7) % w, 0, 40, h) }, 33)
        const video = document.createElement('video'); video.muted = true; video.playsInline = true
        video.srcObject = c.captureStream(30); video.play()
        return { video, timer }
    }
    const clip = (name) => {
        const video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true
        video.crossOrigin = 'anonymous'; video.src = `${clipBase}/${name}`; video.play()
        return { video }
    }
    const feeds = { cam: feed(1920, 1080, 10), web: feed(640, 480, 200), clipA: clip('clipa.mp4'), clipB: clip('clipb.mp4') }
    const nodes = [
        { id: 'cam', type: 'top.camera', values: {} }, { id: 'web', type: 'top.camera', values: {} },
        { id: 'clipA', type: 'top.clip', values: {} }, { id: 'clipB', type: 'top.clip', values: {} },
        { id: 'm1', type: 'top.blend', values: {} }, { id: 'm2', type: 'top.blend', values: {} },
        { id: 'm3', type: 'top.blend', values: {} }, { id: 'fb', type: 'top.feedback', values: {} },
        { id: 'lv', type: 'top.level', values: {} }
    ]
    const wires = [
        { from: 'cam', to: 'm1', port: 'a' }, { from: 'web', to: 'm1', port: 'b' },
        { from: 'clipA', to: 'm2', port: 'a' }, { from: 'clipB', to: 'm2', port: 'b' },
        { from: 'm1', to: 'm3', port: 'a' }, { from: 'm2', to: 'm3', port: 'b' },
        { from: 'm3', to: 'fb', port: 'a' }, { from: 'fb', to: 'lv', port: 'a' }
    ]
    engine.setNetwork({ nodes, wires })
    for (const [id, f] of Object.entries(feeds)) engine.setVideo(id, f.video)
    // Thumbnails: one 160x90 2D canvas per node, like the cards on the deck.
    const targets = new Map()
    for (const n of nodes) { const c = document.createElement('canvas'); c.width = 160; c.height = 90; targets.set(n.id, c.getContext('2d')) }

    const scheduler = plan && plan.createThumbnailScheduler()
    const stats = { raf: 0, engine: 0, thumbs: 0, uploads: 0, uploadMs: 0, uploadPx: 0 }
    // Count and time every video upload (the wrapper's own cost is two clock reads).
    const gl = engine.gl; const realTex = gl.texImage2D.bind(gl)
    gl.texImage2D = (...a) => {
        const src = a[a.length - 1]
        if (src instanceof HTMLVideoElement) {
            const t = performance.now(); realTex(...a)
            stats.uploads += 1; stats.uploadMs += performance.now() - t; stats.uploadPx += src.videoWidth * src.videoHeight
        } else realTex(...a)
    }
    let count = 0
    const loop = (now) => {
        requestAnimationFrame(loop)
        stats.raf += 1
        engine.frame(now); stats.engine += 1; count += 1
        if (plan) {
            for (const mine of scheduler.due([targets], (id) => engine.has(id), now)) { engine.thumbnails(mine); stats.thumbs += mine.size }
        } else if (count % 3 === 0) {
            engine.thumbnails(targets); stats.thumbs += targets.size
        }
        engine.show('lv')
    }
    requestAnimationFrame(loop)
    window.__bench = { stats, plan: !!plan, sizes: Object.fromEntries(Object.entries(feeds).map(([k, f]) => [k, [f.video.videoWidth, f.video.videoHeight]])), feeds }
    return true
}

;(async () => {
    const server = await serveClips()
    const clipBase = `http://127.0.0.1:${server.address().port}`
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const context = browser.contexts()[0] || await browser.newContext()
    const page = await context.newPage()
    await page.goto(URL_, { waitUntil: 'domcontentloaded' })
    await page.evaluate(inPage, { clipBase })
    await page.waitForTimeout(3000)
    const sizes = await page.evaluate(() => ({ ...window.__bench.sizes, nowSizes: Object.fromEntries(Object.entries(window.__bench.feeds).map(([k, f]) => [k, [f.video.videoWidth, f.video.videoHeight, f.video.readyState]])) }))
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const s0 = await page.evaluate(() => ({ ...window.__bench.stats }))
    const m0 = await metrics()
    await cdp.send('Profiler.start')
    await page.waitForTimeout(SECONDS * 1000)
    const { profile } = await cdp.send('Profiler.stop')
    const m1 = await metrics()
    const s1 = await page.evaluate(() => ({ ...window.__bench.stats }))
    const secs = (m1.Timestamp - m0.Timestamp)
    const self = new Map()
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const dt = profile.timeDeltas; const total = dt.reduce((a, b) => a + b, 0)
    profile.samples.forEach((id, i) => {
        const f = byId.get(id).callFrame
        const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`
        self.set(key, (self.get(key) || 0) + (dt[i] || 0))
    })
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, +(v / 1000 / secs).toFixed(1)])
    const result = {
        plan: await page.evaluate(() => window.__bench.plan), seconds: +secs.toFixed(1), sizes,
        scriptMsPerSec: +((m1.ScriptDuration - m0.ScriptDuration) * 1000 / secs).toFixed(1),
        taskMsPerSec: +((m1.TaskDuration - m0.TaskDuration) * 1000 / secs).toFixed(1),
        rafFps: +((s1.raf - s0.raf) / secs).toFixed(1), engineFps: +((s1.engine - s0.engine) / secs).toFixed(1),
        uploadsPerSec: +((s1.uploads - s0.uploads) / secs).toFixed(1), uploadMsPerSec: +((s1.uploadMs - s0.uploadMs) / secs).toFixed(1),
        uploadMpxPerSec: +((s1.uploadPx - s0.uploadPx) / secs / 1e6).toFixed(1),
        thumbDrawsPerSec: +((s1.thumbs - s0.thumbs) / secs).toFixed(1),
        topSelfMsPerSec: top
    }
    console.log(JSON.stringify(result, null, 1))
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1))
    await page.close(); server.close(); await browser.close().catch(() => {})
})().catch((e) => { console.error('BENCH FAILED', e); process.exit(1) })
