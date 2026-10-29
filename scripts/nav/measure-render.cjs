// Render-side audit of the Studio viewport (2026-10-12, owner: "movement is not smooth"; see
// docs/ai/research/render-smoothness-audit-2026-10-12.md). Read-only: no app hook; the page is
// instrumented from outside (rAF wrapper, renderer.render wrapper, GPU timer queries), found
// through the React fibre tree like measure-pan-after-zoom.cjs.
// Usage (real GPU, agent screen):
//   R_URL=http://studio-nav-test.diiii.localhost/moxir/studio/projects/moxir-v1-1 R_DPR=1.5 \
//   R_VARIANTS=noglow,nosmaa,noexposure,lightsoff R_OUT=/path/raw.json di-test-browser run scripts/nav/measure-render.cjs
// R_W/R_H = CSS viewport (default 2560x1440, the owner's panel), R_DPR = deviceScaleFactor (Emulation override).
const { chromium } = require('playwright')
const fs = require('fs')
const URL = process.env.R_URL
const DPR = Number(process.env.R_DPR || 1.5)
const W = Number(process.env.R_W || 2560), H = Number(process.env.R_H || 1440)
const VARIANTS = (process.env.R_VARIANTS || '').split(',').filter(Boolean)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Before any page script: group every rAF callback by frame timestamp (CPU time per frame), count React commits.
const initScript = () => {
    const R = window.__rp = { frames: [], cur: null, commits: 0, roots: new Set() }
    try {
        if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1 }, onCommitFiberRoot(id, root) {
                R.commits++; if (!root) return; R.roots.add(root)
                if (!R.diag) return
                const isR3F = !root.containerInfo?.nodeType
                R.diag.byRoot[isR3F ? 'r3f' : 'dom'] = (R.diag.byRoot[isR3F ? 'r3f' : 'dom'] || 0) + 1
                const st = [root.current]; let k = 0
                while (st.length && k++ < 60000) { const f = st.pop(); if (!f) continue
                    if ((f.flags & 1) && typeof f.type === 'function') { const n = (isR3F ? 'r3f:' : '') + (f.type.displayName || f.type.name || '?'); R.diag.names[n] = (R.diag.names[n] || 0) + 1
                        let up = f.return; while (up && typeof up.type !== 'function') up = up.return
                        if (!up || !(up.flags & 1)) { const t = 'TOP ' + n + ' <' + (up ? (up.type.displayName || up.type.name || '?') : 'root'); R.diag.names[t] = (R.diag.names[t] || 0) + 1 } }
                    if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child) }
            }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {}, isDisabled: false }
        }
    } catch { /* counting commits is optional */ }
    R.loaf = []
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) R.loaf.push({ t: e.startTime, d: e.duration, block: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, scripts: (e.scripts || []).map((x) => [x.invoker, x.invokerType, (x.sourceURL || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, ''), x.sourceFunctionName, Math.round(x.duration)]) }) }).observe({ type: 'long-animation-frame', buffered: true }) } catch { /* no LoAF */ }
    const orig = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => orig((ts) => {
        let f = R.cur
        if (!f || f.ts !== ts) {
            f = R.cur = { ts, cpu: 0, n: 0, r: 0 }
            R.frames.push(f)
            if (R.poll) R.poll()
        }
        const t0 = performance.now()
        try { cb(ts) } finally { f.cpu += performance.now() - t0; f.n++ }
    })
}

const install = () => {
    const R = window.__rp
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    // the R3F scene is its own React root (the Canvas reconciler): reached through the commits the hook saw
    const stack = [rootEl[key], ...[...(R.roots || [])].map((r) => r.current)]
    let cc = null, store = null
    while (stack.length && !(cc && store)) {
        const f = stack.pop()
        if (!f) continue
        if (!store) { const v = f.memoizedProps?.value; try { if (v && typeof v.getState === 'function' && v.getState()?.gl?.render) store = v } catch { /* not a store */ } }
        if (!cc) for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) {
            const s = h.memoizedState
            if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break }
        }
        if (f.sibling) stack.push(f.sibling)
        if (f.child) stack.push(f.child)
    }
    if (!cc || !store) return `cc=${!!cc} store=${!!store} roots=${R.roots?.size} commits=${R.commits} diRoom=${!!window.__diRoom}`
    if (R.installed) return true
    R.installed = true
    R.cc = cc; R.store = store
    const r = store.getState().gl
    const ctx = r.getContext()
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
    R.ext = !!ext
    r.info.autoReset = false
    const pending = []
    const origRender = r.render.bind(r)
    r.render = function (s, c) {
        const f = R.cur
        if (f && !f.r) {
            r.info.reset()
            let q = null
            if (ext) { q = ctx.createQuery(); ctx.beginQuery(ext.TIME_ELAPSED_EXT, q) }
            queueMicrotask(() => {
                if (q) { ctx.endQuery(ext.TIME_ELAPSED_EXT); pending.push([q, f]) }
                f.calls = r.info.render.calls; f.tris = r.info.render.triangles
                f.w = ctx.drawingBufferWidth; f.h = ctx.drawingBufferHeight
            })
        }
        if (f) f.r++
        const t0 = performance.now()
        try { return origRender(s, c) } finally { if (f) f.rcpu = (f.rcpu || 0) + performance.now() - t0 }
    }
    R.poll = () => {
        if (!ext) return
        const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT)
        while (pending.length && ctx.getQueryParameter(pending[0][0], ctx.QUERY_RESULT_AVAILABLE)) {
            const [q, f] = pending.shift()
            f.gpu = disjoint ? null : ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6
            ctx.deleteQuery(q)
        }
    }
    // camera every rAF: the real camera vs camera-controls' end pose (a truncated ease leaves a gap)
    const V = cc._camera.position.constructor
    const end = new V()
    const tick = () => {
        const f = R.cur
        if (f) {
            const p = cc._camera.position
            cc.getPosition(end, true)
            f.cam = [p.x, p.y, p.z]; f.gapToEnd = p.distanceTo(end)
            f.loop = store.getState().frameloop
            f.q = r.domElement.dataset.quality
            f.drawn = window.__diStudioFrames ? window.__diStudioFrames() : null
        }
        if (R.force) store.getState().invalidate()
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return true
}

const inventory = () => {
    const R = window.__rp
    const st = R.store.getState()
    const r = st.gl, scene = st.scene, ctx = r.getContext()
    const lights = {}, mats = new Map(), out = { meshes: 0, visibleMeshes: 0, instanced: 0, instances: 0, transparent: 0, castShadowMeshes: 0, shadowLights: 0, points: 0, lines: 0, skinned: 0 }
    scene.traverse((o) => {
        if (o.isLight) { lights[o.type] = (lights[o.type] || 0) + (o.visible ? 1 : 0); if (o.castShadow && o.visible) out.shadowLights++ }
        if (o.isMesh) {
            out.meshes++
            let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break }
            if (vis) out.visibleMeshes++
            if (o.isInstancedMesh) { out.instanced++; out.instances += o.count }
            if (o.isSkinnedMesh) out.skinned++
            if (o.castShadow) out.castShadowMeshes++
            for (const m of [].concat(o.material)) if (m) mats.set(m.uuid, m)
        }
        if (o.isPoints) out.points++
        if (o.isLine) out.lines++
    })
    const matTypes = {}
    for (const m of mats.values()) { matTypes[m.type] = (matTypes[m.type] || 0) + 1; if (m.transparent) out.transparent++ }
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
    const room = window.__diRoom
    return {
        renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a',
        timerQuery: R.ext,
        ctxAttrs: ctx.getContextAttributes(),
        pixelRatio: r.getPixelRatio(), dprState: st.viewport.dpr, devicePixelRatio: window.devicePixelRatio,
        canvasCss: [st.size.width, st.size.height], drawingBuffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
        shadowMap: { enabled: r.shadowMap.enabled, type: r.shadowMap.type, autoUpdate: r.shadowMap.autoUpdate },
        toneMapping: r.toneMapping, exposure: r.toneMappingExposure, outputColorSpace: r.outputColorSpace,
        fog: scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null, environment: !!scene.environment,
        lights, ...out, materials: mats.size, matTypes,
        programs: r.info.programs?.length, memory: { ...r.info.memory },
        frameloop: st.frameloop, quality: r.domElement.dataset.quality,
        bloomPath: !!room?.passes, passes: room?.passes?.composer?.passes?.map((p) => `${p.constructor.name}:${p.enabled ? 1 : 0}`),
        composerSize: room?.passes ? [room.passes.target.width, room.passes.target.height] : null
    }
}

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) }
const st = (a) => a.length ? { n: a.length, med: pct(a, 0.5), p90: pct(a, 0.9), p99: pct(a, 0.99), max: +Math.max(...a).toFixed(2) } : null
const summarise = (name, fr, commits) => {
    const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(fr[i].ts - fr[i - 1].ts)
    const drawn = fr.filter((f) => f.r > 0)
    const sizes = [...new Set(drawn.map((f) => `${f.w}x${f.h}`))]
    const loops = [...new Set(fr.map((f) => f.loop))]
    const qs = [...new Set(fr.map((f) => f.q))]
    let moved = 0; for (let i = 1; i < fr.length; i++) if (fr[i].cam && fr[i - 1].cam && Math.hypot(fr[i].cam[0] - fr[i - 1].cam[0], fr[i].cam[1] - fr[i - 1].cam[1], fr[i].cam[2] - fr[i - 1].cam[2]) > 1e-5) moved++
    return {
        name, rafTicks: fr.length, framesDrawn: drawn.length, framesWithCameraMotion: moved, reactCommits: commits,
        rafGapMs: st(gaps), over20ms: gaps.filter((g) => g > 20).length, over33ms: gaps.filter((g) => g > 33).length,
        cpuAllRafMs: st(drawn.map((f) => f.cpu)), cpuRenderMs: st(drawn.map((f) => f.rcpu || 0)),
        gpuMs: st(drawn.map((f) => f.gpu).filter((g) => g != null)), renderCallsPerFrame: st(drawn.map((f) => f.r)),
        drawCalls: st(drawn.map((f) => f.calls || 0)), triangles: pct(drawn.map((f) => f.tris || 0), 0.5),
        bufferSizes: sizes, frameloop: loops, quality: qs
    }
}

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const page = await browser.contexts()[0].newPage()
    const bye = async (code) => { await page.close().catch(() => {}); process.exit(code) }
    process.on('SIGINT', () => bye(130)); process.on('SIGTERM', () => bye(143))
    try {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false })
        await page.addInitScript(initScript)
        await page.goto(URL, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('canvas', { timeout: 60000 })
        let ok = false
        for (let i = 0; i < 60 && ok !== true; i++) { await sleep(1000); ok = await page.evaluate(install) }
        if (ok !== true) { console.log('NOT FOUND', ok); return bye(2) }
        // settle: the model streams in; wait until the mesh count holds for 3 s
        let last = -1, sameFor = 0
        for (let i = 0; i < 40 && sameFor < 3; i++) { await sleep(1000); const n = await page.evaluate(() => { let c = 0; window.__rp.store.getState().scene.traverse((o) => { if (o.isMesh) c++ }); return c }); sameFor = n === last ? sameFor + 1 : 0; last = n }
        await sleep(3000)
        const inv = await page.evaluate(inventory)
        console.log('INV', JSON.stringify(inv))
        const box = await page.locator('canvas').first().boundingBox()
        const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5
        const mark = () => page.evaluate(() => [window.__rp.frames.length, window.__rp.commits])
        const take = async (name, from) => { const fr = await page.evaluate((a) => window.__rp.frames.slice(a).map(({ ts, cpu, n, r, rcpu, gpu, calls, tris, w, h, cam, gapToEnd, loop, q, drawn }) => ({ ts, cpu, n, r, rcpu, gpu, calls, tris, w, h, cam, gapToEnd, loop, q, drawn })), from[0]); const c = await page.evaluate(() => window.__rp.commits); return { s: summarise(name, fr, c - from[1]), fr } }
        const raw = { url: URL, dpr: DPR, css: [W, H], inv, runs: [] }
        const record = (x) => { console.log('RUN', JSON.stringify(x.s)); raw.runs.push(x) }
        const drag = async (ms, px) => {
            await page.mouse.move(cx, cy); await page.mouse.down({ button: 'left' })
            const t0 = Date.now(); let i = 0
            while (Date.now() - t0 < ms) { i++; const k = (Date.now() - t0) / ms; await page.mouse.move(cx + px * Math.sin(k * Math.PI * 2) / 2, cy + 40 * Math.sin(k * Math.PI * 4)); await sleep(8) }
            await page.mouse.up({ button: 'left' })
            return i
        }

        if (process.env.R_MODE === 'ab') {
            // who commits while nobody touches anything
            await page.mouse.move(cx, cy); await sleep(2500)
            await page.evaluate(() => { window.__rp.diag = { byRoot: {}, names: {} } })
            let m0 = await mark(); await sleep(3000)
            const idle = await take('idle-3s', m0); record(idle)
            console.log('LOAF-IDLE', JSON.stringify(await page.evaluate((t) => { const L = window.__rp.loaf.filter((e) => e.t >= t); return { n: L.length, maxMs: Math.max(0, ...L.map((e) => e.d)), top: L.flatMap((e) => e.scripts).sort((a, b) => b[4] - a[4]).slice(0, 4) } }, idle.fr[0]?.ts || 0)))
            console.log('IDLE-COMMITS', JSON.stringify(await page.evaluate(() => { const d = window.__rp.diag; window.__rp.diag = null; return { byRoot: d.byRoot, top: Object.entries(d.names).filter(([k]) => k.startsWith('TOP')).sort((a, b) => b[1] - a[1]).slice(0, 10) } })))
            const pose = await page.evaluate(() => { const cc = window.__rp.cc, V = cc._camera.position.constructor; const p = cc.getPosition(new V()), t = cc.getTarget(new V()); return [p.x, p.y, p.z, t.x, t.y, t.z] })
            console.log('POSE', JSON.stringify(pose.map((v) => +v.toFixed(2))))
            const AB = (process.env.R_AB || 'base,noglow,nosmaa,shadowfrozen,noshadows,lightsoff,dpr1,dpr1.25,dpr2,shadowfrozen+dpr1.25,base').split(',')
            for (const v of AB) {
                const applied = await page.evaluate(([v, pose]) => {
                    const R = window.__rp, st = R.store.getState(), r = st.gl, scene = st.scene, room = window.__diRoom
                    R.cc.setLookAt(...pose, false)
                    const did = []
                    for (const part of v.split('+')) {
                        if (part === 'noglow' && room) { room.debug = room.debug || {}; room.debug.noGlow = true; did.push(part) }
                        if (part === 'nosmaa' && room?.passes) { room.passes.smaa.enabled = false; did.push(part) }
                        if (part === 'shadowfrozen') { r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true; did.push(part) }
                        if (part === 'noshadows') { r.shadowMap.enabled = false; did.push(part) }
                        if (part === 'lightsoff') { R.off = []; scene.traverse((o) => { if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight && o.visible) { o.visible = false; R.off.push(o) } }); did.push(part + ':' + R.off.length) }
                        if (part === 'noshadowcast') { R.cast = []; scene.traverse((o) => { if (o.isLight && o.castShadow) { o.castShadow = false; R.cast.push(o) } }); did.push(part + ':' + R.cast.length) }
                        if (part === 'spots48') { R.off = []; let k = 0; scene.traverse((o) => { if (o.isSpotLight && o.visible && !o.castShadow && k < 48) { o.visible = false; R.off.push(o); k++ } }); did.push(part + ':' + R.off.length) }
                        if (part === 'nobeams') { R.hid = []; scene.traverse((o) => { if (o.isMesh && o.visible && [].concat(o.material).some((m) => m?.isShaderMaterial)) { o.visible = false; R.hid.push(o) } }); did.push(part + ':' + R.hid.length) }
                        if (part.startsWith('dpr')) { st.setDpr(Number(part.slice(3))); did.push(part) }
                    }
                    R.force = true
                    return did.join('+') || 'base'
                }, [v, pose])
                await sleep(2000) // warm-up: recompiles, clock ramp
                const m = await mark(); await sleep(2000)
                const x = await take(`ab:${v}`, m); x.s.applied = applied; record(x)
                await page.evaluate(() => {
                    const R = window.__rp, st = R.store.getState(), r = st.gl, room = window.__diRoom
                    R.force = false
                    if (room?.debug) room.debug.noGlow = false
                    if (room?.passes) room.passes.smaa.enabled = true
                    r.shadowMap.autoUpdate = true; r.shadowMap.enabled = true
                    ;(R.off || []).forEach((o) => { o.visible = true }); R.off = []
                    ;(R.hid || []).forEach((o) => { o.visible = true }); R.hid = []
                    ;(R.cast || []).forEach((o) => { o.castShadow = true }); R.cast = []
                    st.setDpr(window.devicePixelRatio)
                })
                await sleep(1500)
            }

            // cold start: let the view rest (no forced frames), then drag; the first frames show any GPU clock ramp
            // R_WARM=1: the pointer rests OFF the view and arrives 500 ms before the drag (the pointerover kick warms the GPU clock);
            // default: the pointer rests on the view, so no input precedes the drag.
            if (process.env.R_WARM === '1') { await page.mouse.move(5, 5); await sleep(6000); await page.mouse.move(cx, cy); await sleep(500) }
            else { await page.mouse.move(cx, cy); await sleep(6000) }
            const mc = await mark(); await drag(2000, 700)
            const cs = await take('cold-start-drag-2s', mc); record(cs)
            const t0c = cs.fr[0]?.ts || 0
            console.log('COLD', JSON.stringify(cs.fr.filter((f) => f.r > 0).slice(0, 30).map((f) => [Math.round(f.ts - t0c), f.gpu == null ? null : +f.gpu.toFixed(1)])))
            console.log('LOAF-DRAG', JSON.stringify(await page.evaluate((t) => { const L = window.__rp.loaf.filter((e) => e.t >= t); return { n: L.length, durs: L.map((e) => Math.round(e.d)), top: L.flatMap((e) => e.scripts).sort((a, b) => b[4] - a[4]).slice(0, 5) } }, t0c)))
            console.log('COLD-T0-EPOCH', Date.now() - (await page.evaluate(() => performance.now())) + t0c)
            if (process.env.R_OUT) fs.writeFileSync(process.env.R_OUT, JSON.stringify(raw))
            return bye(0)
        }
        await page.mouse.move(cx, cy); await sleep(2500)
        let m = await mark(); await sleep(3000); record(await take('idle-3s', m))
        m = await mark(); const moves = await drag(3000, 700); record(await take(`orbit-drag-3s(${moves} moves)`, m))
        m = await mark(); await sleep(2000); record(await take('after-drag-2s', m))
        await sleep(1000)
        m = await mark(); { const t0 = Date.now(); let k = 0; while (Date.now() - t0 < 3000) { await page.mouse.wheel(0, k++ % 30 < 15 ? -100 : 100); await sleep(100) } } record(await take('wheel-burst-3s', m))
        await sleep(2500)
        m = await mark(); await page.mouse.wheel(0, -100); await sleep(2000)
        {
            const x = await take('single-notch-2s', m); record(x)
            const t0 = x.fr[0]?.ts || 0
            const rows = x.fr.map((f, i) => ({ t: f.ts - t0, drawn: f.r > 0, mv: i && f.cam && x.fr[i - 1].cam ? Math.hypot(f.cam[0] - x.fr[i - 1].cam[0], f.cam[1] - x.fr[i - 1].cam[1], f.cam[2] - x.fr[i - 1].cam[2]) : 0, gap: f.gapToEnd }))
            const lastMove = rows.filter((r) => r.mv > 1e-5).pop(), lastDrawn = rows.filter((r) => r.drawn).pop()
            console.log('NOTCH', JSON.stringify({ drawnIn400ms: rows.filter((r) => r.t <= 400 && r.drawn).length, ticksIn400ms: rows.filter((r) => r.t <= 400).length, lastMotionMs: lastMove ? +lastMove.t.toFixed(0) : null, lastDrawnMs: lastDrawn ? +lastDrawn.t.toFixed(0) : null, gapToEndAtEnd: +(rows[rows.length - 1]?.gap ?? 0).toFixed(5), motionPerFrame: rows.filter((r) => r.mv > 1e-5).slice(0, 40).map((r) => +r.mv.toFixed(3)) }))
        }
        for (const v of VARIANTS) {
            const setv = (on) => page.evaluate(([v, on]) => {
                const room = window.__diRoom, R = window.__rp, scene = R.store.getState().scene
                if (v === 'noglow' && room) { room.debug = room.debug || {}; room.debug.noGlow = on }
                if (v === 'noexposure' && room) { room.debug = room.debug || {}; room.debug.noExposure = on }
                if (v === 'nosmaa' && room?.passes) room.passes.smaa.enabled = !on
                if (v === 'lightsoff') { if (on) { R.off = []; scene.traverse((o) => { if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight && o.visible) { o.visible = false; R.off.push(o) } }) } else { (R.off || []).forEach((o) => { o.visible = true }) } return R.off?.length }
                if (v === 'noshadows') { const r = R.store.getState().gl; r.shadowMap.enabled = !on }
                return !!room
            }, [v, on])
            const applied = await setv(true)
            await page.mouse.move(cx, cy); await sleep(400); await drag(800, 300); await sleep(1500) // warm: recompiles land here
            m = await mark(); const n = await drag(2000, 700); record(await take(`variant:${v}(applied=${applied},${n} moves)`, m))
            await setv(false); await sleep(1500)
        }
        m = await mark(); await drag(2000, 700); record(await take('baseline-again-2s', m))
        if (process.env.R_OUT) fs.writeFileSync(process.env.R_OUT, JSON.stringify(raw))
        if (process.env.R_SHOT) await page.screenshot({ path: process.env.R_SHOT })
        await bye(0)
    } catch (e) { console.log('ERROR', e && e.message); await bye(1) }
})()
