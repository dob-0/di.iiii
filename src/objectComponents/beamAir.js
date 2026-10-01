// THE BEAM IN HAZE, PHYSICALLY — the light a spot's beam scatters toward the eye,
// in the same photometric units the room's lit surfaces are drawn in, so ONE
// exposure (the camera's) decides how both read. Used when the document carries
// an atmosphere (`renderSettings.atmosphere`); without one the cone keeps its old
// flat, additive drawing (spotBeam.js) and no room published before this changes.
//
// The model (docs/architecture/RIG_BUILD.md §20) is single scattering in a
// homogeneous participating medium — the model real-time engines use for
// volumetric lights (S. Hillaire, "Physically Based and Unified Volumetric
// Rendering in Frostbite", SIGGRAPH 2015 course; B. Wronski, "Volumetric Fog",
// SIGGRAPH 2014): the radiance added along a view ray is
//
//     L = ∫ σs · p(θ) · E(s) · T ds
//
//   σs    the haze's scattering coefficient, 1/m (renderSettings.atmosphere.scattering)
//   p(θ)  the Henyey–Greenstein phase function (Henyey & Greenstein, ApJ 93, 1941),
//         asymmetry g (atmosphere.anisotropy): haze droplets scatter mostly FORWARD,
//         which is why a beam blazes when you look back up it toward the lamp
//   E(s)  the illuminance in the beam s metres from the lens (below)
//   T     Beer–Lambert transmittance, exp(−σt · (s + distance to the eye)), σt = σs
//         (a glycol/oil haze absorbs almost nothing: single-scattering albedo ≈ 1)
//
// E(s): three.js takes a SpotLight's intensity I in candela and lights surfaces
// with I/d² (inverse-square from a POINT at the lens). A real beam leaves a lens
// of radius a already that wide, so near the fixture a point source overstates it
// without bound. Here the beam's own flux is kept in a cone of radius a + s·tanθ —
// a virtual point source a/tanθ behind the lens:
//
//     E(s) = I · tan²θ / (a + s·tanθ)²     (→ I/s² far from the lens; a = 0 IS three.js's law)
//
// Limits, stated: the medium is uniform (no hazer plume, no drift); one bounce
// (no multiple scattering — the soft glow between beams in a thick haze is not
// here); surfaces are not dimmed by the haze (the room's fog does that, its own
// way); the beam is not cut by what stands in it (a beam through the DJ lights the
// air behind him too) — it ends where the lamp's throw ends, and the depth test
// hides what is behind a wall or the floor. Additive blending of a tone-mapped
// beam over a tone-mapped room is the forward renderer's approximation of mapping
// their sum (no HDR buffer: the EffectComposer goes black in WebXR).
//
// This file is the arithmetic in plain JS — the shader (beamAirMaterial.js) is
// the same formulas, and the tests here pin them.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const finite = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// A lamp that does not say how wide its lens is: 5 cm radius (a 100 mm front lens —
// the order of a PAR's LED array or a small spot). The B380F-class beam's 160 mm
// lens is written on its lamps (beam.aperture) by the rig.
export const DEFAULT_APERTURE = 0.05
// Samples along the chord through the beam. The integrand is smooth across a beam
// seen side-on; looking up a beam it is steep near the lens, and a per-pixel jitter
// turns the remaining error into fine grain instead of bands.
export const BEAM_AIR_SAMPLES = 12

// The hull the beam is drawn on: its own radius plus this margin (metres) for the glare.
export const HULL_BASE = 1.2
export const HULL_SLOPE = 0.12

/**
 * The haze's optics from `renderSettings.atmosphere`, or null (the old cone). `haze`
 * (hazeField.js hazeSettingsOf) is passed through: a room that works its haze out from
 * its machines. Such a room needs no hand-set scattering — the 0.03 kept here is only
 * what a beam draws with before the machines have arrived.
 */
export const atmosphereOf = (renderSettings) => {
    const a = renderSettings?.atmosphere
    if (!a || typeof a !== 'object') return null
    const haze = a.haze && typeof a.haze === 'object' ? a.haze : null
    const scattering = Number(a.scattering)
    if (!(scattering > 0) && !haze) return null
    return {
        scattering: scattering > 0 ? clamp(scattering, 0, 1) : 0.03,
        anisotropy: clamp(finite(a.anisotropy, 0.7), -0.95, 0.95),
        haze
    }
}

// THE BEAM'S CROSS-SECTION — how a real fixture's intensity falls off across its beam.
// A photometric beam angle is where the intensity is 50 % of the centre's, the field
// angle where it is 10 % (ANSI/IES; every maker's "beam / field" pair). The lamp's
// three.js `angle` is the BEAM half-angle; the light goes on past it, softly. The shape:
//
//     I(ρ) / I(0) = exp(−ln2 · ρ^p)       ρ = r / (beam radius at that distance)
//
// p = 2 is a Gaussian (a wash: field ≈ 1.8 × beam); a larger p is a beam fixture's
// steep-shouldered rod (p = 8: field ≈ 1.2 × beam). `edge` (the lamp's penumbra, 0..1)
// picks it: hard edge → p 8, soft → p 2. Until 2026-10-01 the profile was a flat top
// with a short smoothstep edge — every beam read as a solid bar that the exposure
// clipped to flat white; a real beam's core clips but its shoulders keep the colour
// and show the haze's grain.
export const PROFILE_FLOOR = 0.02 // the hull ends where the beam has fallen to 2 %
export const beamProfileExponent = (edge) => 2 + 6 * (1 - clamp(finite(edge, 0.2), 0, 1))
export const beamProfileAt = (rho, p) => Math.exp(-Math.LN2 * Math.abs(rho) ** p)
export const beamProfile = (rho, edge) => beamProfileAt(rho, beamProfileExponent(edge))
/** How far out (in beam radii) the light is drawn: where the profile reaches PROFILE_FLOOR. */
export const beamExtentOf = (p) => (Math.log(1 / PROFILE_FLOOR) / Math.LN2) ** (1 / p)
export const beamExtent = (edge) => beamExtentOf(beamProfileExponent(edge))

/** Henyey–Greenstein phase function, 1/sr; integrates to 1 over the sphere. */
export const hgPhase = (cosTheta, g) => {
    const g2 = g * g
    const denom = Math.max(1 + g2 - 2 * g * cosTheta, 1e-6)
    return (1 - g2) / (4 * Math.PI * denom ** 1.5)
}

/** Illuminance in the beam s metres from the lens (virtual-source model above). */
export const beamIlluminance = (candela, s, aperture, tanHalf) => {
    const t = Math.max(tanHalf, 1e-4)
    const r = aperture + Math.max(s, 0) * t
    return r > 0 ? (candela * t * t) / (r * r) : candela / Math.max(s * s, 1e-6)
}

/**
 * Where a ray is inside the beam: the interval of λ (ray = ro + rd·λ, rd unit) inside
 * the truncated cone of radius a + s·tanθ, s = −y from the lens at the origin down
 * to the throw L — clipped to λ ≥ 0. Null when the ray misses it.
 */
export const beamChord = (ro, rd, { aperture: a, tanHalf: t, length: L }) => {
    const c0 = a - ro[1] * t
    const c1 = -rd[1] * t
    const A = rd[0] * rd[0] + rd[2] * rd[2] - c1 * c1
    const B = 2 * (ro[0] * rd[0] + ro[2] * rd[2] - c0 * c1)
    const C = ro[0] * ro[0] + ro[2] * ro[2] - c0 * c0
    // The slab between the lens (y = 0) and the end of the throw (y = −L).
    let s0 = -Infinity
    let s1 = Infinity
    if (Math.abs(rd[1]) < 1e-9) {
        if (ro[1] > 0 || ro[1] < -L) return null
    } else {
        const ta = -ro[1] / rd[1]
        const tb = (-L - ro[1]) / rd[1]
        s0 = Math.min(ta, tb)
        s1 = Math.max(ta, tb)
    }
    let e0
    let e1
    const disc = B * B - 4 * A * C
    if (Math.abs(A) < 1e-12) {
        if (Math.abs(B) < 1e-12) {
            if (C >= 0) return null
            e0 = -Infinity
            e1 = Infinity
        } else if (B > 0) {
            e0 = -Infinity
            e1 = -C / B
        } else {
            e0 = -C / B
            e1 = Infinity
        }
    } else if (disc < 0) {
        if (A > 0) return null
        e0 = -Infinity
        e1 = Infinity
    } else {
        const sq = Math.sqrt(disc)
        const lo = Math.min((-B - sq) / (2 * A), (-B + sq) / (2 * A))
        const hi = Math.max((-B - sq) / (2 * A), (-B + sq) / (2 * A))
        if (A > 0) {
            e0 = lo
            e1 = hi
        } else {
            // Inside = outside the roots; the other nappe lies behind the lens
            // (y > 0), outside the slab, so the piece that meets the slab is ours.
            const first = Math.min(s1, lo) - s0
            const second = s1 - Math.max(s0, hi)
            if (first >= second) {
                e0 = -Infinity
                e1 = lo
            } else {
                e0 = hi
                e1 = Infinity
            }
        }
    }
    const from = Math.max(s0, e0, 0)
    const to = Math.min(s1, e1)
    return to > from ? [from, to] : null
}

/**
 * The radiance the beam adds along one view ray — the shader's sum, in JS.
 * Returns cd/m² in the scene's units (the lamp's `intensity` × the same factors),
 * before the lamp's colour and the camera's exposure.
 * `sigmaAt(p)` — the haze's scattering at a point of the beam's frame (a haze field,
 * hazeField.js); absent, the haze is `scattering` everywhere. The transmittance uses
 * `scattering` (the hall's well-mixed haze) either way, as the shader does.
 */
export const beamAirRadiance = (ro, rd, { candela, aperture = DEFAULT_APERTURE, tanHalf, length, edge = 0.2, scattering, anisotropy, samples = BEAM_AIR_SAMPLES, sigmaAt = null }) => {
    // the light reaches past the beam angle (beamProfile): the chord through its extent
    const k = beamExtent(edge)
    const chord = beamChord(ro, rd, { aperture: aperture * k, tanHalf: tanHalf * k, length })
    if (!chord) return 0
    const [la, lb] = chord
    const dl = (lb - la) / samples
    const apexY = aperture / Math.max(tanHalf, 1e-4)
    let sum = 0
    for (let i = 0; i < samples; i += 1) {
        const lam = la + (i + 0.5) * dl
        const p = [ro[0] + rd[0] * lam, ro[1] + rd[1] * lam, ro[2] + rd[2] * lam]
        const s = Math.max(-p[1], 0)
        const R = aperture + s * tanHalf
        const rho = Math.hypot(p[0], p[2]) / Math.max(R, 1e-6)
        const profile = beamProfile(rho, edge)
        const wi = [p[0], p[1] - apexY, p[2]]
        const wl = Math.hypot(...wi) || 1
        const cosTheta = -(wi[0] * rd[0] + wi[1] * rd[1] + wi[2] * rd[2]) / wl
        const T = Math.exp(-scattering * (s + lam))
        const sigma = sigmaAt ? sigmaAt(p) : scattering
        sum += sigma * beamIlluminance(candela, s, aperture, tanHalf) * profile * hgPhase(cosTheta, anisotropy) * T
    }
    return sum * dl
}
