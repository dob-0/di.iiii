#!/usr/bin/env node
/*
 * lite-vs-full-gpu.cjs — Lite and Full, side by side, on a REAL GPU: frame time, the spot lights three.js really
 * holds, and what the light pool's slots put on the picture. One run, one test-browser call.
 * (MOXIR lead, 2026-10-09: "Full on the RTX 3080 with today's code has never been measured"; many-lights plan §4 M0.)
 *
 *   di-dev up <tree> --api scratch      # the tree's stack, holding the scene (scripts/rigbuild/copy-version.mjs)
 *   timeout 1200 di-test-browser run scripts/measure/lite-vs-full-gpu.cjs \
 *       --base http://<tree>.diiii.localhost --space moxir --project moxir-v2-stage-lasers --look peak --out <dir> [--only a,b] [--smoke]
 * `di-test-browser run` takes a free lane under its lock and waits until the CPU package is at or below 85 C (the owner's heat
 * rule); DI_TEST_LANE=<n> pins a lane. Between conditions the script waits for the same limit itself (--heat <C>, default 85) with the page
 * blank. --smoke: one condition, short, to check the instruments before the real run.
 *
 * Nothing is written to any server: the browser's copy of the project document is changed on the way in (Playwright
 * intercepts GET /api/projects/<id>/document, as moxir-v2-true-frames.cjs does): one cue holds the look asked for. The
 * opening view is the document's own.
 *
 * CONDITIONS (each a fresh page load)
 *   lite       the room as everyone opens it (Lite, the pool of 4)          — owner's view
 *   full       ?quality=full                                                — owner's view
 *   fullpool   ?quality=full&lightPool=1 (Full renderer, the pool of 8)     — owner's view
 *   lite-meas  Lite in measurement mode (docs/architecture/MEASUREMENT_MODE.md): lux on the floor, lux at the slots' aim
 *   full-meas  Full in measurement mode: lux at the same points
 *   par-meas   Lite in measurement mode with the B380F lamps held at 0 in the browser's copy, so the pool's slots take PL5403
 *              washes (the case the fit bug is about): the slot's cone as the room draws it, as the old code drew it (the raw
 *              half-beam angle as the cutoff), and the slot off — in lux at points on its own cone, and in the picture
 *
 * WHAT IS MEASURED, AND HOW (the limits are in the output too)
 *   - GPU-side spot count: every shader source the page gives WebGL is read (WebGL{,2}RenderingContext.shaderSource, hooked
 *     before the page's scripts run) for `#define NUM_SPOT_LIGHTS n`; plus the SpotLight objects three.js holds (below).
 *   - The lights as three.js holds them: the scene's SpotLights, found through the R3F store that every R3F object carries
 *     (`__r3f.root`) — reached by the SAME three.js module instance the dev server gave the page (import of /deps/three.js),
 *     so it works in Lite, where `window.__diRoom` does not exist (HdrBloom.jsx sets it only with bloom). Dev server only.
 *   - Frame time. The browser's frame cap CANNOT be lifted from here (the shared test browser is launched without
 *     --disable-gpu-vsync --disable-frame-rate-limit, and is not ours to restart), so three numbers are given:
 *       capped    rAF cadence of the page's own loop (what the owner's screen gets), and the main-thread time the page's
 *                 rAF callbacks take per frame (all the app's JS in the frame);
 *       gpu       EXT_disjoint_timer_query_webgl2 around each rAF callback, when the browser offers it (GPU time per frame,
 *                 independent of vsync); said "not offered" when it does not;
 *       uncapped  the app's own render call (renderer.render, or the HDR composer in Full) in a tight loop, no React, no
 *                 rAF: pipelined (N frames, then finish) and synchronous (each frame followed by a 1-pixel readback).
 *     The uncapped loop leaves out the app's per-frame JS (poses, haze clock), which the `capped` main-thread time shows.
 *   - The slots' share of the picture: the frame is drawn by the app's own path, read back (RGBA8, what the screen shows),
 *     drawn again with the slots at 0, and compared pixel by pixel (Rec.709 luma of the display values).
 *   - Lux: the measurement mode's probe (an ideal white Lambertian patch read back before tone mapping, E = π L).
 *
 * Refuses a software renderer. Needs: DI_TEST_CDP (set by `di-test-browser run`), a tree's dev server (not a build).
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('../place/close-on-signal.cjs')

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const BASE = String(arg('base', 'http://lite-fit.diiii.localhost')).replace(/\/+$/, '')
const SPACE = arg('space', 'moxir')
const PROJECT = arg('project', 'moxir-v2-stage-lasers')
const LOOK = arg('look', 'peak')
const OUT = path.resolve(String(arg('out', '.')))
const SMOKE = process.argv.includes('--smoke')
const HEAT_LIMIT = Number(arg('heat', 85))
const ONLY = arg('only') ? new Set(String(arg('only')).split(',')) : null
const SIZES = SMOKE ? [[1280, 720]] : [[1280, 720], [2560, 1340]]
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|lavapipe/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- pure helpers (tested in lite-vs-full-gpu.test.js) -------------------------------------------------------------

/** three's spot falloff: smoothstep(cos cutoff, cos(cutoff·(1−penumbra)), cos θ) (lights_pars_begin getSpotAttenuation). */
const falloff = (theta, { angle, penumbra }) => {
    const lo = Math.cos(angle)
    const hi = Math.cos(angle * (1 - penumbra))
    const t = Math.min(1, Math.max(0, (Math.cos(theta) - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)
}
/** Rec.709 luminance of an sRGB hex colour (no #), as a linear number: the share of a lamp's candela that is photometric (the lux probe reads luminance). */
const lumY = (hex) => {
    const c = [0, 2, 4].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
/** The lumens of three's cone per candela of peak: 2π ∫₀^cutoff falloff(θ) sin θ dθ (steradians). */
const coneSr = (cone) => {
    const n = 20000
    let s = 0
    for (let i = 0; i < n; i += 1) {
        const t = ((i + 0.5) / n) * cone.angle
        s += falloff(t, cone) * Math.sin(t)
    }
    return 2 * Math.PI * s * (cone.angle / n)
}
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : null)
/** n, mean, median, p95, p99, min, max of a list of numbers (nearest-rank quantiles). */
const stats = (values) => {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b)
    if (!v.length) return { n: 0 }
    const r = (x) => Math.round(x * 1000) / 1000
    return { n: v.length, mean: r(v.reduce((a, b) => a + b, 0) / v.length), median: r(quantile(v, 0.5)), p95: r(quantile(v, 0.95)), p99: r(quantile(v, 0.99)), min: r(v[0]), max: r(v[v.length - 1]) }
}
/** The browser's copy of the project document: one cue holds `look`; `zeroWords` hold the levels of groups whose key has a word at 0. */
const docFor = (doc, { look, zeroWords = [] }, now = Date.now()) => {
    const cue = { id: `held-${look}`, name: `held: ${look}`, key: '', fade: 0, hold: 3600, lightLook: `rig-${look}`, surfaces: {} }
    doc.mappingState = { ...(doc.mappingState || {}), cues: [cue], loop: true, showEpoch: now - 500, showSource: 'clock' }
    if (zeroWords.length) {
        const show = (doc.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks))
        for (const lk of show ? show.components.rigLooks.looks : []) {
            for (const key of Object.keys(lk.levels || {})) if (zeroWords.some((w) => key.includes(w))) lk.levels[key] = 0
        }
    }
    return doc
}
/**
 * The owner's heat rule (the package above `limit` C waits) applied BETWEEN conditions: `di-test-browser run` checks it only
 * when a call starts, and a run of several scene loads climbed from 75 to 98 C inside one call (2026-10-10). Waits in steps,
 * with the page blank so the GPU is idle; gives up after `maxWaitS` and says so (the caller then refuses the condition).
 */
const waitCool = async (limit, maxWaitS, { temp = packageTemp, pause = sleep, say = console.log } = {}) => {
    const t0 = Date.now()
    const start = temp()
    let t = start
    while (t !== null && t > limit && Date.now() - t0 < maxWaitS * 1000) {
        say(`   heat: package ${t} C > ${limit} C, waiting 15 s`)
        await pause(15000)
        t = temp()
    }
    return { limit, start, now: t, waited_s: Math.round((Date.now() - t0) / 1000), ok: t === null || t <= limit }
}
/** Package temperature, °C (coretemp), or null. */
const packageTemp = () => {
    try {
        for (const h of fs.readdirSync('/sys/class/hwmon')) {
            const dir = path.join('/sys/class/hwmon', h)
            if (fs.readFileSync(path.join(dir, 'name'), 'utf8').trim() === 'coretemp') return Math.round(Number(fs.readFileSync(path.join(dir, 'temp1_input'), 'utf8')) / 1000)
        }
    } catch { /* no sensor */ }
    return null
}

// ---- the page side, installed before any script of the page runs -----------------------------------------------------
// Self-contained: Playwright sends this function's source into the page.
const initProbe = () => {
    const P = (window.__lf = { shaders: [], compiles: 0, contexts: [], raf: { on: false, frames: [], cur: null, gl: null, ext: null, pending: [], gpu: [] }, store: null, THREE: null })
    const protos = [window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype, window.WebGLRenderingContext && window.WebGLRenderingContext.prototype].filter(Boolean)
    for (const proto of protos) {
        const orig = proto.shaderSource
        proto.shaderSource = function (shader, source) {
            try {
                P.compiles += 1
                const src = String(source)
                if (/pc_fragColor|gl_FragColor/.test(src)) {
                    // three r186 writes the count into the source (WebGLProgram replaceLightNums), so no `#define NUM_SPOT_LIGHTS` is left: it is the
                    // size of the lights chunk's `uniform SpotLight spotLights[ N ]` (the chunk is absent from unlit materials: null)
                    const m = /uniform\s+SpotLight\s+spotLights\s*\[\s*(\d+)\s*\]/.exec(src)
                    const s = /uniform\s+sampler2D\s+spotShadowMap\s*\[\s*(\d+)\s*\]/.exec(src)
                    P.shaders.push({ spot: m ? Number(m[1]) : null, spotShadows: s ? Number(s[1]) : 0, bytes: src.length })
                }
            } catch { /* never break the page */ }
            return orig.call(this, shader, source)
        }
    }
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const ctx = getContext.call(this, type, ...rest)
        if (ctx && /webgl/.test(String(type))) P.contexts.push({ canvas: this, ctx })
        return ctx
    }
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((t) => {
        const R = P.raf
        if (!R.on) return cb(t)
        const t0 = performance.now()
        let q = null
        if (R.ext && R.gl) {
            try {
                if (!R.gl.getQuery(R.ext.TIME_ELAPSED_EXT, R.gl.CURRENT_QUERY)) {
                    q = R.gl.createQuery()
                    R.gl.beginQuery(R.ext.TIME_ELAPSED_EXT, q)
                }
            } catch { q = null }
        }
        try {
            return cb(t)
        } finally {
            if (q) {
                try { R.gl.endQuery(R.ext.TIME_ELAPSED_EXT); R.pending.push({ q, t }) } catch { /* lost context */ }
            }
            if (!R.cur || R.cur.t !== t) { R.cur = { t, cpu: 0 }; R.frames.push(R.cur) }
            R.cur.cpu += performance.now() - t0
        }
    })
}

// ---- the page side, run after load: each returns plain JSON --------------------------------------------------------------

/** Find three's module the page uses, hook it, and wait for the R3F store of the main canvas. */
const pageAttach = async () => {
    const P = window.__lf
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/deps\/three\.js(\?|$)/.test(n))
    if (!url) return { ok: false, why: 'no /deps/three.js in the resource list (not a dev server?)' }
    const THREE = await import(url)
    P.THREE = THREE
    if (!P.hooked) {
        const proto = THREE.Object3D.prototype
        const orig = proto.updateMatrixWorld
        proto.updateMatrixWorld = function (...a) {
            if (!P.store) {
                const root = this.__r3f && this.__r3f.root
                if (root && typeof root.getState === 'function') {
                    const s = root.getState()
                    if (s && s.gl && s.gl.domElement && s.gl.domElement.isConnected && s.gl.domElement.width > 200 && s.scene && s.camera) P.store = root
                }
            }
            return orig.apply(this, a)
        }
        P.hooked = true
    }
    for (let i = 0; i < 150 && !P.store; i += 1) await new Promise((r) => setTimeout(r, 100))
    if (!P.store) return { ok: false, why: 'the R3F store of the main canvas did not show up in 15 s' }
    const { gl } = P.store.getState()
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    P.raf.gl = ctx
    P.raf.ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
    return {
        ok: true,
        gpu: ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER),
        vendor: ctx.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : ctx.VENDOR),
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext,
        timerQuery: Boolean(P.raf.ext),
        three: THREE.REVISION,
        size: [gl.domElement.width, gl.domElement.height],
        pixelRatio: gl.getPixelRatio(),
        hasDiRoom: Boolean(window.__diRoom),
        hasComposer: Boolean(window.__diRoom && window.__diRoom.passes && window.__diRoom.passes.composer),
        glow: window.__diRoom && window.__diRoom.passes ? Boolean(window.__diRoom.passes.glow && window.__diRoom.passes.glow.enabled) : null,
        autoExposure: window.__diRoom && window.__diRoom.passes ? Boolean(window.__diRoom.passes.exposure && window.__diRoom.passes.exposure.enabled) : null,
        shadowMap: Boolean(gl.shadowMap && gl.shadowMap.enabled),
        toneMappingExposure: gl.toneMappingExposure
    }
}

/** What three.js holds: every SpotLight of the scene, and the programs. `rawOf` (by slot index) is not needed here. */
const pageLights = () => {
    const P = window.__lf
    const T = P.THREE
    const { scene, camera, gl } = P.store.getState()
    scene.updateMatrixWorld()
    const lights = []
    scene.traverse((o) => {
        if (!o.isSpotLight) return
        const p = new T.Vector3().setFromMatrixPosition(o.matrixWorld)
        const t = new T.Vector3().setFromMatrixPosition(o.target.matrixWorld)
        const d = t.sub(p).normalize()
        let id = null
        let shown = true
        for (let n = o; n; n = n.parent) {
            if (id === null && n.userData && n.userData.svEntityId) id = n.userData.svEntityId
            if (n.visible === false) shown = false
        }
        lights.push({ id, shown, visible: o.visible, pos: p.toArray(), dir: d.toArray(), intensity: o.intensity, angleDeg: (o.angle * 180) / Math.PI, angle: o.angle, penumbra: o.penumbra, distance: o.distance, decay: o.decay, color: o.color.getHexString(), castShadow: o.castShadow, nominal: o.userData && o.userData.nominalIntensity })
    })
    // where each pool slot's axis lands, and whether that is in the picture
    const slots = lights.filter((l) => l.id && l.id.startsWith('rig-pool-'))
    const ray = new T.Raycaster()
    const lit = []
    for (const l of slots) {
        if (!(l.intensity > 0)) { lit.push({ id: l.id, hit: null, why: 'intensity 0' }); continue }
        ray.set(new T.Vector3(...l.pos), new T.Vector3(...l.dir))
        ray.far = 400
        const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object && h.object.isMesh && h.object.visible && !(h.object.material && h.object.material.isShaderMaterial))
        const h = hits[0]
        if (!h) { lit.push({ id: l.id, hit: null, why: 'the axis leaves the scene without a surface' }); continue }
        const n = (h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new T.Vector3(0, 1, 0))
        if (n.dot(ray.ray.direction) > 0) n.negate()
        const ndc = h.point.clone().project(camera)
        let name = null
        for (let o = h.object; o && !name; o = o.parent) name = o.name || (o.userData && o.userData.svEntityId) || null
        lit.push({ id: l.id, hit: { point: h.point.toArray(), normal: n.toArray(), distance: h.distance, object: name, ndc: [ndc.x, ndc.y, ndc.z], inView: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1 } })
    }
    const info = gl.info
    return {
        count: lights.length,
        lit: lights.filter((l) => l.shown && l.visible && l.intensity > 0).length,
        mounted: lights.filter((l) => l.shown && l.visible).length,
        lights,
        slots: lit,
        programs: Array.isArray(info.programs) ? info.programs.length : null,
        render: { calls: info.render.calls, triangles: info.render.triangles, frame: info.render.frame },
        camera: { position: camera.position.toArray(), fov: camera.fov }
    }
}

/** Frame time of what is on screen now: capped cadence + main-thread time (+ GPU time), then the uncapped loops. */
const pageBench = async ({ seconds, loop }) => {
    const P = window.__lf
    const R = P.raf
    const { gl, scene, camera } = P.store.getState()
    const ctx = gl.getContext()
    const out = {}
    const q = (arr, f) => {
        const v = arr.filter(Number.isFinite).sort((a, b) => a - b)
        if (!v.length) return { n: 0 }
        const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))]
        const r = (x) => Math.round(x * f) / f
        return { n: v.length, mean: r(v.reduce((a, b) => a + b, 0) / v.length), median: r(at(0.5)), p95: r(at(0.95)), p99: r(at(0.99)), min: r(v[0]), max: r(v[v.length - 1]) }
    }
    // 1. capped: the page's own loop for `seconds`
    R.frames = []
    R.cur = null
    R.pending = []
    R.gpu = []
    R.on = true
    await new Promise((r) => setTimeout(r, seconds * 1000))
    R.on = false
    await new Promise((r) => setTimeout(r, 300))
    const ts = R.frames.map((f) => f.t)
    const dt = ts.slice(1).map((t, i) => t - ts[i])
    out.capped = { seconds, frames: R.frames.length, fps: Math.round((R.frames.length / seconds) * 10) / 10, interval_ms: q(dt, 1000), mainThread_ms: q(R.frames.map((f) => f.cpu), 1000) }
    if (R.ext && R.pending.length) {
        const disjoint = ctx.getParameter(R.ext.GPU_DISJOINT_EXT)
        const res = []
        for (const p of R.pending) {
            if (ctx.getQueryParameter(p.q, ctx.QUERY_RESULT_AVAILABLE)) res.push({ t: p.t, ms: ctx.getQueryParameter(p.q, ctx.QUERY_RESULT) / 1e6 })
            ctx.deleteQuery(p.q)
        }
        const byFrame = new Map()
        for (const r of res) byFrame.set(r.t, (byFrame.get(r.t) || 0) + r.ms)
        out.gpuTimer = { offered: true, disjoint: Boolean(disjoint), queries: R.pending.length, read: res.length, perFrame_ms: q([...byFrame.values()], 1000) }
    } else out.gpuTimer = { offered: Boolean(R.ext), note: R.ext ? 'no queries read' : 'EXT_disjoint_timer_query_webgl2 is not offered by this browser' }
    R.pending = []
    // 2. uncapped: the app's own render call in a tight loop
    const comp = window.__diRoom && window.__diRoom.passes && window.__diRoom.passes.composer
    const renderOnce = comp ? () => comp.render(0.016) : () => gl.render(scene, camera)
    out.loop = comp ? 'the HDR composer (bloom, exposure, SMAA): window.__diRoom.passes.composer.render' : 'renderer.render(scene, camera)'
    const px = new Uint8Array(4)
    const sync = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    const info = gl.info
    for (let i = 0; i < 40; i += 1) renderOnce()
    sync()
    const before = info.render.frame
    const batches = []
    for (let b = 0; b < 8; b += 1) {
        const n = 60
        const t0 = performance.now()
        for (let i = 0; i < n; i += 1) renderOnce()
        sync()
        batches.push((performance.now() - t0) / n)
    }
    out.uncappedPipelined_ms = q(batches, 1000)
    out.uncappedPipelined_fps = Math.round(1000 / out.uncappedPipelined_ms.median)
    const each = []
    for (let i = 0; i < (loop || 240); i += 1) {
        const t0 = performance.now()
        renderOnce()
        sync()
        each.push(performance.now() - t0)
    }
    out.uncappedSync_ms = q(each, 1000)
    out.framesDrawn = info.render.frame - before
    out.framesAsked = 8 * 60 + (loop || 240)
    out.drawCallsPerFrame = info.render.calls
    out.trianglesPerFrame = info.render.triangles
    out.programs = Array.isArray(info.programs) ? info.programs.length : null
    out.pixelRatio = gl.getPixelRatio()
    out.canvas = [gl.domElement.width, gl.domElement.height]
    return out
}

/** Draw the frame now, by the app's own path, and read it back as display values: { w, h, luma: Float32Array as array } is too big to return, so it is kept in the page. */
const pageGrab = (name) => {
    const P = window.__lf
    const { gl, scene, camera } = P.store.getState()
    const ctx = gl.getContext()
    const comp = window.__diRoom && window.__diRoom.passes && window.__diRoom.passes.composer
    if (comp) comp.render(0.016)
    else gl.render(scene, camera)
    const w = ctx.drawingBufferWidth
    const h = ctx.drawingBufferHeight
    const buf = new Uint8Array(w * h * 4)
    ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, buf)
    ;(P.grabs = P.grabs || {})[name] = { w, h, buf }
    return { name, w, h }
}
/** Compare two grabs: how much of the picture the difference is. */
const pageDiff = ({ a, b }) => {
    const A = window.__lf.grabs[a]
    const B = window.__lf.grabs[b]
    const n = A.w * A.h
    const y = (buf, i) => 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]
    let sumA = 0
    let sumB = 0
    let sumAbs = 0
    let max = 0
    const over = { ge1: 0, ge4: 0, ge16: 0, ge64: 0 }
    let x0 = A.w
    let x1 = -1
    let y0 = A.h
    let y1 = -1
    for (let p = 0; p < n; p += 1) {
        const i = p * 4
        const ya = y(A.buf, i)
        const yb = y(B.buf, i)
        const d = Math.abs(ya - yb)
        sumA += ya
        sumB += yb
        sumAbs += d
        if (d > max) max = d
        if (d >= 1) { over.ge1 += 1; const px = p % A.w; const py = (p / A.w) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py }
        if (d >= 4) over.ge4 += 1
        if (d >= 16) over.ge16 += 1
        if (d >= 64) over.ge64 += 1
    }
    const r = (v, f = 1000) => Math.round(v * f) / f
    return {
        a, b, pixels: n, meanLumaA: r(sumA / n), meanLumaB: r(sumB / n), meanAbsDiff: r(sumAbs / n, 10000), maxDiff: r(max),
        share: { ge1: r(over.ge1 / n, 100000), ge4: r(over.ge4 / n, 100000), ge16: r(over.ge16 / n, 100000), ge64: r(over.ge64 / n, 100000) },
        lumaGainOfA: r((sumA - sumB) / Math.max(sumB, 1), 10000),
        bbox: x1 < 0 ? null : { x: [x0, x1], y: [y0, y1], w: x1 - x0 + 1, h: y1 - y0 + 1 }
    }
}

/** Set (and give back) a slot's cone, by its entity id. */
const pageSetCone = ({ id, angle, penumbra, intensity }) => {
    const P = window.__lf
    const { scene } = P.store.getState()
    const done = []
    scene.traverse((o) => {
        if (!o.isSpotLight) return
        let who = null
        for (let n = o; n && !who; n = n.parent) who = n.userData && n.userData.svEntityId
        if (who !== id) return
        P.saved = P.saved || {}
        if (!P.saved[id]) P.saved[id] = { angle: o.angle, penumbra: o.penumbra, intensity: o.intensity }
        if (angle !== undefined) o.angle = angle
        if (penumbra !== undefined) o.penumbra = penumbra
        if (intensity !== undefined) o.intensity = intensity
        done.push({ id, angle: o.angle, penumbra: o.penumbra, intensity: o.intensity })
    })
    return done
}
const pageRestoreCones = () => {
    const P = window.__lf
    const { scene } = P.store.getState()
    let n = 0
    scene.traverse((o) => {
        if (!o.isSpotLight) return
        let who = null
        for (let a = o; a && !who; a = a.parent) who = a.userData && a.userData.svEntityId
        const s = P.saved && P.saved[who]
        if (s) { o.angle = s.angle; o.penumbra = s.penumbra; o.intensity = s.intensity; n += 1 }
    })
    P.saved = {}
    return n
}
/** Lux at points through the measurement mode's own probe. */
const pageLux = (points) => window.__diMeasure.lux(points)

// ---- the run ----------------------------------------------------------------------------------------------------------------

const CONDITIONS = {
    lite: { query: 'quality=lite', own: true },
    full: { query: 'quality=full', own: true },
    fullpool: { query: 'quality=full&lightPool=1', own: true, noBench: true },
    'lite-meas': { query: 'quality=lite&measure&scale=0.02', meas: true },
    'full-meas': { query: 'quality=full&measure&scale=0.02', meas: true },
    'par-meas': { query: 'quality=lite&measure&scale=0.02', meas: true, zeroWords: ['b380f'], par: true }
}
const ORDER = ['lite', 'full', 'lite-meas', 'full-meas', 'par-meas', 'fullpool']

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    fs.mkdirSync(OUT, { recursive: true })
    const resultsFile = path.join(OUT, SMOKE ? 'results-smoke.json' : 'results.json')
    const results = { script: 'scripts/measure/lite-vs-full-gpu.cjs', at: new Date().toISOString(), base: BASE, space: SPACE, project: PROJECT, look: LOOK, lane: process.env.DI_TEST_LANE || null, smoke: SMOKE, tempStart: packageTemp(), conditions: {} }
    const save = () => fs.writeFileSync(resultsFile, JSON.stringify(results, null, 1))
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page) // a `timeout` kill must not leave the tab drawing the scene (2026-10-09)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
    await page.addInitScript(initProbe)
    let current = null
    await page.route('**/api/projects/*/document*', async (route) => {
        const res = await route.fetch()
        if (!current || !route.request().url().includes(`/api/projects/${PROJECT}/document`)) return route.fulfill({ response: res })
        const body = await res.json()
        if (body?.document) body.document = docFor(body.document, { look: LOOK, zeroWords: current.zeroWords || [] })
        return route.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } })
    })
    const cdpSession = await context.newCDPSession(page)
    const setSize = async (w, h) => {
        await page.setViewportSize({ width: w, height: h })
        await cdpSession.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    }
    const settle = async (name, waitMs) => {
        // the compiled shaders stop growing, the held look's chip is up, then a fixed wait
        const t0 = Date.now()
        let last = -1
        let stable = 0
        while (Date.now() - t0 < 150000) {
            const n = await page.evaluate(() => window.__lf.compiles).catch(() => -1)
            stable = n === last && n > 0 ? stable + 1 : 0
            last = n
            if (stable >= 4) break
            await sleep(1000)
        }
        await sleep(waitMs)
        return { compiles: last, settledAfter_s: Math.round((Date.now() - t0) / 100) / 10 }
    }

    const run = async (name) => {
        const cond = CONDITIONS[name]
        const r = (results.conditions[name] = { query: cond.query, tempBefore: packageTemp() })
        current = cond
        errors.length = 0
        await page.goto('about:blank') // the previous scene stops drawing while the package cools
        r.cool = await waitCool(HEAT_LIMIT, 900)
        if (!r.cool.ok) throw new Error(`refused: the CPU package is ${r.cool.now} C after ${r.cool.waited_s} s of waiting (the rule: wait while above ${HEAT_LIMIT} C)`)
        await setSize(...SIZES[0])
        const url = `${BASE}/${SPACE}/${PROJECT}?${cond.query}`
        r.url = url
        const t0 = Date.now()
        await page.goto(url, { waitUntil: 'load', timeout: 90000 })
        await page.bringToFront()
        r.loadMs = Date.now() - t0
        await page.waitForSelector('canvas', { timeout: 90000 })
        if (cond.meas) await page.waitForSelector('canvas[data-measure-ev100]', { timeout: 90000 })
        r.settle = await settle(name, SMOKE ? 3000 : 6000)
        r.chip = await page.evaluate(() => (document.querySelector('[data-testid="rig-show-chip"]') || {}).textContent || null)
        r.qualityButton = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t === 'Lite' || t === 'Full'))
        r.attach = await page.evaluate(pageAttach)
        if (!r.attach.ok) throw new Error(`attach failed: ${r.attach.why}`)
        if (SOFTWARE.test(r.attach.gpu)) throw new Error(`refused: a software renderer (${r.attach.gpu})`)
        // the GPU-side count: every fragment shader the page compiled
        const shaders = await page.evaluate(() => ({ compiles: window.__lf.compiles, fragment: window.__lf.shaders }))
        const bySpot = {}
        for (const s of shaders.fragment) bySpot[s.spot === null ? 'unlit' : s.spot] = (bySpot[s.spot === null ? 'unlit' : s.spot] || 0) + 1
        r.shaderCompiles = { total: shaders.compiles, fragmentShaders: shaders.fragment.length, fragmentShadersByNUM_SPOT_LIGHTS: bySpot, maxNUM_SPOT_LIGHTS: Math.max(0, ...shaders.fragment.map((s) => s.spot || 0)), maxNUM_SPOT_LIGHT_SHADOWS: Math.max(0, ...shaders.fragment.map((s) => s.spotShadows)) }
        r.lights = await page.evaluate(pageLights)
        const slotLights = r.lights.lights.filter((l) => l.id && l.id.startsWith('rig-pool-'))
        // the lumens three.js holds: Σ intensity × the sr of its cone (÷ the scene scale 0.02 = lm), and which lamp each slot took (by its place)
        const lumens = (list) => Math.round(list.filter((l) => l.shown && l.visible && l.intensity > 0).reduce((a, l) => a + l.intensity * coneSr({ angle: l.angle, penumbra: l.penumbra }), 0) / 0.02)
        r.lumens = { allLights: lumens(r.lights.lights), slots: slotLights.length ? lumens(slotLights) : null, note: 'sum of intensity x sr of the cone three draws (angle, penumbra) / scale 0.02; the lamps\' haze cones are not light' }
        if (slotLights.length) {
            const docRes = await page.evaluate((u) => fetch(u).then((x) => x.json()), `${BASE}/serverXR/api/projects/${PROJECT}/document`).catch(() => null)
            const entities = (docRes && docRes.document && docRes.document.entities) || []
            r.slotLamps = slotLights.map((l) => {
                const lamp = entities.find((e) => e.type === 'spotLight' && Array.isArray(e.components?.transform?.position) && e.components.transform.position.every((v, i) => Math.abs(v - l.pos[i]) < 0.01))
                const raw = lamp ? { angle: lamp.components.light.angle, penumbra: lamp.components.light.penumbra } : null
                return { slot: l.id, lamp: lamp ? lamp.id : null, fixture: lamp?.components?.fixture?.type || null, name: lamp?.name || null, candela: Math.round(l.intensity / 0.02), drawn: { angleDeg: Math.round(l.angleDeg * 1000) / 1000, penumbra: l.penumbra }, raw: raw ? { angleDeg: Math.round(((raw.angle * 180) / Math.PI) * 1000) / 1000, penumbra: raw.penumbra } : null, lumensDrawn: Math.round((l.intensity * coneSr({ angle: l.angle, penumbra: l.penumbra })) / 0.02), lumensOldCode: raw ? Math.round((l.intensity * coneSr(raw)) / 0.02) : null }
            })
            r.lumens.slotsAsOldCodeDrewThem = r.slotLamps.every((s) => s.lumensOldCode !== null) ? r.slotLamps.reduce((a, s) => a + s.lumensOldCode, 0) : null
            for (const s of r.slotLamps) console.log(`   ${s.slot} = ${s.lamp} (${s.fixture}) ${s.candela} cd at [${slotLights.find((l) => l.id === s.slot).pos.map((v) => Math.round(v * 100) / 100)}] aimed [${slotLights.find((l) => l.id === s.slot).dir.map((v) => Math.round(v * 1000) / 1000)}] decay ${slotLights.find((l) => l.id === s.slot).decay} distance ${slotLights.find((l) => l.id === s.slot).distance}: cone drawn ${s.drawn.angleDeg} deg pen ${s.drawn.penumbra} (${s.lumensDrawn} lm) · the old code drew ${s.raw ? `${s.raw.angleDeg} deg pen ${s.raw.penumbra} (${s.lumensOldCode} lm)` : 'n/a'}`)
        }
        console.log(`${name}: ${r.attach.gpu.slice(0, 60)} · three r${r.attach.three} · timer query ${r.attach.timerQuery} · ${r.lights.count} SpotLights (${r.lights.mounted} mounted, ${r.lights.lit} lit) · NUM_SPOT_LIGHTS (GPU, from the shader source) max ${r.shaderCompiles.maxNUM_SPOT_LIGHTS} over ${r.shaderCompiles.fragmentShaders} fragment shaders ${JSON.stringify(bySpot)} · slots ${slotLights.length} · light three holds ${r.lumens.allLights} lm${r.lumens.slots === null ? '' : ` (the slots ${r.lumens.slots})`}`)
        for (const s of r.lights.slots) console.log(`   ${s.id}: ${s.hit ? `axis lands ${s.hit.distance.toFixed(1)} m away on ${s.hit.object}, in view ${s.hit.inView}` : s.why}`)
        save()

        if (cond.own) {
            await page.screenshot({ path: path.join(OUT, `${name}.png`) })
            r.screenshot = `${name}.png`
            r.bench = {}
            for (const [w, h] of cond.noBench ? [] : SIZES) {
                await setSize(w, h)
                await sleep(2500)
                const key = `${w}x${h}`
                r.bench[key] = []
                for (let run2 = 0; run2 < (SMOKE ? 1 : 2); run2 += 1) {
                    r.bench[key].push(await page.evaluate(pageBench, { seconds: SMOKE ? 2 : 6, loop: SMOKE ? 60 : 240 }))
                    r.bench[key][run2].tempAfter = packageTemp()
                    const b = r.bench[key][run2]
                    console.log(`   ${key} run ${run2 + 1}: capped ${b.capped.fps} fps (interval median ${b.capped.interval_ms.median} ms, main thread median ${b.capped.mainThread_ms.median} ms, GPU timer ${b.gpuTimer.perFrame_ms ? b.gpuTimer.perFrame_ms.median + ' ms' : b.gpuTimer.note || 'none'}) · uncapped ${b.uncappedPipelined_ms.median} ms (${b.uncappedPipelined_fps} fps) pipelined, ${b.uncappedSync_ms.median} ms sync (p95 ${b.uncappedSync_ms.p95}, p99 ${b.uncappedSync_ms.p99}) · ${b.drawCallsPerFrame} draw calls · ${b.programs} programs · frames drawn ${b.framesDrawn}/${b.framesAsked}`)
                    save()
                }
            }
            await setSize(...SIZES[0])
            await sleep(2000)
            // the slots' share of the picture (Lite and the pool in Full): the frame as it is, again, then with the slots at 0
            if (slotLights.length) {
                await page.evaluate(pageGrab, 'on')
                await page.evaluate(pageGrab, 'on2')
                for (const s of slotLights) await page.evaluate(pageSetCone, { id: s.id, intensity: 0 })
                await page.evaluate(pageGrab, 'off')
                await page.evaluate(pageRestoreCones)
                r.slotsShare = { control: await page.evaluate(pageDiff, { a: 'on', b: 'on2' }), slotsOffVsOn: await page.evaluate(pageDiff, { a: 'on', b: 'off' }) }
                console.log(`   the ${slotLights.length} slots: ${(r.slotsShare.slotsOffVsOn.share.ge1 * 100).toFixed(3)} % of the pixels change by >= 1/255 when they are switched off (>= 16/255: ${(r.slotsShare.slotsOffVsOn.share.ge16 * 100).toFixed(3)} %), mean luma ${r.slotsShare.slotsOffVsOn.meanLumaA} on / ${r.slotsShare.slotsOffVsOn.meanLumaB} off; control (same frame twice) ${r.slotsShare.control.maxDiff}`)
            }
            save()
        }

        if (cond.meas && !cond.par) {
            // lux at the floor grid and at the slots' own aim points (the same points in Lite and Full)
            const grid = []
            for (const x of [-12, -3.75, 4.5]) for (const z of [14, 6, -2, -8, -14]) grid.push({ name: `floor x${x} z${z}`, position: [x, 0.05, z], normal: [0, 1, 0] })
            const aim = (results.conditions.lite?.lights?.slots || []).filter((s) => s.hit).map((s) => ({ name: `${s.id} aim`, position: s.hit.point.map((v, i) => v + s.hit.normal[i] * 0.02), normal: s.hit.normal }))
            // what the probe should read at a slot's aim point: Y·I/d² × cos(incidence), on the axis (falloff 1)
            const expectedAt = (id) => {
                const l = r.lights.lights.find((x) => x.id === id)
                const h = (r.lights.slots || []).find((x) => x.id === id)?.hit
                if (!l || !h) return null
                const cos = Math.max(0, -(l.dir[0] * h.normal[0] + l.dir[1] * h.normal[1] + l.dir[2] * h.normal[2]))
                return (lumY(l.color) * (l.intensity / 0.02) * cos) / (h.distance * h.distance)
            }
            const t1 = Date.now()
            const lux = await page.evaluate(pageLux, [...grid, ...aim])
            r.lux = { ms: Date.now() - t1, gpu: lux.renderer && lux.renderer.gpu, sceneScale: lux.sceneScale, ev100: lux.camera && lux.camera.ev100, switchedOff: (lux.switchedOff || []).map((s) => `${s.kind}:${s.name || ''}`), points: (lux.data || []).map((d) => ({ name: d.name, E_lx: d.E_lx == null ? null : Math.round(d.E_lx * 1000) / 1000, overflow: d.overflow })) }
            for (const pt of r.lux.points) if (pt.name.endsWith(' aim')) { const e = expectedAt(pt.name.replace(' aim', '')); pt.E_expected_lx = e === null ? null : Math.round(e * 10) / 10; pt.ratio = e ? Math.round((pt.E_lx / e) * 1000) / 1000 : null }
            const floor = r.lux.points.filter((p) => p.name.startsWith('floor') && p.E_lx != null).map((p) => p.E_lx)
            r.lux.floorMean_lx = floor.length ? Math.round((floor.reduce((a, b) => a + b, 0) / floor.length) * 1000) / 1000 : null
            r.lamps = await page.evaluate(() => window.__diMeasure.lamps())
            for (const pt of r.lux.points.filter((q) => q.name.endsWith(' aim'))) console.log(`   ${pt.name}: ${pt.E_lx} lx measured (the slot's candela x colour luminance / d^2 x cos says ${pt.E_expected_lx}; ratio ${pt.ratio})`)
            console.log(`   lux: floor grid mean ${r.lux.floorMean_lx} lx over ${floor.length} points; ${r.lamps.data.length} lamps in the measurement list; work light etc. switched off: ${r.lux.switchedOff.join(', ') || 'none'}`)
            save()
        }

        if (cond.par) {
            // THE FIT BUG, ON THE GPU. The pool's slots now hold PL5403 washes (the B380F lamps are at 0 in this copy). Each slot is
            // read in three states: as the room draws it (the rig's fit, spotLightCone), as the old code drew it (the lamp's raw
            // half-beam angle as the cutoff, its raw penumbra), and off. In lux on the slot's own cone — points 6 m from the slot
            // along rays 0…2 half-beams off its axis, facing the lamp, where E·d²/I is the cone's falloff itself — and in the picture.
            const docRes = await page.evaluate((u) => fetch(u).then((x) => x.json()), `${BASE}/serverXR/api/projects/${PROJECT}/document`)
            const entities = (docRes && docRes.document && docRes.document.entities) || []
            const slotLights = r.lights.lights.filter((l) => l.id && l.id.startsWith('rig-pool-') && l.intensity > 0)
            const par = slotLights.map((s) => {
                const lamp = entities.find((e) => e.type === 'spotLight' && Array.isArray(e.components?.transform?.position) && e.components.transform.position.every((v, i) => Math.abs(v - s.pos[i]) < 0.01))
                return { id: s.id, lampId: lamp ? lamp.id : null, fixture: lamp?.components?.fixture?.type || null, pos: s.pos, dir: s.dir, intensity: s.intensity, candela: s.intensity / 0.02, colour: s.color, Y: lumY(s.color), drawn: { angle: s.angle, penumbra: s.penumbra }, raw: lamp ? { angle: lamp.components.light.angle, penumbra: lamp.components.light.penumbra } : null }
            })
            r.par = { slots: par.map((p) => ({ ...p, drawnDeg: (p.drawn.angle * 180) / Math.PI, rawDeg: p.raw ? (p.raw.angle * 180) / Math.PI : null, srDrawn: coneSr(p.drawn), srRaw: p.raw ? coneSr(p.raw) : null })) }
            console.log(`   ${par.length} slots lit; ${par.map((p) => `${p.id} = ${p.lampId} (${p.fixture})`).join('; ')}`)
            const usable = par.filter((p) => p.raw && /pl5403/.test(String(p.fixture)))
            const D = 6
            const steps = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
            const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n) }
            const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
            const points = []
            for (const p of usable.slice(0, 2)) {
                const dir = unit(p.dir)
                const u = unit(cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]))
                p.samples = steps.map((k) => {
                    const th = k * p.raw.angle
                    const ray = dir.map((c, i) => Math.cos(th) * c + Math.sin(th) * u[i])
                    const at = { name: `${p.id} ${k} half-beam`, position: p.pos.map((c, i) => c + D * ray[i]), normal: ray.map((c) => -c) }
                    points.push(at)
                    return { k, theta: th, point: at }
                })
            }
            const readLux = async () => (await page.evaluate(pageLux, points)).data.map((d) => d.E_lx)
            const setAll = async (mode) => { // 'drawn' (as the room draws it) | 'raw' | 'off'
                await page.evaluate(pageRestoreCones)
                for (const p of par) {
                    if (mode === 'raw' && p.raw) await page.evaluate(pageSetCone, { id: p.id, angle: p.raw.angle, penumbra: p.raw.penumbra })
                    if (mode === 'off') await page.evaluate(pageSetCone, { id: p.id, intensity: 0 })
                }
            }
            if (usable.length) {
                await setAll('drawn')
                const E = { drawn: await readLux() }
                await setAll('raw')
                E.raw = await readLux()
                await setAll('off')
                E.off = await readLux()
                await setAll('drawn')
                let i = 0
                for (const p of usable.slice(0, 2)) {
                    p.profile = p.samples.map((sm) => {
                        const d = { k: sm.k, deg: Math.round(((sm.theta * 180) / Math.PI) * 1000) / 1000, E_drawn_lx: E.drawn[i], E_raw_lx: E.raw[i], E_off_lx: E.off[i] }
                        // E·d² / (candela × the colour's luminance) is the cone's falloff itself (decay 2, no cutoff distance)
                        d.f_drawn = (E.drawn[i] - E.off[i]) * D * D / (p.candela * p.Y)
                        d.f_raw = (E.raw[i] - E.off[i]) * D * D / (p.candela * p.Y)
                        d.f_threeDrawn = falloff(sm.theta, p.drawn)
                        d.f_threeRaw = falloff(sm.theta, p.raw)
                        i += 1
                        return d
                    })
                    delete p.samples
                    const f = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a')
                    console.log(`   ${p.id} (${p.lampId}, ${p.candela.toFixed(0)} cd, colour #${p.colour}, luminance ${p.Y.toFixed(4)}): cone drawn ${((p.drawn.angle * 180) / Math.PI).toFixed(2)} deg pen ${p.drawn.penumbra.toFixed(2)} | old code ${((p.raw.angle * 180) / Math.PI).toFixed(2)} deg pen ${p.raw.penumbra} | flux ratio drawn/old ${(coneSr(p.drawn) / coneSr(p.raw)).toFixed(3)}`)
                    for (const d of p.profile) console.log(`      ${String(d.k).padStart(4)} half-beam (${String(d.deg).padStart(7)} deg): E·d²/I drawn ${f(d.f_drawn)} (three says ${f(d.f_threeDrawn)}) · old ${f(d.f_raw)} (three says ${f(d.f_threeRaw)})`)
                }
                r.par.measured = usable.slice(0, 2).map((p) => ({ id: p.id, lampId: p.lampId, profile: p.profile }))
                // the picture: all slots, as drawn / as the old code drew them / off
                await setAll('drawn')
                await page.evaluate(pageGrab, 'fit')
                await setAll('raw')
                await page.evaluate(pageGrab, 'raw')
                await setAll('off')
                await page.evaluate(pageGrab, 'off')
                await setAll('drawn')
                r.par.picture = { fitVsOff: await page.evaluate(pageDiff, { a: 'fit', b: 'off' }), rawVsOff: await page.evaluate(pageDiff, { a: 'raw', b: 'off' }), fitVsRaw: await page.evaluate(pageDiff, { a: 'fit', b: 'raw' }) }
                const pc = r.par.picture
                console.log(`   picture (measurement view, ${pc.fitVsOff.pixels} px): luma added by the slots as drawn ${(pc.fitVsOff.lumaGainOfA * 100).toFixed(3)} % of the slots-off picture; as the old code drew them ${(pc.rawVsOff.lumaGainOfA * 100).toFixed(3)} %; pixels >= 1/255 changed: drawn ${(pc.fitVsOff.share.ge1 * 100).toFixed(3)} %, old ${(pc.rawVsOff.share.ge1 * 100).toFixed(3)} %`)
            } else console.log('   no PL5403 slot with a known lamp: the pool did not take PARs (check the zeroed groups)')
            save()
        }
        r.tempAfter = packageTemp()
        r.pageErrors = [...errors]
        save()
    }

    try {
        for (const name of ORDER) {
            if (SMOKE && name !== 'lite' && !(ONLY && ONLY.has(name))) continue
            if (ONLY && !ONLY.has(name)) continue
            try {
                await run(name)
            } catch (error) {
                results.conditions[name] = { ...(results.conditions[name] || {}), failed: String(error.stack || error).slice(0, 1500) }
                console.error(`${name}: FAILED ${error.message}`)
                save()
            }
        }
    } finally {
        results.tempEnd = packageTemp()
        save()
        await page.close().catch(() => {})
        await browser.close().catch(() => {}) // disconnects CDP only; the browser stays
    }
    console.log(`written: ${resultsFile}`)
}

module.exports = { falloff, coneSr, stats, docFor, quantile, lumY, waitCool }
if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || String(error))
        process.exitCode = 1
    })
}
