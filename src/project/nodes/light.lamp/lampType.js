// THE LAMP'S TYPE — what a Lamp node reads from the fixture library, and the picture it draws from it.
//
// The type comes from di.iiii's one fixture library (src/rigbuild/types/library/, generated from the sourced
// charts in scripts/place/fixtures/ by scripts/rigbuild/types.mjs): its modes (each a footprint and, where a
// source gives one, a channel list), its pan/tilt range, its beam angle and its size. A Lamp with no type is a
// lamp nobody has named yet: it draws, with the ranges below, and sends nothing.
//
// Pure on purpose — no three, no React — so the picture can be tested without a WebGL context.

// The per-type files, not the whole-library file (dev's guard, projectTypes.test.js "who may import the whole
// library": the Studio's tool surfaces only). Eager, because the Lamp's runtime reads its type synchronously.
const TYPE_FILES = import.meta.glob(['../../../rigbuild/types/library/*.json', '!../../../rigbuild/types/library/index.json', '!../../../rigbuild/types/library/all.json'], { eager: true, import: 'default' })
const TYPE_LIBRARY = { types: Object.values(TYPE_FILES) }
import { modeOf, typeById } from '../../../rigbuild/fixtureTypes.js'

// A Lamp with no type: a moving head's range, 540° pan and 270° tilt (what the library's moving heads publish:
// up-b380f and up-250bsw, pan_tilt_deg), a 25° beam that Zoom opens from 10° to 50°, and a 0.3 m body.
export const UNTYPED_PAN_TILT_DEG = [540, 270]
export const UNTYPED_BEAM_DEG = 25
export const UNTYPED_ZOOM_DEG = [10, 50]
export const UNTYPED_SIZE_M = [0.3, 0.3, 0.35]
// The light's intensity at a full dimmer: light.point's own default, so a Lamp at full is as bright as a Light.
export const FULL_INTENSITY = 6

const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback)
const unit = (value, fallback) => Math.max(0, Math.min(1, finite(value, fallback)))
const DEG = Math.PI / 180

export const lampTypes = () => TYPE_LIBRARY.types

export const lampTypeOf = (id) => {
    const want = typeof id === 'string' ? id.trim() : ''
    return want ? typeById(TYPE_LIBRARY, want) : null
}

// The mode asked for, else the type's default, else its first.
export const lampModeOf = (type, name) => {
    if (!type) return null
    const want = typeof name === 'string' ? name.trim() : ''
    return (want && modeOf(type, want)) || modeOf(type, type.defaultMode) || (type.modes || [])[0] || null
}

const hasRgb = (mode) => ['r', 'g', 'b'].every((role) => (mode?.channels || []).some((c) => c?.role === role))

/**
 * What the Lamp looks like in the scene, from its type and what it is told (0 … 1 wires, a colour).
 * The beam hangs down local -Y at home (pan and tilt 0.5); `pan` turns about Y, `tilt` about X.
 *
 * @returns {{ size: number[], pan: number, tilt: number, angle: number, intensity: number, color: string, fitted: boolean }}
 *   `angle` is the spot's HALF angle in radians (three.js's own); `fitted` says it is a published beam angle
 *   (spotBeam.js spotLightCone fits the real light to it).
 */
export const lampPicture = (type, mode, told = {}) => {
    const panTilt = type ? type.pan_tilt_deg?.value : UNTYPED_PAN_TILT_DEG
    const [panDeg, tiltDeg] = Array.isArray(panTilt) ? panTilt : [0, 0]
    const zoomRange = type ? type.optics?.zoom_deg : UNTYPED_ZOOM_DEG
    const zoom = told.zoom === undefined || told.zoom === null ? null : unit(told.zoom, 0)
    let beamDeg = type ? finite(type.optics?.beam_deg, UNTYPED_BEAM_DEG) : UNTYPED_BEAM_DEG
    if (zoom !== null && Array.isArray(zoomRange) && zoomRange.length === 2) {
        beamDeg = finite(zoomRange[0], beamDeg) + (finite(zoomRange[1], beamDeg) - finite(zoomRange[0], beamDeg)) * zoom
    }
    const sizeMm = type?.size_mm?.value
    const size = Array.isArray(sizeMm) && sizeMm.length === 3 && sizeMm.every((v) => Number(v) > 0)
        ? sizeMm.map((v) => Number(v) / 1000) : UNTYPED_SIZE_M
    // A typed lamp whose mode has no red, green and blue channels cannot take a colour over DMX (a colour WHEEL
    // is not driven), so its picture stays white rather than showing a colour it would never send.
    const color = !type || hasRgb(mode) ? (typeof told.color === 'string' && told.color ? told.color : '#ffffff') : '#ffffff'
    return {
        size,
        pan: (unit(told.pan, 0.5) - 0.5) * panDeg * DEG,
        tilt: (unit(told.tilt, 0.5) - 0.5) * tiltDeg * DEG,
        angle: Math.max(0.5, beamDeg) / 2 * DEG,
        intensity: unit(told.dimmer, 1) * FULL_INTENSITY,
        color,
        fitted: Boolean(type && Number(type.optics?.beam_deg) > 0),
    }
}
