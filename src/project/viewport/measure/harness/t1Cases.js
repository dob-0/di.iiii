// T1 — the analytical check of the measurement chain (simulation-method.md §3.3 T1), as data.
// Pure: the harness page (t1.jsx) builds these scenes and reads the probes; the runner
// (scripts/measure/t1-gpu.cjs) and the unit test (t1Cases.test.js) check the same numbers.
//
// The reference is the inverse-square and cosine law for a point source (IES/CIE; CIE 171:2006
// test case 5 is the same law on a plane): E = I(θ) · cos(i) / r².
//   - a lamp of I = 30 500 cd (the UP-PL5403's EQUIVALENT on-axis candela, fixtures.json) hangs
//     10 m above a plane, pointing straight down; sceneScale 0.02 as in the MOXIR rig;
//   - on axis: E = I / d² = 305 lx;
//   - the cosine law at the same point, the patch tilted 30° and 60°: E = I·cos(i) / d²;
//   - off axis on the plane at 30° and 60°: r = d / cos θ, i = θ → E = I·cos³θ / d²;
//   - the rig's fitted cone (spotBeam.js spotLightCone) puts 50 % of the axial intensity at the
//     beam half-angle: E = 0.5·I·cos³θ½ / d².
// Tolerance 1 % (§3.3: "analytical"). The beam-profile self-check (case 'beam') is the drawn
// beam's OWN model, not physics: for a Gaussian profile (edge 1 → exponent 2, beamAir.js) the
// side-on luminance's full width at half maximum is the beam's diameter 2·(a + d·tan θ½);
// tolerance 5 % (chosen: the pixel pitch and the haze transmittance across the beam).
// The CONTROL reads the 60° off-axis point with the mode off: the work light (#a39c92 at 0.1,
// luminance 0.034 scene units = 1.7 lx) is then in the reading, +4.5 % on 38.1 lx, and it must fail.
// (On axis it is only +0.54 % of 305 lx — inside 1 %, so the axis point cannot be the control.)
export const T1_DISTANCE_M = 10
export const T1_CANDELA = 30500
export const T1_SCENE_SCALE = 0.02
export const T1_TOLERANCE = 0.01
export const BEAM_TOLERANCE = 0.05
const DEG = Math.PI / 180

const tilt = (deg) => [0, Math.cos(deg * DEG), Math.sin(deg * DEG)] // up, tilted toward +z
const E0 = T1_CANDELA / T1_DISTANCE_M ** 2

/** The lamp of the wide case: three's cutoff at 85°, penumbra 0.05 → full intensity to ~80.75°. */
export const WIDE_LAMP = { angle: 85 * DEG, penumbra: 0.05, fitted: false }
/** The rig's PAR as the rig hangs it: half its 25° beam, penumbra 0.5, fitted (spotBeam.js). */
export const FITTED_LAMP = { angle: 12.5 * DEG, penumbra: 0.5, fitted: true }
/** A narrow beam in haze for the profile self-check: 4° beam, soft (Gaussian) edge. */
// `distance` 40: a lamp with distance 0 (three's "no limit", the physical choice) draws its beam
// in air only UNLIMITED_THROW = 20 m long (spotBeam.js) — found by this check on 2026-10-09,
// when the 20 m profile read zero. The beam case sets a 40 m throw so 20 m is mid-beam; it
// reads no illuminance, so three's cutoff window on the light does not enter it.
export const BEAM_LAMP = { angle: 2 * DEG, penumbra: 1, fitted: false, height: 45, aperture: 0.05, distance: 40 }
export const BEAM_ATMOSPHERE = { scattering: 0.02, anisotropy: 0.7 }
export const BEAM_DISTANCES = [3, 10, 20]

export const beamRadiusAt = (d) => BEAM_LAMP.aperture + d * Math.tan(BEAM_LAMP.angle)

export const T1_CASES = [
    {
        id: 'wide',
        lamp: WIDE_LAMP,
        probes: [
            { name: 'axis', position: [0, 0, 0], normal: [0, 1, 0], expected: E0, law: 'E = I/d²' },
            { name: 'tilt-30', position: [0, 0, 0], normal: tilt(30), expected: E0 * Math.cos(30 * DEG), law: 'E = I·cos(30°)/d²' },
            { name: 'tilt-60', position: [0, 0, 0], normal: tilt(60), expected: E0 * Math.cos(60 * DEG), law: 'E = I·cos(60°)/d²' },
            { name: 'off-axis-30', position: [T1_DISTANCE_M * Math.tan(30 * DEG), 0, 0], normal: [0, 1, 0], expected: E0 * Math.cos(30 * DEG) ** 3, law: 'E = I·cos³(30°)/d²' },
            { name: 'off-axis-60', position: [T1_DISTANCE_M * Math.tan(60 * DEG), 0, 0], normal: [0, 1, 0], expected: E0 * Math.cos(60 * DEG) ** 3, law: 'E = I·cos³(60°)/d²' }
        ]
    },
    {
        id: 'fitted',
        lamp: FITTED_LAMP,
        probes: [
            { name: 'fitted-axis', position: [0, 0, 0], normal: [0, 1, 0], expected: E0, law: 'E = I/d²' },
            {
                name: 'fitted-half-angle',
                position: [T1_DISTANCE_M * Math.tan(12.5 * DEG), 0, 0],
                normal: [0, 1, 0],
                expected: 0.5 * E0 * Math.cos(12.5 * DEG) ** 3,
                law: 'E = 0.5·I·cos³(12.5°)/d² (50 % at the beam half-angle)'
            }
        ]
    }
]

/** The probe the control reads (see the header). */
export const CONTROL_PROBE = 'off-axis-60'

/** Check one reading against its case. */
export const checkReading = (expected, measured, tolerance = T1_TOLERANCE) => {
    if (!Number.isFinite(measured)) return { expected, measured, error: null, pass: false }
    const error = (measured - expected) / expected
    return { expected, measured, error, pass: Math.abs(error) <= tolerance }
}
