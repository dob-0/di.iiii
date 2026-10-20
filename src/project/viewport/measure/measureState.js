// MEASUREMENT MODE — whether it is on, and with which camera (pure apart from the page-wide
// request store). Not on the visitor's UI: it is asked for with a URL flag or a hidden key.
//
//   ?measure                 on, at the scene's own exposure stated as an EV100
//   ?measure&ev100=3         on, at a fixed EV100 of 3
//   &scale=0.02              the rig's sceneScale (three.js intensity = candela × scale), when
//                            the document does not carry renderSettings.photometry.sceneScale
//   &bounce=1                keep the rig's bounce ambient (rigBounce.js); off by default, so
//                            a probe reads DIRECT light only (simulation-method §3.3 T2)
//   &scene=<id>              the scene id written into every result (default: the page path)
//   Alt+Shift+M              toggles it on any page with a scene (the hidden toggle)
//
// docs/architecture/MEASUREMENT_MODE.md has the whole contract.
import { ev100ForExposure, exposureForEv100, operatorInputScale } from './measureMath.js'

const OFF = new Set(['0', 'off', 'false', 'no'])
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** The request in a URL query string, or null when the mode is not asked for. */
export const parseMeasureParams = (search = '') => {
    const q = new URLSearchParams(search)
    if (!q.has('measure') || OFF.has(String(q.get('measure')).toLowerCase())) return null
    const scale = num(q.get('scale'))
    return {
        ev100: num(q.get('ev100')),
        sceneScale: scale !== null && scale > 0 ? scale : null,
        bounce: q.get('bounce') === '1' || q.get('bounce') === 'true',
        scene: q.get('scene') || null
    }
}

/** The hidden toggle: Alt+Shift+M (KeyM by physical key, so any keyboard layout). */
export const isMeasureChord = (event) => Boolean(event?.altKey && event?.shiftKey && !event?.ctrlKey && !event?.metaKey && event?.code === 'KeyM')

/**
 * The camera the mode draws with. `request` from parseMeasureParams (or the toggle);
 * `toneMapping` the renderer's operator. The sceneScale comes from the URL, else the document
 * (renderSettings.photometry.sceneScale), else it is UNKNOWN: values are then in scene units
 * and every physical number is null — never a guessed lux.
 */
export const resolveMeasurement = (request, renderSettings, toneMapping) => {
    if (!request) return null
    const docScale = Number(renderSettings?.photometry?.sceneScale)
    let sceneScale = null
    let sceneScaleSource = 'unknown: no &scale= and no renderSettings.photometry.sceneScale; values are scene units'
    if (request.sceneScale > 0) {
        sceneScale = request.sceneScale
        sceneScaleSource = 'url &scale='
    } else if (docScale > 0) {
        sceneScale = docScale
        sceneScaleSource = 'document renderSettings.photometry.sceneScale'
    }
    const scaleForExposure = sceneScale ?? 1
    const sceneExposure = Number(renderSettings?.toneMappingExposure) > 0 ? Number(renderSettings.toneMappingExposure) : 1
    const fixed = Number.isFinite(request.ev100)
    const ev100 = fixed ? request.ev100 : ev100ForExposure(sceneExposure, { sceneScale: scaleForExposure, toneMapping })
    return {
        ev100,
        ev100Source: fixed ? 'url &ev100=' : `the scene's toneMappingExposure ${sceneExposure}`,
        exposure: exposureForEv100(ev100, { sceneScale: scaleForExposure, toneMapping }),
        operatorInputScale: operatorInputScale(toneMapping),
        sceneScale,
        sceneScaleSource,
        bounce: Boolean(request.bounce),
        scene: request.scene || null
    }
}

// ---- the page-wide request (URL flag + the hidden toggle) ----------------------------------
let request = typeof window !== 'undefined' ? parseMeasureParams(window.location?.search) : null
const listeners = new Set()

export const getMeasureRequest = () => request
export const subscribeMeasureRequest = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
/** Set (or clear, with null) the request; the toggle and a test harness use it. */
export const setMeasureRequest = (next) => {
    request = next || null
    for (const l of listeners) l()
}
/** Alt+Shift+M: off → on at the scene's own exposure (keeping any URL parameters); on → off. */
export const toggleMeasureRequest = () => {
    const fromUrl = typeof window !== 'undefined' ? parseMeasureParams(`${window.location?.search || ''}&measure`) : null
    setMeasureRequest(request ? null : fromUrl || { ev100: null, sceneScale: null, bounce: false, scene: null })
}

// ---- per renderer: the mode in force (HdrBloom and the glare veil read it) -------------------
const active = new WeakMap()
export const setMeasurementActive = (gl, measurement) => {
    if (!gl) return
    if (measurement) active.set(gl, measurement)
    else active.delete(gl)
}
export const measurementOf = (gl) => (gl ? active.get(gl) || null : null)
export const isMeasuring = (gl) => Boolean(measurementOf(gl))
