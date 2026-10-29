/* global __APP_VERSION__, __APP_GIT_COMMIT__, __APP_GIT_BRANCH__ */
// MEASUREMENT MODE — the JSON every reading is written as (pure). One envelope for every
// probe, so a result file always says what it measured, in which units, with which camera,
// in which build, on which GPU, of which scene and when. Schema: docs/architecture/MEASUREMENT_MODE.md.
import { REVISION } from 'three'

export const MEASURE_SCHEMA = 'di.measure/1'

export const UNITS = Object.freeze({
    lux: {
        E_lx: 'lx (lm/m²): illuminance on the probe patch, = E_scene / sceneScale; null when sceneScale is unknown or the target overflowed',
        E_scene: 'scene units: π × the patch luminance as three.js computed it',
        radiance_rgb_scene: 'scene units: the patch radiance, linear Rec.709 RGB',
        position: 'm, world',
        normal: 'unit vector, world'
    },
    beamProfile: {
        x: 'm across the beam, in the plane through its axis square to the camera',
        L_cd_m2: 'cd/m²: luminance seen by the camera, = L_scene / sceneScale',
        L_scene: 'scene units: linear luminance (Rec.709 Y) read back before tone mapping',
        width50_m: 'm: full width at 50 % of the peak above background (beam)',
        width10_m: 'm: full width at 10 % of the peak above background (field)',
        integral: 'unit × m: ∫(L − background) dx'
    },
    lamps: {
        position: 'm, world',
        direction: 'unit vector, world',
        intensity_scene: 'three.js SpotLight.intensity (candela × sceneScale)',
        candela: 'cd = intensity_scene / sceneScale',
        distance_m: 'three.js cutoff distance (0 = pure inverse square; > 0 multiplies by (1 − (d/cutoff)⁴)², not physical)'
    }
})

/** What drew the numbers: the app's build, three.js, the GPU, and how the pixels were read. */
export const rendererInfo = (gl) => {
    let gpu = null
    let vendor = null
    try {
        const ctx = gl?.getContext?.()
        const ext = ctx?.getExtension?.('WEBGL_debug_renderer_info')
        gpu = ctx ? ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) : null
        vendor = ctx ? ctx.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : ctx.VENDOR) : null
    } catch {
        // a lost context: the build is still known
    }
    return {
        app: 'di.iiii',
        version: typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__,
        commit: typeof __APP_GIT_COMMIT__ === 'undefined' ? null : __APP_GIT_COMMIT__,
        branch: typeof __APP_GIT_BRANCH__ === 'undefined' ? null : __APP_GIT_BRANCH__,
        three: REVISION,
        gpu,
        gpuVendor: vendor,
        readback: 'RGBA16F (half float) render target, read as RGBA/FLOAT, before tone mapping, exposure, bloom and glare veil'
    }
}

/** The camera block every report carries. */
export const cameraBlock = (measurement) => ({
    ev100: measurement ? Number(measurement.ev100.toFixed(4)) : null,
    ev100Source: measurement?.ev100Source ?? null,
    toneMappingExposure: measurement ? Number(measurement.exposure.toPrecision(6)) : null,
    operatorInputScale: measurement?.operatorInputScale ?? null,
    method: 'EV100 per Lagarde & de Rousiers 2014 §5.1 (ISO 12232 saturation): L enters the tone curve as L/(1.2·2^EV100); probes read linear values, independent of it',
    autoExposure: 'off',
    bloom: 'off',
    glareVeil: 'off'
})

/** One result: `kind` 'lux' | 'beamProfile' | 'lamps' | 'state'. */
export const buildReport = ({ kind, measurement, renderer, scene, time = new Date(), switchedOff = [], data }) => ({
    schema: MEASURE_SCHEMA,
    kind,
    time: (time instanceof Date ? time : new Date(time)).toISOString(),
    scene,
    renderer,
    camera: cameraBlock(measurement),
    sceneScale: measurement?.sceneScale ?? null,
    sceneScaleSource: measurement?.sceneScaleSource ?? null,
    directOnly: measurement ? !measurement.bounce : null,
    switchedOff,
    units: UNITS[kind] || null,
    data
})
