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
// What a haze of 1 comes out as. Additive blending piles up where the cone is
// seen edge-on and through its far side, so the flat opacity stays low: the
// first version of this used 0.35 and a bright lamp, and the screenshot showed
// two solid plastic cones standing in the room. Looked at, then lowered.
const HAZE_TO_OPACITY = 0.16
const MAX_OPACITY = 0.28
// How hard the lamp is driven counts, but gently and only downward: a lamp at
// intensity 14 is not seven times as hazy as one at 2, it is the same air.
// Below the default it fades out, and a lamp the desk holds at 0 shows nothing.
const FULL_INTENSITY = 2

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
    const level = clamp(finite(intensity, FULL_INTENSITY) / FULL_INTENSITY, 0, 1)
    const opacity = clamp(clamp(finite(haze, DEFAULT_HAZE), 0, 1) * HAZE_TO_OPACITY * level, 0, MAX_OPACITY)
    return { length, radius, opacity, position: [0, -length / 2, 0] }
}

// How bright the air is along the throw: full at the lamp, nearly gone at the
// far end. A cone of one flat colour reads as a plastic object; light in air
// falls off. Fed to the cone as vertex colours, which an additively blended
// basic material multiplies by the lamp's colour -- no shader, no post pass
// (the EffectComposer goes black in WebXR), and it survives a phone.
export const BEAM_FADE_AT_MOUTH = 0.12

/**
 * The fade at a point on the cone, from its own local Y.
 *
 * @param {number} y local Y, +length/2 at the lamp and -length/2 at the mouth
 * @param {number} length the throw
 */
export const beamFadeAt = (y, length) => {
    const reach = length > 0 ? length : 1
    const along = clamp((reach / 2 - finite(y, 0)) / reach, 0, 1)
    return BEAM_FADE_AT_MOUTH + (1 - BEAM_FADE_AT_MOUTH) * Math.pow(1 - along, 1.6)
}

/**
 * Vertex colours for a cone geometry's positions, greyscale, so the lamp's own
 * colour comes through the material.
 *
 * @param {ArrayLike<number>} positions the geometry's position attribute array
 * @param {number} length the throw
 * @returns {Float32Array} three floats per vertex
 */
export const beamFadeColors = (positions, length) => {
    const count = Math.floor((positions?.length || 0) / 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
        const fade = beamFadeAt(positions[i * 3 + 1], length)
        colors[i * 3] = fade
        colors[i * 3 + 1] = fade
        colors[i * 3 + 2] = fade
    }
    return colors
}

/**
 * Is there a beam to draw at all? Absent `components.beam` means no — every
 * room published before this existed keeps the air it had.
 */
export const beamIsVisible = (beam) => beam?.visible === true

/**
 * Does this lamp put real light into the room? Yes, unless its beam is drawn
 * AND marked `only` — the cone in the air with no three.js light behind it.
 *
 * Why it exists: every real SpotLight is a term in the shader of every lit
 * pixel, and on top of that a shadow map each when shadows are on. A rig of
 * 90 heads cannot run as 90 real lights (measured on MOXIR, 2026-09-27 —
 * scripts/place/README.md, "The rig"), and a phone's WebGL refuses to compile
 * a shader with that many at all. `only` lets a whole rig hang, every beam
 * visible, while a chosen budget of lamps actually lights the room.
 *
 * An invisible beam marked `only` still casts: `only` is a statement about
 * the beam, and a lamp with no beam and no light would be nothing at all.
 */
export const beamCastsLight = (beam) => !(beamIsVisible(beam) && beam?.only === true)

/**
 * THE FIELD ANGLE OF A RIG LAMP. A photometric beam angle is the 50 % point, the field angle the 10 %
 * point (ANSI E1.9, CIE). Neither UPlight unit publishes a field angle (fixtures.json field_deg: UNKNOWN),
 * so the field/beam RATIO is the class equivalent's, read from its maker's goniophotometer report:
 *   a wash (penumbra ≥ WASH_PENUMBRA_FROM): Chauvet COLORdash Par H18X, white: 23.7° / 38.4° → 1.62
 *     (es.chauvetprofessional.com …/COLORdash-Par-H18X_Photometrics-Report.pdf, read 2026-10-09)
 *   a beam: Elation Proteus Excalibur: 0.8° / 1.6° (cutoff 2° at 2.5 %) → 2.0
 *     (goknight.com …/PROTEUS EXCALIBUR Photometrics Report.pdf, read 2026-10-09)
 * EQUIVALENT, not the units' own; replace with the measured ratio when there is one.
 */
export const WASH_PENUMBRA_FROM = 0.3
export const WASH_FIELD_RATIO = 38.4 / 23.7
export const BEAM_FIELD_RATIO = 1.6 / 0.8
export const fieldRatioOf = (penumbra) => ((Number(penumbra) || 0) >= WASH_PENUMBRA_FROM ? WASH_FIELD_RATIO : BEAM_FIELD_RATIO)

/**
 * The beam profile I(θ)/I(0) = exp(−ln2·(θ/β)^p) (beamAir.js) through the 50 % point at β and the 10 %
 * point at ratio·β: p = ln(ln10 / ln2) / ln(ratio). (Checked against the Excalibur report: p = 1.73
 * puts its 2.5 % point at 2.6 β; the report says 2.5 β.)
 */
export const profileExponentForRatio = (ratio) => Math.log(Math.log(10) / Math.LN2) / Math.log(Math.max(Number(ratio) || 1.62, 1.01))

/** The `edge` the beam-in-air shader takes for an exponent p (beamAir.js beamProfileExponent: p = 2 + 6·(1 − edge)). */
export const edgeForExponent = (p) => 1 - (p - 2) / 6

/**
 * The real light of a RIG lamp (MOXIR simulation audit §2.2, 2026-10-09). A rig lamp's `angle` is half
 * its BEAM angle — the 50 % point. three.js's falloff is smoothstep(cos cutoff, cos(cutoff·(1 − penumbra)),
 * cos θ): even at its softest (penumbra 1) its 10 % point sits 1.27× the 50 % point, short of the 1.62
 * (wash) and 2.0 (beam) the equivalents measure. A WebGL light cannot take a candela curve without a
 * shader of its own per lamp (a ceiling of three r186's WebGL lights; WebGPU has IESSpotLight), so the
 * fit is the one that keeps the light's FLUX: penumbra 1, and the cutoff C for which three's cone
 * carries the same lumens as the profile above at the same peak candela. For a smoothstep in cos θ
 * the flux is π·I·(1 − cos C) (its integral over [cos C, 1] is (1 − cos C)/2), so
 *     1 − cos C = 2 · ∫₀^{π/2} exp(−ln2·(θ/β)^p) · sin θ dθ.
 * What this keeps: the peak (cd) and the lumens in the beam, so the light ON the surfaces in total.
 * What it does not: the exact 50 % and 10 % points of the pool (fieldFitError says by how much).
 * Only for lamps that carry `components.fixture`: an authored spot's angle IS its cutoff.
 */
const profileFlux = (beta, p) => {
    // ∫ exp(−ln2·(θ/β)^p) sin θ dθ, θ to where the profile is 1e-6, midpoint rule
    const top = Math.min(Math.PI / 2, beta * (Math.log(1e6) / Math.LN2) ** (1 / p))
    const n = 2000
    let sum = 0
    for (let i = 0; i < n; i += 1) {
        const t = ((i + 0.5) / n) * top
        sum += Math.exp(-Math.LN2 * (t / beta) ** p) * Math.sin(t)
    }
    return (sum * top) / n
}
export const spotLightCone = ({ angle, penumbra, fieldRatio } = {}) => {
    const half = Math.min(Math.PI / 2 - 1e-3, Math.max(1e-4, Number(angle) || 0.52))
    const ratio = Number(fieldRatio) > 1 ? Number(fieldRatio) : fieldRatioOf(penumbra)
    const p = profileExponentForRatio(ratio)
    const oneMinusCos = Math.min(1, 2 * profileFlux(half, p))
    return { angle: Math.acos(1 - oneMinusCos), penumbra: 1 }
}

/**
 * Does this spot entity carry the light of a RIG lamp, so that its `angle` is half the lamp's BEAM angle (the 50 % point) and
 * its real light is fitted with spotLightCone? A rig lamp says so itself: it carries `components.fixture`. A light-pool slot
 * (rigbuild/lightPool.js) draws the light of the lamp it holds and says so with `components.lightPool.fitted`. It must NOT
 * carry the fixture itself: every reader of `components.fixture` (the lamps' bodies, the patch, the haze machines) would count
 * the slot as a second lamp. Both renderers (LiveProjectScene, EntityContent) ask here. Before 2026-10-09 they asked only for
 * the fixture, so Lite's slot reached three with the raw half-beam angle as its cutoff: half the lumens of the same lamp in Full.
 */
export const lampIsFitted = (components) => Boolean(components?.fixture) || components?.lightPool?.fitted === true
