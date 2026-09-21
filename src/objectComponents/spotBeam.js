// THE BEAM IN THE AIR — the shape of the cone a lamp puts into the haze.
//
// A real spot in a real room is visible before it lands on anything: the haze
// in the air lights up along the throw. di.iiii drew only the pool, so a rig
// aimed in the Studio gave no sense of where the light was going until you
// walked to the wall it hit. This is the arithmetic for the cheap version of
// that -- one translucent, additively blended cone, no post-processing (the
// EffectComposer goes black in WebXR, so volumetrics are not on the table).
//
// Pure on purpose: no three import, so the shape can be reasoned about and
// tested without a WebGL context, exactly like spotLightAim.js.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const finite = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// three.js reads distance 0 as "no limit", which is not a length anything can
// be drawn at. A beam has to stop somewhere, so an unlimited lamp gets the
// throw of the default lamp.
export const UNLIMITED_THROW = 20
// Haze when a beam is switched on and nobody has said how thick the air is.
export const DEFAULT_HAZE = 0.4
// What a haze of 1 at the default intensity comes out as. Additive blending
// piles up where the cone is seen edge-on and through its far side, so the flat
// opacity stays low: above roughly 0.3 the cone reads as a solid plastic shape
// sitting in the room rather than as light in the air.
const HAZE_TO_OPACITY = 0.35
const MAX_OPACITY = 0.5

/**
 * The cone that stands for a spot light's throw.
 *
 * @param {object} spot
 * @param {number} [spot.distance] the lamp's reach, metres (0 = unlimited)
 * @param {number} [spot.angle] the spot's HALF angle, radians (three.js's own)
 * @param {number} [spot.intensity] the lamp's intensity
 * @param {number} [spot.haze] 0..1, how much of the throw the air shows
 * @returns {{ length: number, radius: number, opacity: number, position: [number, number, number] }}
 *   `length` down local -Y from the lamp, `radius` at the far end, and the cone
 *   mesh's centre — a three.js cone is built around its own middle with the tip
 *   at +Y, so sliding it half a length down puts the tip at the lamp and opens
 *   it along the same -Y the light itself is aimed down (spotLightAim.js).
 */
export const spotBeamShape = ({ distance, angle, intensity, haze } = {}) => {
    const reach = finite(distance, UNLIMITED_THROW)
    const length = reach > 0 ? Math.min(reach, 400) : UNLIMITED_THROW
    const half = clamp(finite(angle, 0.52), 0.01, Math.PI / 2 - 0.01)
    const radius = Math.tan(half) * length
    const level = clamp(finite(intensity, 2) / 2, 0, 2)
    const opacity = clamp(clamp(finite(haze, DEFAULT_HAZE), 0, 1) * HAZE_TO_OPACITY * level, 0, MAX_OPACITY)
    return { length, radius, opacity, position: [0, -length / 2, 0] }
}

/**
 * Is there a beam to draw at all? Absent `components.beam` means no — every
 * room published before this existed keeps the air it had.
 */
export const beamIsVisible = (beam) => beam?.visible === true
