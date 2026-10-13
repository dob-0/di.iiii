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

// Renders the view's distances into a small float target and returns the median, or null (nothing in view, or the GPU
// cannot render floats: then the caller keeps the orbit distance it has). Only content counts: meshes under `roots`
// (the scene's entities), visible, not a helper, not see-through; everything else is hidden for this one render.
export function createSceneDistance() {
    let target = null, material = null, buffer = null
    const camera = new PerspectiveCamera()
    const measure = ({ gl, scene, camera: viewCamera, roots, near }) => {
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
        const t0 = import.meta.env?.DEV ? performance.now() : 0
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
            gl.readRenderTargetPixels(target, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT, buffer)
        } finally {
            gl.setRenderTarget(saved.target)
            gl.setClearColor(clearColor, saved.alpha)
            scene.background = saved.background; scene.fog = saved.fog; scene.overrideMaterial = saved.override
            gl.autoClear = saved.autoClear; gl.shadowMap.autoUpdate = saved.shadowAuto; gl.shadowMap.needsUpdate = saved.shadowNeeds; gl.xr.enabled = saved.xr
            for (const o of hidden) o.visible = true
        }
        const samples = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT)
        for (let i = 0; i < samples.length; i += 1) samples[i] = buffer[i * 4 + 3] > 0 ? buffer[i * 4] : 0
        const result = centreMedian(samples, SAMPLE_WIDTH, SAMPLE_HEIGHT)
        if (import.meta.env?.DEV) window.__diSceneDistance = { ms: +(performance.now() - t0).toFixed(2), result, whole: medianDistance(samples), centreSample: samples[(SAMPLE_HEIGHT >> 1) * SAMPLE_WIDTH + (SAMPLE_WIDTH >> 1)], hits: samples.filter((v) => v > 0).length, from: camera.position.toArray(), dir: camera.getWorldDirection(camera.up.clone()).toArray(), samples: Array.from(samples) }
        return result
    }
    const dispose = () => { target?.dispose(); material?.dispose(); target = null; material = null }
    return { measure, dispose }
}
