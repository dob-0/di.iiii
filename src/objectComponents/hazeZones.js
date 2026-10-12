// ONE MACHINE IN A BIG HALL — the near-field / far-field (two-zone) estimate of the haze, for a room
// whose haze is worked out from its machines with `atmosphere.haze.model: 'nf-ff'` (MOXIR Known · kit,
// 2026-10-09). An UNVALIDATED ESTIMATE: every input below is published for an equivalent machine or
// assumed, and nothing has been measured in the place (no measuring kit, owner 2026-10-09).
//
// THE METHOD: the two-zone model of industrial hygiene (M. Nicas, "Estimating exposure intensity in an
// imperfectly mixed room", AIHA Journal 57:542-550, 1996; AIHA, "Mathematical Models for Estimating
// Occupational Exposure to Chemicals", 2nd ed. 2009, ch. 6). The air near the source (the NEAR FIELD,
// volume V_N) exchanges air with the rest of the room (the FAR FIELD, V_F = V − V_N) at a rate β; the room
// is ventilated at Q; here a first-order loss k (the fog drying out, hazeField.js dryTau_min) acts in both.
// With the droplet mass G (g/min) released in the near field:
//
//     V_N·dC_N/dt = G + β·C_F − β·C_N − k·V_N·C_N
//     V_F·dC_F/dt = β·C_N − β·C_F − Q·C_F − k·V_F·C_F
//
// a linear system solved exactly (two real negative eigenvalues), from clean air at t = 0. The near field
// is a hemisphere of radius r on the floor around the nozzle; its interzonal flow is β = ½·FSA·s with FSA
// = 2πr² its free surface and s the random air speed there (Nicas 1996).
//
// Extinction from mass: σ = ε·C, ε = 3·Q_ext/(2·ρ·D) (hazeField.js massExtinction: anomalous
// diffraction, van de Hulst 1957).
//
// HOW THE ROOM DRAWS IT (hazeField.js buildHazeField): the far field is the hall's well-mixed haze (the
// fill, everywhere). The near field's EXCESS mass (C_N − C_F)·V_N is drawn in two parts: the machine's jet
// as the round-jet law gives it (Pope 2000; hazeField.js jetOf, unscaled), and the REST of the excess as a
// smooth hemisphere of radius r around the nozzle (nearBlobOf) — so the haze within r holds exactly the zone
// model's mass. (Scaling the jet instead was tried on paper: it needs ×21 for the kit's machine, a 400 /m
// column — not credible.) No calibration to photographs.

import { dropletMassFlow, jetOf, jetScattering, massExtinction } from './hazeField.js'

const num = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// ASSUMED: the near field — a 3 m hemisphere (about the reach of a fog machine's jet, hazeField.js
// reach_m 4) and a random air speed of 0.1 m/s (a still hall; Nicas uses the measured speed — none here).
export const DEFAULT_NEAR_FIELD = { radius_m: 3, airSpeed_m_s: 0.1 }

/** The near field's volume (m³), free surface (m²) and interzonal flow β (m³/min). */
export const nearFieldOf = (nf = DEFAULT_NEAR_FIELD) => {
    const r = Math.max(num(nf?.radius_m, DEFAULT_NEAR_FIELD.radius_m), 0.1)
    const s = Math.max(num(nf?.airSpeed_m_s, DEFAULT_NEAR_FIELD.airSpeed_m_s), 0.001)
    const volume = (2 / 3) * Math.PI * r ** 3
    const surface = 2 * Math.PI * r * r
    return { radius_m: r, volume_m3: volume, surface_m2: surface, beta_m3_min: 0.5 * surface * s * 60 }
}

/**
 * The two-zone concentrations, g/m³: { near, far } at `minutes` after the source started (null: steady
 * state), plus the far field's slow time constant (min). G g/min, volumes m³, β and Q m³/min, k 1/min.
 */
export const twoZone = ({ G, V, VN, beta, Q, k = 0, minutes = null }) => {
    const VF = Math.max(V - VN, 1)
    const a = -(beta + k * VN) / VN
    const b = beta / VN
    const c = beta / VF
    const d = -(beta + Q + k * VF) / VF
    // steady state: A·C + g = 0, g = [G/VN, 0]
    const det = a * d - b * c
    const nearSS = (-(G / VN) * d) / det
    const farSS = ((G / VN) * c) / det
    // eigenvalues of A (real: A is similar to a symmetric matrix)
    const tr = a + d
    const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0))
    const l1 = tr / 2 + disc // the slow one (closer to 0)
    const l2 = tr / 2 - disc
    const tauFar = -1 / l1
    if (minutes == null) return { near: nearSS, far: farSS, tauFar_min: tauFar }
    const t = Math.max(num(minutes, 0), 0)
    // C(t) = Css − e^{At}·Css; e^{At} = (e^{l1 t}(A − l2 I) − e^{l2 t}(A − l1 I)) / (l1 − l2)
    const e1 = Math.exp(l1 * t)
    const e2 = Math.exp(l2 * t)
    const span = l1 - l2 || 1e-12
    const m = (x, y) => [
        (e1 * ((a - l2) * x + b * y) - e2 * ((a - l1) * x + b * y)) / span,
        (e1 * (c * x + (d - l2) * y) - e2 * (c * x + (d - l1) * y)) / span
    ]
    const [dn, df] = m(nearSS, farSS)
    return { near: Math.max(nearSS - dn, 0), far: Math.max(farSS - df, 0), tauFar_min: tauFar }
}

/** A machine's two-zone haze as scattering, 1/m: { near, far } (zone means) and the inputs used. */
export const machineZones = (machine, hall, minutes = null) => {
    const kind = machine.kind
    const G = dropletMassFlow(kind, machine.fluid_ml_per_min, machine.level)
    const nf = nearFieldOf(hall.nearField)
    const V = Math.max(num(hall.volume_m3, 1), nf.volume_m3 * 2)
    const Q = (Math.max(num(hall.airChangesPerHour, 0), 0) * V) / 60
    const dry = num(kind.dryTau_min, Infinity)
    const k = Number.isFinite(dry) && dry > 0 ? 1 / dry : 0
    const eps = massExtinction(kind.dropletD_um, kind.fluidDensity_g_ml, kind.refractiveIndex)
    const c = twoZone({ G, V, VN: nf.volume_m3, beta: nf.beta_m3_min, Q, k, minutes })
    return { near: c.near * eps, far: c.far * eps, tauFar_min: c.tauFar_min, G_g_min: G, eps_m2_g: eps, nearField: nf, Q_m3_min: Q, k_min: k }
}

/**
 * The jet's excess scattering integrated over the near field (a hemisphere of radius r around the nozzle,
 * the half-space the jet blows into), 1/m·m³ — numerically, on a grid. Pure; JS only, once per field.
 */
export const jetExcessInNearField = (jet, radius, cells = 28) => {
    const h = (2 * radius) / cells
    let sum = 0
    for (let i = 0; i < cells; i += 1) {
        for (let j = 0; j < cells; j += 1) {
            for (let l = 0; l < cells; l += 1) {
                const v = [-radius + (i + 0.5) * h, -radius + (j + 0.5) * h, -radius + (l + 0.5) * h]
                if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] > radius * radius) continue
                sum += jetScattering(jet, v, [0, 0, 1])
            }
        }
    }
    return sum * h * h * h
}

// The blob's edge: full inside 0.8·r, gone past 1.2·r (smoothstep), so it has no hard shell.
export const BLOB_EDGE = [0.8, 1.2]
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** The blob's shape at distance ρ = |v|/r, 0…1. The shader's twin is in beamAirMaterial.js hazeSigma. */
export const blobShape = (rho) => 1 - smoothstep(BLOB_EDGE[0], BLOB_EDGE[1], rho)
/** ∫ blobShape over the upper half-space, in units of r³: (2π/3)·∫…, numerically. */
export const BLOB_VOLUME_R3 = (() => {
    let sum = 0
    const n = 4000
    for (let i = 0; i < n; i += 1) {
        const rho = ((i + 0.5) / n) * BLOB_EDGE[1]
        sum += blobShape(rho) * 2 * Math.PI * rho * rho * (BLOB_EDGE[1] / n)
    }
    return sum
})()

/**
 * The near field's excess beyond what the jet carries, as a blob: { sigma (1/m at its centre), radius }.
 * Mass: σ·BLOB_VOLUME_R3·r³ = (σ_N − σ_F)·V_N − the jet's excess inside r (never below 0).
 */
export const nearBlobOf = (machine, zones) => {
    const r = zones.nearField.radius_m
    const target = Math.max(zones.near - zones.far, 0) * zones.nearField.volume_m3
    const jet = jetOf(machine)
    const inJet = jet.sigma0 > 0 ? jetExcessInNearField(jet, r) : 0
    const rest = Math.max(target - inJet, 0)
    return { sigma: rest / (BLOB_VOLUME_R3 * r ** 3), radius: r, jetShare: target > 0 ? Math.min(inJet / target, 1) : 0 }
}
