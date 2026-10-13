// SCENE DISTANCE (owner, 2026-10-13: "it gets stuck at objects, then jumps — new mechanics, not numbers"; his yes to this method).
// Method: McCrae, Mordatch, Glueck & Khan, "Multiscale 3D Navigation", I3D 2009 (Autodesk Research): the speed of a move comes
// from how far the scene is, measured from a small depth picture rendered from the camera, never from one surface under the
// pointer. Blender's Auto Depth takes the one pixel under the pointer at the start of each move (view3d_navigate.cc
// navigate_pivot_get, v5.0.0); in a dense rig that pixel is a lamp 1 m away one move and the back wall 40 m away the next,
// so moves crawl, then fly (measured, scripts/nav/probe-stick-jump.cjs). OUR choices, written down as such (unvalidated
// against the paper's numbers): the statistic is the MEDIAN distance of what the CENTRE of the view shows, its middle third
// across and down (what you look at; the whole view's median put the orbit point 58 m down the hall behind the stage in
// view, measured 2026-10-13), falling back to the whole view's median when the centre shows nothing (the paper uses the
// nearest geometry around the camera, which in a hall is the floor under the eye and would slow every move to the eye height); the
// depth picture's near plane is the controls' contact distance, so a surface you are pressed against drops out and the move
// goes through it (the owner's "unlimited scroll").
import { Color, FloatType, NearestFilter, PerspectiveCamera, RGBAFormat, ShaderMaterial, WebGLRenderTarget } from 'three'
import { isNavigationHelper } from './autoDepth.js'

// The depth picture's size: a cost bound (one 64 x 36 render and read-back per measurement, 2304 samples), not a tuning knob:
// the median of a view does not move with the sampling density.
export const SAMPLE_WIDTH = 64
export const SAMPLE_HEIGHT = 36

// A material the eye sees through puts no depth in Blender's depth buffer either: drawn without depth writes, see-through,
// or not drawn into colour. Pure.
export function isSeeThrough(material) {
    const list = Array.isArray(material) ? material : [material]
    return list.every((m) => !m || m.visible === false || m.depthWrite === false || m.colorWrite === false || (m.transparent === true && Number(m.opacity) < 0.99))
}

// The median of the samples that hit something (> 0). Null when nothing is in view. Pure.
// centreMedian: the same over the middle third of a width x height grid (row-major), else over the whole grid. Pure.
export function centreMedian(samples, width, height) {
    const centre = []
    for (let y = Math.floor(height / 3); y < Math.ceil((2 * height) / 3); y += 1) for (let x = Math.floor(width / 3); x < Math.ceil((2 * width) / 3); x += 1) centre.push(samples[y * width + x])
    return medianDistance(centre) ?? medianDistance(samples)
}
export function medianDistance(samples) {
    const hits = []
    for (let i = 0; i < samples.length; i += 1) if (samples[i] > 0 && Number.isFinite(samples[i])) hits.push(samples[i])
    if (!hits.length) return null
    hits.sort((a, b) => a - b)
    const mid = hits.length >> 1
    return hits.length % 2 ? hits[mid] : (hits[mid - 1] + hits[mid]) / 2
}

// The distance a move uses. Inside one continuous wheel run (`consecutive`: the last thing that moved the camera was this
// wheel) it may change at most by the wheel's own ratio per notch, 1.2 (Blender's step), so passing through a wall or a
// lamp entering the view never turns into a jump in the step; any other move measures afresh. Nothing in view keeps the
// previous distance (Blender keeps the view's depth when Auto Depth finds nothing). Clamped to the controls' range. Pure.
export function nextSceneDistance({ measured, previous = null, consecutive = false, ratio = 1.2, min = 0, max = Infinity }) {
    let d = measured
    if (!(d > 0)) d = previous
    if (!(d > 0)) return null
    if (consecutive && previous > 0) d = Math.min(Math.max(d, previous / ratio), previous * ratio)
    return Math.min(Math.max(d, min), max)
}

const vertexShader = /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vViewPosition;
void main() {
    #include <batching_vertex>
    #include <skinbase_vertex>
    #include <morphinstance_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vViewPosition = mvPosition.xyz;
}`
const fragmentShader = /* glsl */`
// The distance per pixel from the interpolated view position (a distance interpolated across a triangle is wrong: the
// 100 m floor read 64 m in every pixel, its corners' distance, measured 2026-10-13).
varying vec3 vViewPosition;
void main() { gl_FragColor = vec4(length(vViewPosition), 0.0, 0.0, 1.0); }`

// Is this camera where a picture was drawn? Every element of the world matrix (a camera's `matrixWorld.elements`, or the copy
// kept at render time) must agree within POSE_EPSILON: float noise only, never room for a real move. Pure.
export const POSE_EPSILON = 1e-6
export function samePose(a, b, epsilon = POSE_EPSILON) {
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) if (!(Math.abs(a[i] - b[i]) <= epsilon)) return false // a NaN never matches
    return true
}

// When to ask for the next picture (`request` below), kept apart from camera-controls so it can be tested. The controls apply a
// move in their next update(), not in setLookAt (camera-controls.module.js: setLookAt only sets the goal, update() writes the
// camera), so a picture asked for inside the wheel handler would show the pose the camera is about to leave. Therefore:
//   moved()    a move was just given to the controls: the first update() that shows another pose asks;
//   updated()  the controls wrote the camera (their 'update' event);
//   settled()  the controls stopped ('rest', 'sleep': one frame after the last update, so the pose is final): the next move or
//              drag starts from here, and one stop is asked for once.
// Drags update every frame and are not asked per frame: only moves announced by moved() and stops ask. `ask(reason)` must never
// throw into the controls' update: a failure is warned once and the next move reads on the spot.
export function createAsker({ getCamera, ask }) {
    let moveFrom = null, asked = null, warned = false
    const pose = () => { const camera = getCamera(); camera.updateMatrixWorld(); return camera.matrixWorld.elements }
    const askNow = (reason) => {
        const now = pose()
        if (asked && samePose(now, asked)) return
        asked = Float64Array.from(now)
        try { ask(reason) } catch (error) { if (!warned) { warned = true; console.warn('[sceneDistance] could not ask for a depth picture; moves read it on the spot.', error) } }
    }
    return {
        moved: () => { moveFrom = Float64Array.from(pose()) },
        updated: () => { if (moveFrom && !samePose(pose(), moveFrom)) { moveFrom = null; askNow('update') } },
        settled: (reason = 'settled') => { moveFrom = null; askNow(reason) },
    }
}

// Renders the view's distances into a small float target and returns the median, or null (nothing in view, or the GPU
// cannot render floats: then the caller keeps the orbit distance it has). Only content counts: meshes under `roots`
// (the scene's entities), visible, not a helper, not see-through; everything else is hidden for this one render.
//
// One picture, two ways to read it (the synchronous read-back made a wheel notch wait for the GPU: median 3 ms, p90 9.1 ms,
// max 40.3 ms over 30 notches, scripts/nav/probe-depth-cost.cjs, RTX 3080 lane, 2026-10-13):
//   measure(args)  renders and reads on the spot: the value now, or null. The fallback; its behaviour is unchanged.
//   request(args)  renders now and reads in the background (three's readRenderTargetPixelsAsync: a pixel-pack buffer and a
//                  fence, so the CPU does not wait). At most ONE read is in flight; a request made meanwhile only replaces the
//                  one waiting (the newest args win) and is rendered when the read ends: coalesced, never queued. The finished
//                  picture is kept with the pose of the view camera it was drawn from.
//   peek(camera)   the kept picture's value if `camera` stands exactly where (and with the lens) it was drawn from, else
//                  undefined. undefined = no picture for this pose: use measure. null = measured, nothing in view.
// Inside: render() draws into a float target; readSync(target) and readAsync(target) read it; centreMedian turns the samples into the value.
// Limit: the key is the camera, not the scene. A scene edited while the camera stands still is seen again at the next move.
// three's readRenderTargetPixelsAsync binds a pixel-pack buffer, issues the read into it, and then waits for a fence with that buffer
// STILL BOUND (WebGLRenderer.js, r185). While one is bound, a readPixels into client memory is an INVALID_OPERATION and reads nothing
// (WebGL 2.0 spec, readPixels): our own synchronous measure would return an empty or stale picture, and so would anyone else's read.
// The read is already issued, so the binding point is let go at once; three binds the buffer again when the data is ready.
const unbindPackBuffer = (gl) => { const ctx = gl.getContext?.(); if (ctx?.PIXEL_PACK_BUFFER != null) ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null) }
const MAX_FAILURES = 3 // consecutive failed background reads, then request() stops and every notch reads on the spot
const KEEP = 200 // dev counters keep the last 200 timings
export function createSceneDistance() {
    let target = null, material = null, buffer = null, asyncBuffer = null
    let latest = null // { value, pose, projection } of the newest finished background read
    let inFlight = false, pending = null, disposed = false, failures = 0
    const camera = new PerspectiveCamera()
    const dev = import.meta.env?.DEV && typeof window !== 'undefined' ? window : null
    // dev only: __diSceneDistanceOff = true makes every notch read on the spot (the A/B for scripts/nav/probe-depth-cost.cjs)
    const off = () => dev?.__diSceneDistanceOff === true
    const reads = dev ? (dev.__diSceneDistanceReads = { requested: 0, resolved: 0, coalesced: 0, failed: 0, askedOn: {}, submitMs: [], latencyMs: [] }) : null
    const keep = (list, v) => { list.push(+v.toFixed(2)); if (list.length > KEEP) list.shift() }

    // RENDER: draws the distances of what the view shows into a float target (R = metres, A = 1 where something was hit) and returns
    // { target, t0 } (t0: the dev start time), or null when there is nothing to draw (no float targets, no content). Everything the
    // draw changed is put back before it returns, also when it throws. The two reads below take the target they are given: how it
    // was drawn is this function's business alone.
    const render = ({ gl, scene, camera: viewCamera, roots, near }) => {
        if (!gl || !scene || !viewCamera?.isPerspectiveCamera || !roots?.length) return null
        if (!gl.extensions?.has?.('EXT_color_buffer_float')) return null
        if (!target) {
            target = new WebGLRenderTarget(SAMPLE_WIDTH, SAMPLE_HEIGHT, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true })
            material = new ShaderMaterial({ vertexShader, fragmentShader })
            buffer = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4)
        }
        const allowed = new Set()
        const stack = [...roots]
        while (stack.length) {
            const o = stack.pop()
            if (!o || !o.visible || isNavigationHelper(o)) continue
            if (o.isMesh && !isSeeThrough(o.material)) allowed.add(o)
            for (const c of o.children || []) stack.push(c)
        }
        if (!allowed.size) return null
        const t0 = dev ? performance.now() : 0
        const hidden = []
        scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible && !allowed.has(o)) { o.visible = false; hidden.push(o) } })
        camera.fov = viewCamera.fov; camera.aspect = viewCamera.aspect; camera.zoom = viewCamera.zoom
        camera.near = Math.max(near, 1e-3); camera.far = viewCamera.far
        camera.updateProjectionMatrix()
        // The renderer rebuilds a parentless camera's matrices from position and rotation before it draws, so those are what
        // must match the view (copying matrixWorld alone drew from the origin: 64.6 m measured where the floor was 4.8 m).
        viewCamera.updateMatrixWorld()
        viewCamera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
        camera.updateMatrixWorld(true)
        const saved = { target: gl.getRenderTarget(), background: scene.background, fog: scene.fog, override: scene.overrideMaterial, autoClear: gl.autoClear, shadowAuto: gl.shadowMap.autoUpdate, shadowNeeds: gl.shadowMap.needsUpdate, xr: gl.xr.enabled, alpha: gl.getClearAlpha() }
        const clearColor = gl.getClearColor(new Color())
        try {
            scene.background = null; scene.fog = null; scene.overrideMaterial = material
            gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = false; gl.xr.enabled = false; gl.autoClear = true
            gl.setClearColor(0x000000, 0)
            gl.setRenderTarget(target)
            gl.render(scene, camera)
        } finally {
            gl.setRenderTarget(saved.target)
            gl.setClearColor(clearColor, saved.alpha)
            scene.background = saved.background; scene.fog = saved.fog; scene.overrideMaterial = saved.override
            gl.autoClear = saved.autoClear; gl.shadowMap.autoUpdate = saved.shadowAuto; gl.shadowMap.needsUpdate = saved.shadowNeeds; gl.xr.enabled = saved.xr
            for (const o of hidden) o.visible = true
        }
        return { target, t0 }
    }
    // READ, on the spot: the CPU waits for the GPU. Fills and returns the sync buffer.
    const readSync = (gl, from) => { gl.readRenderTargetPixels(from, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT, buffer); return buffer }
    // READ, in the background: three's pixel-pack buffer and a fence, no wait. A promise of `into` once it is filled.
    const readAsync = (gl, from, into) => { const promise = gl.readRenderTargetPixelsAsync(from, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT, into); unbindPackBuffer(gl); return promise }
    const toSamples = (rgba) => {
        const samples = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT)
        for (let i = 0; i < samples.length; i += 1) samples[i] = rgba[i * 4 + 3] > 0 ? rgba[i * 4] : 0
        return samples
    }

    const measure = (args) => {
        const drawn = render(args || {})
        if (!drawn) return null
        const samples = toSamples(readSync(args.gl, drawn.target))
        const result = centreMedian(samples, SAMPLE_WIDTH, SAMPLE_HEIGHT)
        if (dev) dev.__diSceneDistance = { source: 'sync', ms: +(performance.now() - drawn.t0).toFixed(2), result, whole: medianDistance(samples), centreSample: samples[(SAMPLE_HEIGHT >> 1) * SAMPLE_WIDTH + (SAMPLE_WIDTH >> 1)], hits: samples.filter((v) => v > 0).length, from: camera.position.toArray(), dir: camera.getWorldDirection(camera.up.clone()).toArray(), samples: Array.from(samples) }
        return result
    }

    const fail = (error) => {
        inFlight = false
        if (disposed) return
        failures += 1
        if (reads) reads.failed += 1
        if (failures === 1) console.warn('[sceneDistance] the background depth read failed; moves read it on the spot.', error ?? '(the GPU fence failed)')
        const next = pending; pending = null
        if (next && failures < MAX_FAILURES) start(next)
    }
    const finish = (rgba, pose, projection, t0) => {
        inFlight = false
        if (disposed) return // abandoned: nothing is written after dispose()
        failures = 0
        latest = { value: centreMedian(toSamples(rgba), SAMPLE_WIDTH, SAMPLE_HEIGHT), pose, projection }
        if (reads) { reads.resolved += 1; keep(reads.latencyMs, performance.now() - t0) }
        const next = pending; pending = null
        if (next) start(next)
    }
    function start(args) {
        const gl = args?.gl
        if (typeof gl?.readRenderTargetPixelsAsync !== 'function') return
        const rgba = (asyncBuffer ||= new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4))
        const t0 = dev ? performance.now() : 0
        let promise = null
        try {
            const drawn = render(args)
            if (!drawn) return
            promise = readAsync(gl, drawn.target, rgba)
        } catch (error) { fail(error); return }
        // The pose is the VIEW camera's, as drawn (render() brought its world matrix up to date, and nothing has moved it since).
        const pose = Float64Array.from(args.camera.matrixWorld.elements), projection = Float64Array.from(args.camera.projectionMatrix.elements)
        inFlight = true
        if (reads) { reads.requested += 1; keep(reads.submitMs, performance.now() - t0) }
        promise.then(() => finish(rgba, pose, projection, t0), fail)
    }
    const request = (args) => {
        if (disposed || failures >= MAX_FAILURES || off()) return
        if (inFlight) { if (reads) reads.coalesced += 1; pending = args; return }
        start(args)
    }
    const peek = (viewCamera) => {
        if (disposed || !latest || !viewCamera?.matrixWorld || off()) return undefined
        viewCamera.updateMatrixWorld()
        if (!samePose(viewCamera.matrixWorld.elements, latest.pose) || !samePose(viewCamera.projectionMatrix.elements, latest.projection)) return undefined
        if (dev) dev.__diSceneDistance = { source: 'peek', result: latest.value }
        return latest.value
    }
    // A read still in flight is abandoned: its result is dropped when it lands, and the request waiting behind it is never drawn.
    const dispose = () => { disposed = true; pending = null; latest = null; asyncBuffer = null; target?.dispose(); material?.dispose(); target = null; material = null }
    return { measure, request, peek, dispose }
}
