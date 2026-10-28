// MEASUREMENT MODE — the probes, on the GPU (the numbers they turn into: measureMath.js).
//
// Both probes render the scene again, with their own camera, into their OWN half-float
// target (RGBA16F) and read it back as linear floats — before any tone mapping, exposure,
// bloom or glare veil. three.js leaves tone mapping and the output colour transform out of
// any draw into a render target (WebGLPrograms: toneMapping is NoToneMapping and the output
// colour space linear unless the target is the canvas or an XR layer), so a pixel read here
// is the radiance the scene's shaders computed, in scene units.
//
// LUX PROBE — a virtual illuminance meter. At each point an ideal white Lambertian patch
// (MeshLambertMaterial, ρ = 1, no fog, receiving shadows) faces the given normal (default up)
// and is looked at square-on by an orthographic camera that sees ONLY the probe layer, so
// nothing in the scene stands between it and the patch. The scene's lights are put on that
// layer for the draw; the shadow maps are the ones the scene's last frame drew (not redrawn
// from the probe's camera, which sees no casters). The patch's radiance L gives E = π·L.
//
// BEAM-PROFILE PROBE — a luminance meter looking across a beam. At each distance d along the
// beam's axis a pinhole camera stands `viewFrom` metres off the axis, square to it, and one
// row of pixels is read across the beam: luminance against offset in metres. Everything the
// camera sees is in the reading (the haze in the beam, the hall behind it); profileStats
// subtracts the background beside the beam before it finds the widths.
import { Color, Group, HalfFloatType, Mesh, MeshLambertMaterial, NearestFilter, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Vector3, WebGLRenderTarget } from 'three'
import { hazeUniformsFor } from '../../../objectComponents/hazeUniforms.js'
import { BEAM_AIR_SAMPLES } from '../../../objectComponents/beamAir.js'
import { illuminanceFromPatch, luminanceOf, meanRgb, overflowed, profileStats, toPhysical } from './measureMath.js'

/** The layer only the lux probe's camera sees (three.js has 32; 31 is unused in di.iiii). */
export const PROBE_LAYER = 31
/** The probe patch's side, m: small enough that E is one point's, large enough to fill its pixels. */
export const PROBE_PATCH_M = 0.02
/** Pixels per probe tile (the reading is their mean). */
export const PROBE_TILE_PX = 4

const halfTarget = (w, h, { stencil = false } = {}) => {
    const t = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: true, stencilBuffer: stencil, samples: 0 })
    t.texture.minFilter = NearestFilter
    t.texture.magFilter = NearestFilter
    t.texture.generateMipmaps = false
    return t
}

/**
 * Read a half-float target as 32-bit floats. WebGL2 with EXT_color_buffer_float always allows
 * RGBA/FLOAT reads of a float colour buffer (the half values convert exactly), whatever the
 * implementation's preferred read type is.
 */
export const readLinear = (gl, target, x, y, w, h) => {
    const ctx = gl.getContext()
    const out = new Float32Array(w * h * 4)
    const was = gl.getRenderTarget()
    gl.setRenderTarget(target)
    ctx.readPixels(x, y, w, h, ctx.RGBA, ctx.FLOAT, out)
    gl.setRenderTarget(was)
    return out
}

// The renderer's state a probe changes, put back exactly afterwards.
const saveState = (gl, scene) => {
    return {
        target: gl.getRenderTarget(),
        autoClear: gl.autoClear,
        clearColor: gl.getClearColor(new Color()),
        clearAlpha: gl.getClearAlpha(),
        shadowAuto: gl.shadowMap.autoUpdate,
        shadowNeeds: gl.shadowMap.needsUpdate,
        override: scene.overrideMaterial,
        samples: hazeUniformsFor(gl).uSamples.value
    }
}
const restoreState = (gl, scene, s) => {
    gl.setRenderTarget(s.target)
    gl.autoClear = s.autoClear
    gl.setClearColor(s.clearColor, s.clearAlpha)
    gl.shadowMap.autoUpdate = s.shadowAuto
    gl.shadowMap.needsUpdate = s.shadowNeeds
    scene.overrideMaterial = s.override
    hazeUniformsFor(gl).uSamples.value = s.samples
}

const vec = (a, fallback) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? new Vector3(a[0], a[1], a[2]) : fallback.clone())
const UP = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const round = (n, d = 6) => (Number.isFinite(n) ? Number(n.toPrecision(d)) : n)

/**
 * Illuminance at points. `points`: [{ name?, position: [x,y,z], normal?: [x,y,z] }] in world
 * metres; returns one reading each: E in lux (null when sceneScale is unknown) and in scene
 * units, the patch's linear RGB radiance, and whether the half-float target overflowed.
 */
export const measureLux = (gl, scene, points, { sceneScale = null, patch = PROBE_PATCH_M, px = PROBE_TILE_PX } = {}) => {
    const list = (points || []).map((p, i) => ({
        name: p?.name || `p${i + 1}`,
        position: vec(p?.position, new Vector3()),
        normal: vec(p?.normal, UP).normalize()
    }))
    if (!list.length) return []
    const state = saveState(gl, scene)
    const target = halfTarget(px * list.length, px)
    const geometry = new PlaneGeometry(patch, patch)
    const material = new MeshLambertMaterial({ color: 0xffffff, fog: false })
    const group = new Group()
    group.name = 'measure-lux-probes'
    const lights = []
    scene.traverse((o) => {
        if (o.isLight) lights.push([o, o.layers.mask])
    })
    const camera = new OrthographicCamera(-patch * 0.4, patch * 0.4, patch * 0.4, -patch * 0.4, 0.001, 1)
    camera.layers.set(PROBE_LAYER)
    try {
        for (const [light] of lights) light.layers.enable(PROBE_LAYER)
        scene.overrideMaterial = null
        // the scene's own shadow maps, from its last frame: the probe camera sees no casters
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = false
        gl.autoClear = false
        gl.setClearColor(0x000000, 0)
        scene.add(group)
        list.forEach((p, i) => {
            const mesh = new Mesh(geometry, material)
            mesh.layers.set(PROBE_LAYER)
            mesh.receiveShadow = true
            mesh.raycast = () => {}
            mesh.position.copy(p.position)
            mesh.quaternion.setFromUnitVectors(Z, p.normal)
            group.add(mesh)
            // square-on, 10 cm in front of the patch; any up that is not along the normal
            camera.up.copy(Math.abs(p.normal.dot(UP)) > 0.99 ? Z : UP)
            camera.position.copy(p.position).addScaledVector(p.normal, 0.1)
            camera.lookAt(p.position)
            camera.updateMatrixWorld()
            for (const m of group.children) m.visible = m === mesh
            target.viewport.set(i * px, 0, px, px)
            target.scissor.set(i * px, 0, px, px)
            target.scissorTest = true
            gl.setRenderTarget(target)
            gl.clear(true, true, true)
            gl.render(scene, camera)
        })
        const pixels = readLinear(gl, target, 0, 0, px * list.length, px)
        return list.map((p, i) => {
            // the tile's pixels: rows of px*N, take columns i*px … i*px+px-1
            const tile = new Float32Array(px * px * 4)
            for (let y = 0; y < px; y += 1) tile.set(pixels.subarray((y * px * list.length + i * px) * 4, (y * px * list.length + i * px + px) * 4), y * px * 4)
            const { rgb, overflow } = meanRgb(tile)
            const L = luminanceOf(rgb[0], rgb[1], rgb[2])
            const Escene = illuminanceFromPatch(L)
            return {
                name: p.name,
                position: p.position.toArray().map((n) => round(n)),
                normal: p.normal.toArray().map((n) => round(n)),
                E_lx: overflow ? null : round(toPhysical(Escene, sceneScale)),
                E_scene: overflow ? null : round(Escene),
                radiance_rgb_scene: rgb.map((n) => round(n)),
                overflow
            }
        })
    } finally {
        scene.remove(group)
        for (const [light, mask] of lights) light.layers.mask = mask
        geometry.dispose()
        material.dispose()
        target.dispose()
        restoreState(gl, scene, state)
    }
}

/**
 * Luminance across a beam. `origin` the lens (world m), `direction` the beam's axis,
 * `distances` along it (m). Options: `across` the direction to read along (default: level,
 * square to the axis), `viewFrom` the camera's distance from the axis (m, default 10),
 * `halfSpan` the half-width read (m, default max(1, 0.25·d)), `px` samples across (default 257).
 */
export const measureBeamProfile = (gl, scene, { origin, direction, distances = [3, 10, 20], across = null, viewFrom = 10, halfSpan = null, px = 257, sceneScale = null } = {}) => {
    const o = vec(origin, new Vector3())
    const dir = vec(direction, new Vector3(0, -1, 0)).normalize()
    let u = across ? vec(across, new Vector3(1, 0, 0)) : new Vector3().crossVectors(dir, UP)
    if (u.lengthSq() < 1e-8) u = new Vector3(1, 0, 0)
    u.addScaledVector(dir, -u.dot(dir)).normalize() // square to the axis
    const v = new Vector3().crossVectors(dir, u).normalize() // the camera looks along v
    const rows = 3
    const state = saveState(gl, scene)
    const target = halfTarget(px, rows, { stencil: true }) // the stencil: the floor's mirror mask (BeamMirrors.jsx)
    const camera = new PerspectiveCamera(10, px / rows, 0.05, viewFrom + 1000)
    try {
        hazeUniformsFor(gl).uSamples.value = BEAM_AIR_SAMPLES // full quality, whatever the governor chose
        scene.overrideMaterial = null
        gl.autoClear = false
        gl.setClearColor(0x000000, 0)
        return distances.map((d) => {
            const span = Number(halfSpan) > 0 ? Number(halfSpan) : Math.max(1, 0.25 * d)
            const centre = o.clone().addScaledVector(dir, d)
            camera.fov = (2 * Math.atan((span * rows) / px / viewFrom) * 180) / Math.PI
            camera.aspect = px / rows
            camera.up.copy(dir)
            camera.position.copy(centre).addScaledVector(v, -viewFrom)
            camera.lookAt(centre)
            camera.updateProjectionMatrix()
            camera.updateMatrixWorld()
            const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
            gl.setRenderTarget(target)
            gl.clear(true, true, true)
            gl.render(scene, camera)
            const row = readLinear(gl, target, 0, 1, px, 1)
            const samples = []
            let overflow = false
            for (let i = 0; i < px; i += 1) {
                const rgb = [row[i * 4], row[i * 4 + 1], row[i * 4 + 2]]
                if (overflowed(...rgb)) overflow = true
                const Ls = luminanceOf(rgb[0], rgb[1], rgb[2])
                samples.push({ x: round((((i + 0.5) / px) * 2 - 1) * span), L_scene: round(Ls), L_cd_m2: round(toPhysical(Ls, sceneScale)) })
            }
            const physical = Number(sceneScale) > 0
            const stats = profileStats(samples.map((s) => ({ x: s.x, L: physical ? s.L_cd_m2 : s.L_scene })))
            return {
                distance_m: d,
                centre: centre.toArray().map((n) => round(n)),
                across: right.toArray().map((n) => round(n)),
                lookingAlong: v.toArray().map((n) => round(n)),
                viewFrom_m: viewFrom,
                halfSpan_m: span,
                unit: physical ? 'cd/m²' : 'scene units',
                stats: {
                    background: round(stats.background),
                    peak: round(stats.peak),
                    peakX_m: stats.peakX,
                    width50_m: stats.width50 === null ? null : round(stats.width50),
                    width10_m: stats.width10 === null ? null : round(stats.width10),
                    integral: round(stats.integral)
                },
                overflow,
                samples
            }
        })
    } finally {
        target.dispose()
        restoreState(gl, scene, state)
    }
}
