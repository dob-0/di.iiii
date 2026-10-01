// The room's haze as shader uniforms — ONE set per renderer, the same objects handed to
// every beam's material (beamAirMaterial.js), so a hazer turned up, a look's haze level
// or the noise drifting changes every beam at once: no React render, no recompile (the
// array sizes are fixed at MAX_HAZE_SOURCES).
import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType, Vector3, Vector4 } from 'three'
import { MAX_HAZE_SOURCES, NOISE_SIZE, hazeNoiseData } from './hazeField.js'

let noiseTexture = null
/** The patchiness noise (hazeField.js hazeNoiseData), one texture for the whole page. */
export const hazeNoiseTexture = () => {
    if (noiseTexture) return noiseTexture
    const t = new Data3DTexture(hazeNoiseData(), NOISE_SIZE, NOISE_SIZE, NOISE_SIZE)
    t.format = RedFormat
    t.type = UnsignedByteType
    t.minFilter = LinearFilter
    t.magFilter = LinearFilter
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
    t.wrapR = RepeatWrapping
    t.unpackAlignment = 1
    t.needsUpdate = true
    noiseTexture = t
    return t
}

const createHazeUniforms = () => ({
    uFill: { value: 0.03 },
    uHazeCount: { value: 0 },
    uHazePos: { value: Array.from({ length: MAX_HAZE_SOURCES }, () => new Vector3()) },
    uHazeDir: { value: Array.from({ length: MAX_HAZE_SOURCES }, () => new Vector3(0, 0, 1)) },
    uHazeJet: { value: Array.from({ length: MAX_HAZE_SOURCES }, () => new Vector4(0, 0.05, 0.11, 1)) },
    uHazeNoise: { value: hazeNoiseTexture() },
    uPatch: { value: 0 },
    uDrift: { value: new Vector3() },
    uHazeTime: { value: 0 }
})

const perRenderer = new WeakMap()
let detached = null
/** This renderer's haze uniforms (null gl: a set of its own, for a material outside any Canvas). */
export const hazeUniformsFor = (gl) => {
    if (!gl) {
        if (!detached) detached = createHazeUniforms()
        return detached
    }
    let u = perRenderer.get(gl)
    if (!u) {
        u = createHazeUniforms()
        perRenderer.set(gl, u)
    }
    return u
}

/**
 * Write the haze into the uniforms: the field when the room has one (hazeField.js
 * buildHazeField), else the one uniform scattering it always had.
 */
export const writeHazeUniforms = (u, atmosphere, field) => {
    if (!atmosphere) return
    if (!field) {
        u.uFill.value = atmosphere.scattering
        u.uHazeCount.value = 0
        u.uPatch.value = 0
        return
    }
    u.uFill.value = field.fill
    u.uPatch.value = field.patchiness
    u.uDrift.value.set(field.drift[0], field.drift[1], field.drift[2])
    const n = Math.min(field.jets.length, MAX_HAZE_SOURCES)
    for (let i = 0; i < n; i += 1) {
        const j = field.jets[i]
        u.uHazePos.value[i].set(j.position[0], j.position[1], j.position[2])
        u.uHazeDir.value[i].set(j.direction[0], j.direction[1], j.direction[2])
        u.uHazeJet.value[i].set(j.sigma0, j.nozzle, j.spread, j.reach)
    }
    u.uHazeCount.value = n
}
