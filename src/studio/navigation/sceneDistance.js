// SCENE DISTANCE (owner, 2026-10-13: "it gets stuck at objects, then jumps — new mechanics, not numbers"; his yes to this method).
// Method: McCrae, Mordatch, Glueck & Khan, "Multiscale 3D Navigation", I3D 2009 (Autodesk Research): the speed of a move comes
// from how far the scene is, measured from a small depth picture rendered from the camera, never from one surface under the
// pointer. Blender's Auto Depth takes the one pixel under the pointer at the start of each move (view3d_navigate.cc
// navigate_pivot_get, v5.0.0); in a dense rig that pixel is a lamp 1 m away one move and the back wall 40 m away the next,
// so moves crawl, then fly (measured, scripts/nav/probe-stick-jump.cjs).
// The picture is drawn with the scene's OWN materials and read from the depth they leave, as Blender reads its viewport depth
// buffer (review-892 F4-F6, 2026-10-13): whatever the eye does not see writes no depth here either — the Smart View's cut planes
// and near fade, back faces of one-sided surfaces, cut-outs, see-through glass. A second pass turns depth into metres.
// OUR choices, written down as such (unvalidated against the paper's numbers): the statistic is the MEDIAN distance of what the
// CENTRE of the view shows, its middle third across and down, when at least half of that centre shows something, else the
// whole view's median (review-892 F7: three truss pixels decided 1.5 m against a 20 m view); the paper uses the nearest geometry
// around the camera, which in a hall is the floor under the eye and would slow every move to the eye height. The wheel's picture
// starts at the controls' contact distance, so a surface you are pressed against drops out and the wheel goes through it (the
// owner's "unlimited scroll"); a drag's picture starts at the camera's own near plane, so a drag follows what you see.
import { Color, DataUtils, DepthTexture, FloatType, HalfFloatType, Mesh, NearestFilter, OrthographicCamera, PerspectiveCamera, PlaneGeometry,
    RGBAFormat, Scene, ShaderMaterial, WebGLRenderTarget } from 'three'
import { isNavigationHelper } from './autoDepth.js'

// The depth picture's size: a cost bound (one 64 x 36 render and read-back per measurement, 2304 samples), not a tuning knob:
// the median of a view does not move with the sampling density.
export const SAMPLE_WIDTH = 64
export const SAMPLE_HEIGHT = 36

// A material the eye sees through: drawn without depth writes, faded, not drawn into colour, or hidden. Pure.
export function isSeeThrough(material) {
    const list = Array.isArray(material) ? material : [material]
    return list.every(isSeeThroughSlot)
}
function isSeeThroughSlot(m) {
    return !m || m.visible === false || m.depthWrite === false || m.colorWrite === false || (m.transparent === true && Number(m.opacity) < 0.99)
}

// The median of the samples that hit something (> 0). Null when nothing is in view. Pure.
export function medianDistance(samples) {
    const hits = []
    for (let i = 0; i < samples.length; i += 1) if (samples[i] > 0 && Number.isFinite(samples[i])) hits.push(samples[i])
    if (!hits.length) return null
    hits.sort((a, b) => a - b)
    const mid = hits.length >> 1
    return hits.length % 2 ? hits[mid] : (hits[mid - 1] + hits[mid]) / 2
}

// The median over the middle third of a width x height grid (row-major) when at least half of that centre shows something,
// else over the whole grid (review-892 F7: 3 truss pixels of 924 decided 1.5 m against a 20 m view). The half is ours. Pure.
export function centreMedian(samples, width, height) {
    const centre = []
    for (let y = Math.floor(height / 3); y < Math.ceil((2 * height) / 3); y += 1) for (let x = Math.floor(width / 3); x < Math.ceil((2 * width) / 3); x += 1) centre.push(samples[y * width + x])
    let hits = 0
    for (const v of centre) if (v > 0 && Number.isFinite(v)) hits += 1
    return (hits * 2 >= centre.length ? medianDistance(centre) : null) ?? medianDistance(samples)
}

// The distance a move uses. Inside one continuous wheel run (`consecutive`: the last thing that moved the camera was this
// wheel) it may change at most by `ratio` from the distance the previous notch USED; the caller passes 1.2 per notch of
// scroll (Blender's step), raised to the notches the event carries, so a trackpad's tenth of a notch moves it a tenth as
// much (review-892 F1, F2). Passing through a wall then ramps up 1.2x per notch, and a lamp entering the view ramps down.
// Any other move measures afresh. Nothing in view keeps the previous distance (Blender keeps the view's depth when Auto Depth
// finds nothing). Clamped to the controls' range. Pure.
export function nextSceneDistance({ measured, previous = null, consecutive = false, ratio = 1.2, min = 0, max = Infinity }) {
    let d = measured
    if (!(d > 0)) d = previous
    if (!(d > 0)) return null
    if (consecutive && previous > 0) d = Math.min(Math.max(d, previous / ratio), previous * ratio)
    return Math.min(Math.max(d, min), max)
}

// Pass 2: metres per pixel from the depth the real draw left (perspective depth, WebGL clip space; the Studio uses neither a
// logarithmic nor a reversed depth buffer).
const quadVertex = /* glsl */`varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const quadFragment = /* glsl */`uniform sampler2D tDepth;
uniform mat4 uProjectionInverse;
varying vec2 vUv;
void main() {
    float z = texture2D(tDepth, vUv).x;
    if (z >= 1.0) { gl_FragColor = vec4(0.0); return; }
    vec4 v = uProjectionInverse * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    gl_FragColor = vec4(length(v.xyz / v.w), 0.0, 0.0, 1.0);
}`

// One depth camera for the page: three keeps a transmission target per camera id and never frees it (review-892 F8).
const depthCamera = new PerspectiveCamera()
let warnedNoFloat = false

// Renders the view's distances and returns the centre median, or null (nothing in view; a GPU with no float or half-float
// target says so once and the caller keeps the orbit distance it has). Only content draws: meshes under `roots` (the scene's
// entities), visible, not a helper, not see-through; see-through slots of a solid mesh write no depth for this one picture.
// `near` is where the picture starts (the wheel: the contact distance; a drag: the camera's own near plane).
export function createSceneDistance() {
    let drawn = null, metres = null, quad = null, quadCamera = null, quadMaterial = null, buffer = null, type = null
    const ensure = (gl) => {
        if (metres) return true
        type = gl.extensions?.has?.('EXT_color_buffer_float') ? FloatType : gl.extensions?.has?.('EXT_color_buffer_half_float') ? HalfFloatType : null
        if (!type) {
            if (!warnedNoFloat) { warnedNoFloat = true; console.warn('[scene distance] no float render target on this GPU: Edit moves keep the orbit distance') }
            return false
        }
        drawn = new WebGLRenderTarget(SAMPLE_WIDTH, SAMPLE_HEIGHT, { minFilter: NearestFilter, magFilter: NearestFilter, depthTexture: new DepthTexture(SAMPLE_WIDTH, SAMPLE_HEIGHT, FloatType) })
        metres = new WebGLRenderTarget(SAMPLE_WIDTH, SAMPLE_HEIGHT, { type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })
        quadMaterial = new ShaderMaterial({ vertexShader: quadVertex, fragmentShader: quadFragment, depthTest: false, depthWrite: false,
            uniforms: { tDepth: { value: drawn.depthTexture }, uProjectionInverse: { value: depthCamera.projectionMatrixInverse } } })
        const plane = new Mesh(new PlaneGeometry(2, 2), quadMaterial)
        plane.frustumCulled = false
        quad = new Scene(); quad.add(plane); quadCamera = new OrthographicCamera()
        buffer = type === FloatType ? new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4) : new Uint16Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4)
        return true
    }
    const measure = ({ gl, scene, camera: viewCamera, roots, near }) => {
        if (!gl || !scene || !viewCamera?.isPerspectiveCamera || !roots?.length) return null
        if (!ensure(gl)) return null
        const allowed = new Set(), slots = []
        const stack = [...roots]
        while (stack.length) {
            const o = stack.pop()
            if (!o || !o.visible || isNavigationHelper(o)) continue
            if (o.isMesh && !isSeeThrough(o.material)) {
                allowed.add(o)
                if (Array.isArray(o.material)) for (const m of o.material) if (m && m.depthWrite && isSeeThroughSlot(m)) slots.push(m)
            }
            for (const c of o.children || []) stack.push(c)
        }
        if (!allowed.size) return null
        const t0 = import.meta.env?.DEV ? performance.now() : 0
        depthCamera.fov = viewCamera.fov; depthCamera.aspect = viewCamera.aspect; depthCamera.zoom = viewCamera.zoom
        depthCamera.near = Math.max(near, 1e-3); depthCamera.far = viewCamera.far
        depthCamera.layers.mask = viewCamera.layers.mask
        depthCamera.updateProjectionMatrix()
        // The renderer rebuilds a parentless camera's matrices from position and rotation before it draws (copying matrixWorld
        // alone drew from the origin: 64.6 m measured where the floor was 4.8 m, 2026-10-13).
        viewCamera.updateMatrixWorld()
        viewCamera.matrixWorld.decompose(depthCamera.position, depthCamera.quaternion, depthCamera.scale)
        depthCamera.updateMatrixWorld(true)
        const hidden = [], unwritten = []
        const saved = { target: gl.getRenderTarget(), face: gl.getActiveCubeFace(), mip: gl.getActiveMipmapLevel(), background: scene.background,
            autoClear: gl.autoClear, shadowAuto: gl.shadowMap.autoUpdate, shadowNeeds: gl.shadowMap.needsUpdate, xr: gl.xr.enabled,
            alpha: gl.getClearAlpha(), clearColor: gl.getClearColor(new Color()), infoAuto: gl.info.autoReset }
        try {
            // inside the try: the finally always shows them again (review-892 F10)
            scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible && !allowed.has(o)) { o.visible = false; hidden.push(o) } })
            for (const m of slots) { m.depthWrite = false; unwritten.push(m) }
            scene.background = null
            gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = false; gl.xr.enabled = false; gl.autoClear = true
            gl.info.autoReset = false // the app's frame statistics are not reset by this picture (review-892 F8)
            gl.setClearColor(0x000000, 0)
            gl.setRenderTarget(drawn)
            gl.render(scene, depthCamera)
            gl.setRenderTarget(metres)
            gl.render(quad, quadCamera)
            gl.readRenderTargetPixels(metres, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT, buffer)
        } finally {
            gl.setRenderTarget(saved.target, saved.face, saved.mip)
            gl.setClearColor(saved.clearColor, saved.alpha)
            scene.background = saved.background
            gl.autoClear = saved.autoClear; gl.shadowMap.autoUpdate = saved.shadowAuto; gl.shadowMap.needsUpdate = saved.shadowNeeds; gl.xr.enabled = saved.xr
            gl.info.autoReset = saved.infoAuto
            for (const m of unwritten) m.depthWrite = true
            for (const o of hidden) o.visible = true
        }
        const samples = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT)
        const half = type === HalfFloatType
        for (let i = 0; i < samples.length; i += 1) {
            const v = half ? DataUtils.fromHalfFloat(buffer[i * 4]) : buffer[i * 4]
            samples[i] = v > 0 && Number.isFinite(v) ? v : 0
        }
        const result = centreMedian(samples, SAMPLE_WIDTH, SAMPLE_HEIGHT)
        if (import.meta.env?.DEV) window.__diSceneDistance = { ms: +(performance.now() - t0).toFixed(2), result, whole: medianDistance(samples), centreSample: samples[(SAMPLE_HEIGHT >> 1) * SAMPLE_WIDTH + (SAMPLE_WIDTH >> 1)], hits: samples.filter((v) => v > 0).length, near: depthCamera.near, from: depthCamera.position.toArray(), samples: Array.from(samples) }
        return result
    }
    const dispose = () => {
        drawn?.depthTexture?.dispose(); drawn?.dispose(); metres?.dispose(); quadMaterial?.dispose()
        quad?.children[0]?.geometry?.dispose()
        drawn = null; metres = null; quad = null; quadMaterial = null
    }
    return { measure, dispose }
}
