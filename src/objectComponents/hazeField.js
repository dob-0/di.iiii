// THE HAZE AS A FIELD — how much scattering the air holds at each point, worked out
// from the machines that make it. beamAir.js draws a beam through a scattering
// coefficient σs (1/m); until now that was one number for the whole room
// (renderSettings.atmosphere.scattering), set by eye against photographs. Here it
// comes from what is actually in the hall:
//
//   1. THE FLUID. A hazer or a fog machine turns fluid into droplets. Its output
//      (ml/min at 100 %, the maker's figure — fixtures.json) × the level it is run at
//      × the fluid's density is a mass flow ṁ of droplets into the air (g/min). Only
//      the part that stays a droplet counts: an oil haze stays (fraction 1); a
//      water-glycol fog loses its water within seconds and keeps the glycol.
//
//   2. THE HALL. The droplets mix through the hall's volume V and leave with its air:
//      a ventilation of n air changes an hour removes them with a time constant
//      τ = 60/n minutes (a fog also dries out on its own, τ_dry). The well-mixed
//      concentration then follows
//
//          V·dC/dt = ṁ − V·C/τ      →   C_ss = ṁ·τ / V      (steady state)
//          C(t)    = C_ss·(1 − e^(−t/τ))                    (switched on at t = 0)
//
//   3. THE LIGHT. Droplets much larger than the light's wavelength remove light in
//      proportion to their cross-section; for a mass concentration C of spheres of
//      diameter D and density ρ the extinction coefficient is
//
//          σ = 3·Q·C / (2·ρ·D)                 (Q ≈ 2, the extinction efficiency
//                                               of a large sphere — the "extinction
//                                               paradox", van de Hulst 1957, §8.22)
//
//      A haze droplet is about 1 µm, so this holds roughly (Q oscillates around 2 in
//      the Mie regime; 2 is its mean). Haze absorbs almost nothing (albedo ≈ 1), so
//      scattering = extinction: σs = σ.
//
//   4. NEAR THE MACHINE, before the air has mixed it, the output leaves as a jet.
//      A round turbulent jet of nozzle diameter d carries the droplets out along its
//      axis; its centreline concentration falls as c(u) = c0 · K·d/u (K ≈ 5, past the
//      first five diameters) and its width grows linearly, a 1/e radius of ≈ 0.11·u
//      (Pope, "Turbulent Flows", 2000, §5.1 and the scalar-spreading rates there;
//      Chen & Rodi 1980). c0 = ṁ/F is the concentration at the nozzle, F the
//      machine's fan flow. A jet runs out of momentum after some metres and becomes
//      the background: its excess fades with a reach L.
//
//   5. PATCHINESS. Real haze is never even: slow eddies make it thicker and thinner by
//      tens of percent over metres. A smooth 3D noise, drifting with the hall's air,
//      modulates the field (hazeNoiseTexture below; the shader samples the same
//      texture).
//
//   6. ONE MACHINE IN A BIG HALL (`haze.model: 'nf-ff'`, 2026-10-09): the well-mixed box above treats the
//      whole hall as evenly hazed the moment the machine runs. With one machine in 186,890 m³ that is not
//      so: the two-zone (near-field / far-field) model (Nicas 1996; hazeZones.js) gives the hall's haze
//      (the fill) and the haze around the machine separately, from clean air at `minutes`. The jet is
//      drawn as the jet law gives it; the rest of the near field's mass is a soft hemisphere (a "blob").
//      This model is never calibrated to photographs: an UNVALIDATED estimate, said where it is used.
//
// What is ASSUMED (no maker publishes it) is said where it is set, below; every
// number a show depends on can be overridden from renderSettings.atmosphere.haze.
// Limits, stated: the jets are straight (no buoyancy, no bending in a draught); the
// transmittance toward the eye uses the well-mixed σ only (a beam seen through a
// plume is not dimmed by the plume); a fog's droplets are one size.

import { blobShape, machineZones, nearBlobOf } from './hazeZones.js'

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// How many machines one shader takes. A fixed number: the array uniforms' size is part
// of the program, and a count that changed with the rig would recompile every beam.
// MOXIR has 6 hazers + 4 fog machines.
export const MAX_HAZE_SOURCES = 12

// THE PHYSICS OF EACH KIND OF MACHINE. Keyed by the fixture type's category
// (src/rigbuild/types/moxir.json: 'hazer', 'smoke-machine'). The fluid's output comes
// from the type's own spec (fluid_ml_per_min); the rest no maker states:
//   dropletD_um — ASSUMED. Oil haze: a mean of ~1 µm (an oil "cracker" or atomising
//                 hazer makes sub-micron to ~1 µm droplets — why haze hangs for an hour
//                 and is nearly invisible except in a beam). Water-glycol fog: ~3 µm.
//   fluidDensity_g_ml — ASSUMED from the fluid families: white mineral oil ≈ 0.85;
//                 a water-glycol fog fluid ≈ 1.05.
//   persistent  — the part of the fluid that stays a droplet: oil 1; a fog fluid keeps
//                 its glycol, ≈ 0.35 of it (ASSUMED, a typical "medium density" mix).
//   fan_m3_s    — ASSUMED fan flow at the nozzle. Hazers blow a gentle stream; a fog
//                 machine's heat exchanger pushes a fast, narrow burst.
//   dryTau_min  — how soon a fog thins on its own (ASSUMED); oil haze does not dry.
//   reach_m     — how far the jet carries before it is background (ASSUMED).
//   nozzle_d_mm — from the type's model when it has one (fixtures.json model.params).
export const HAZE_KINDS = {
    hazer: {
        dropletD_um: 1.0,
        fluidDensity_g_ml: 0.85,
        refractiveIndex: 1.47, // white mineral oil
        persistent: 1,
        fan_m3_s: 0.08,
        dryTau_min: Infinity,
        reach_m: 8,
        nozzle_d_mm: 70,
        defaultLevel: 0.6
    },
    'smoke-machine': {
        dropletD_um: 3.0,
        fluidDensity_g_ml: 1.05,
        refractiveIndex: 1.43, // a glycol droplet once its water has gone
        persistent: 0.35,
        fan_m3_s: 0.04,
        dryTau_min: 1.5,
        reach_m: 4,
        nozzle_d_mm: 50,
        // a fog machine is fired in bursts by hand; off unless a look says otherwise
        defaultLevel: 0
    }
}

// THE HALL, when the document does not say. ASSUMED: a club hall of ~12 000 m³ with its
// air handling running at 6 air changes an hour (τ = 10 min).
export const DEFAULT_HALL = { volume_m3: 12000, airChangesPerHour: 6 }

// Extinction efficiency of a droplet: van de Hulst's ANOMALOUS DIFFRACTION approximation
// (Light Scattering by Small Particles, 1957, §11.22), good for droplets a few wavelengths
// across with a refractive index near 1.4–1.5:
//     Q = 2 − (4/ρ)·sin ρ + (4/ρ²)·(1 − cos ρ),   ρ = 2x(n − 1),   x = πD/λ
// It tends to 2 for large droplets (the "extinction paradox"); a 1 µm oil droplet in green
// light (n ≈ 1.47, λ = 0.55 µm) gives ≈ 2.6. Haze absorbs almost nothing: scattering = extinction.
export const LAMBDA_UM = 0.55
export const extinctionEfficiency = (dropletD_um, n = 1.47, lambda_um = LAMBDA_UM) => {
    const x = (Math.PI * Math.max(num(dropletD_um, 1), 0.05)) / lambda_um
    const r = 2 * x * Math.max(num(n, 1.47) - 1, 0.01)
    return 2 - (4 / r) * Math.sin(r) + (4 / (r * r)) * (1 - Math.cos(r))
}

/** Extinction (= scattering) per unit mass concentration, m²/g, for droplets of diameter D (µm), density ρ (g/ml), index n. */
export const massExtinction = (dropletD_um, density_g_ml, n = 1.47) => {
    const D = Math.max(num(dropletD_um, 1), 0.05) * 1e-6 // m
    const rho = Math.max(num(density_g_ml, 1), 0.1) * 1e6 // g/m³
    return (3 * extinctionEfficiency(dropletD_um, n)) / (2 * rho * D)
}

/** Droplet mass flow, g/min, for a machine of `fluid_ml_per_min` run at `level` (0..1). */
export const dropletMassFlow = (kind, fluid_ml_per_min, level) =>
    Math.max(num(fluid_ml_per_min, 0), 0) * clamp(num(level, 0), 0, 1) * kind.fluidDensity_g_ml * kind.persistent

/** The time constant a hall's air takes the droplets out with, minutes. */
export const removalTau = (kind, hall) => {
    const ach = Math.max(num(hall?.airChangesPerHour, DEFAULT_HALL.airChangesPerHour), 0.01)
    const vent = 60 / ach
    const dry = num(kind.dryTau_min, Infinity)
    return Number.isFinite(dry) && dry > 0 ? 1 / (1 / vent + 1 / dry) : vent
}

/**
 * The well-mixed scattering of the hall, 1/m: every machine's droplets mixed through
 * the volume, at steady state (minutes = null) or `minutes` after they were switched on.
 */
export const fillScattering = (sources, hall = DEFAULT_HALL, minutes = null) => {
    const V = Math.max(num(hall?.volume_m3, DEFAULT_HALL.volume_m3), 1)
    let sigma = 0
    for (const s of sources) {
        const kind = s.kind
        const tau = removalTau(kind, hall)
        const mdot = dropletMassFlow(kind, s.fluid_ml_per_min, s.level)
        let C = (mdot * tau) / V // g/m³ at steady state
        if (minutes != null) C *= 1 - Math.exp(-Math.max(num(minutes, 0), 0) / tau)
        sigma += C * massExtinction(kind.dropletD_um, kind.fluidDensity_g_ml, kind.refractiveIndex)
    }
    return sigma
}

/**
 * One machine's jet, ready for the shader: its nozzle's scattering σ0 (1/m, the excess
 * over the hall at the nozzle), nozzle diameter d (m), spread (1/e radius per metre)
 * and reach (m). Zero σ0 when the machine is off.
 */
export const jetOf = (source) => {
    const kind = source.kind
    const mdot = dropletMassFlow(kind, source.fluid_ml_per_min, source.level) / 60 // g/s
    const c0 = mdot / Math.max(kind.fan_m3_s, 1e-4) // g/m³ at the nozzle
    return {
        sigma0: c0 * massExtinction(kind.dropletD_um, kind.fluidDensity_g_ml, kind.refractiveIndex),
        nozzle: Math.max(num(source.nozzle_d_mm, kind.nozzle_d_mm), 5) / 1000,
        spread: 0.11,
        reach: Math.max(num(kind.reach_m, 6), 0.5)
    }
}

// Round-jet centreline decay constant (4. above).
export const JET_K = 5

/** A jet's excess scattering at a point `v` (metres, relative to the nozzle), axis `dir` (unit). */
export const jetScattering = (jet, v, dir) => {
    if (!(jet.sigma0 > 0)) return 0
    const u = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]
    const along = Math.max(u, 0)
    const r2 = Math.max(v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - u * u, 0)
    const w = jet.nozzle / 2 + jet.spread * along
    const decay = Math.min(1, (JET_K * jet.nozzle) / Math.max(along, 1e-6))
    // behind the nozzle nothing; across its face it ramps in over half a diameter
    const ramp = clamp((u + jet.nozzle / 2) / jet.nozzle, 0, 1)
    return jet.sigma0 * decay * Math.exp(-r2 / (w * w)) * Math.exp(-along / jet.reach) * ramp
}

// PATCHINESS: a periodic 3D value noise, smoothed — one 32³ texture the shader samples
// (trilinear, repeat), the same values in JS for the tests. Deterministic: a hash, not
// Math.random, so every screen draws the same haze.
export const NOISE_SIZE = 32
const hash3 = (x, y, z) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967295
}
let noiseCache = null
/** The noise volume, Uint8 0..255, NOISE_SIZE³, x fastest. Three octaves of smoothed value noise. */
export const hazeNoiseData = () => {
    if (noiseCache) return noiseCache
    const N = NOISE_SIZE
    const raw = new Float32Array(N * N * N)
    const lattice = (cells, x, y, z) => {
        // trilinear value noise with a smoothstep fade on a lattice of `cells` per side
        const f = cells / N
        const gx = x * f
        const gy = y * f
        const gz = z * f
        const x0 = Math.floor(gx)
        const y0 = Math.floor(gy)
        const z0 = Math.floor(gz)
        const fade = (t) => t * t * (3 - 2 * t)
        const tx = fade(gx - x0)
        const ty = fade(gy - y0)
        const tz = fade(gz - z0)
        const v = (i, j, k) => hash3((x0 + i) % cells, (y0 + j) % cells, (z0 + k) % cells)
        const lerp = (a, b, t) => a + (b - a) * t
        return lerp(
            lerp(lerp(v(0, 0, 0), v(1, 0, 0), tx), lerp(v(0, 1, 0), v(1, 1, 0), tx), ty),
            lerp(lerp(v(0, 0, 1), v(1, 0, 1), tx), lerp(v(0, 1, 1), v(1, 1, 1), tx), ty),
            tz
        )
    }
    for (let z = 0; z < N; z += 1) {
        for (let y = 0; y < N; y += 1) {
            for (let x = 0; x < N; x += 1) {
                raw[x + N * (y + N * z)] = 0.5 * lattice(4, x, y, z) + 0.3 * lattice(8, x, y, z) + 0.2 * lattice(16, x, y, z)
            }
        }
    }
    const data = new Uint8Array(N * N * N)
    for (let i = 0; i < raw.length; i += 1) data[i] = Math.round(clamp(raw[i], 0, 1) * 255)
    noiseCache = data
    return data
}

/** The noise at a point, 0..1 — trilinear and periodic, as the GPU samples the texture. */
export const sampleHazeNoise = (p) => {
    const data = hazeNoiseData()
    const N = NOISE_SIZE
    const at = (x, y, z) => data[((x % N) + N) % N + N * ((((y % N) + N) % N) + N * (((z % N) + N) % N))] / 255
    // texel centres at (i + 0.5)/N, as GL_LINEAR with REPEAT
    const gx = p[0] * N - 0.5
    const gy = p[1] * N - 0.5
    const gz = p[2] * N - 0.5
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const z0 = Math.floor(gz)
    const tx = gx - x0
    const ty = gy - y0
    const tz = gz - z0
    const lerp = (a, b, t) => a + (b - a) * t
    return lerp(
        lerp(lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), tx), lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx), ty),
        lerp(lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx), lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx), ty),
        tz
    )
}

// One noise tile spans this many metres of hall. With the octaves above (4, 8 and 16
// cells a tile) the eddies are 2 m, 1 m and 0.5 m — the wisps a beam shows in a real
// haze; a coarser tile (12 m was tried) read as an even haze from the audience.
export const NOISE_TILE_M = 8

/**
 * The scattering at a world point p, 1/m — the JS twin of the shader's hazeSigma().
 * `field` is buildHazeField's result; `time` seconds moves the noise with the drift.
 */
export const hazeScatteringAt = (field, p, time = 0) => {
    if (!field) return 0
    const q = [
        (p[0] - field.drift[0] * time) / NOISE_TILE_M,
        (p[1] - field.drift[1] * time) / NOISE_TILE_M,
        (p[2] - field.drift[2] * time) / NOISE_TILE_M
    ]
    const n = field.patchiness > 0 ? sampleHazeNoise(q) : 0.5
    // the noise is 0.5 on average: (n − 0.5)·2 is a ±1 swing around the mean
    const swing = 1 + field.patchiness * (n - 0.5) * 2
    let sigma = field.fill * swing
    for (const jet of field.jets) {
        const v = [p[0] - jet.position[0], p[1] - jet.position[1], p[2] - jet.position[2]]
        // a jet's eddies are its own: the same noise, but stronger
        const eddy = clamp(1 + 1.6 * field.patchiness * (n - 0.5) * 2, 0, 3)
        sigma += jetScattering(jet, v, jet.direction) * eddy
        // the near field's blob (two-zone model), centred on the same nozzle, its own index
        const blob = field.blobs?.[field.jets.indexOf(jet)]
        if (blob && blob.sigma > 0) sigma += blob.sigma * blobShape(Math.hypot(v[0], v[1], v[2]) / blob.radius) * eddy
    }
    return sigma
}

/**
 * The haze settings a document asks for (`renderSettings.atmosphere.haze`), cleaned, or
 * null when the room keeps one uniform haze (atmosphere.scattering, as before).
 *   { volume_m3, airChangesPerHour,           the hall
 *     levels: { <entityId>: 0..1 },            each machine's level (run by hand)
 *     kindLevels: { hazer, 'smoke-machine' },  the default level per kind
 *     minutes,                                 minutes since switched on (absent: steady)
 *     patchiness 0..1, drift [x,y,z] m/s,
 *     model 'nf-ff' | 'well-mixed', nearField { radius_m, airSpeed_m_s }, source (what the numbers rest on) }
 */
export const hazeSettingsOf = (atmosphere) => {
    const h = atmosphere?.haze
    if (!h || typeof h !== 'object') return null
    const drift = Array.isArray(h.drift) && h.drift.length === 3 ? h.drift.map((v) => clamp(num(v, 0), -5, 5)) : [0.15, 0.02, 0.05]
    return {
        volume_m3: Math.max(num(h.volume_m3, DEFAULT_HALL.volume_m3), 1),
        airChangesPerHour: Math.max(num(h.airChangesPerHour, DEFAULT_HALL.airChangesPerHour), 0.01),
        levels: h.levels && typeof h.levels === 'object' ? h.levels : {},
        kindLevels: h.kindLevels && typeof h.kindLevels === 'object' ? h.kindLevels : {},
        minutes: h.minutes == null ? null : Math.max(num(h.minutes, 0), 0),
        // CALIBRATION: the room's hand-set scattering (atmosphere.scattering, chosen against
        // the §20 photographs) is the hall's haze with every machine at its usual level; the
        // machines decide only how it is spread and how it changes when they are turned up or
        // down. `calibrate: false` trusts the physics' absolute number instead.
        calibrateTo: h.calibrate === false || h.model === 'nf-ff' ? null : (num(atmosphere?.scattering, 0) > 0 ? num(atmosphere.scattering, 0) : null),
        // 'nf-ff': the two-zone estimate (hazeZones.js), never calibrated; else the well-mixed box
        model: h.model === 'nf-ff' ? 'nf-ff' : 'well-mixed',
        nearField: h.nearField && typeof h.nearField === 'object' ? { radius_m: num(h.nearField.radius_m, 3), airSpeed_m_s: num(h.nearField.airSpeed_m_s, 0.1) } : null,
        source: typeof h.source === 'string' ? h.source : null,
        patchiness: clamp(num(h.patchiness, 0.35), 0, 1),
        drift
    }
}

/**
 * The machines in a room: every entity whose fixture type is a hazer or a fog machine,
 * with its nozzle's world position and the way it blows (the model's front, +Z, turned
 * by the entity's rotation). `typeOf(fixtureType)` answers the type library's entry.
 */
export const hazeMachinesOf = (entities, typeOf) => {
    const list = Array.isArray(entities) ? entities : Object.values(entities || {})
    const out = []
    for (const e of list) {
        const fx = e?.components?.fixture
        if (!fx?.type) continue
        const type = typeOf(fx.type)
        const kind = HAZE_KINDS[type?.category]
        if (!kind) continue
        const t = e.components.transform || {}
        const pos = Array.isArray(t.position) ? t.position.map((v) => num(v, 0)) : [0, 0, 0]
        const rot = Array.isArray(t.rotation) ? t.rotation.map((v) => num(v, 0)) : [0, 0, 0]
        const lensY = num(type?.model3d?.lensY, 0.2)
        out.push({
            id: e.id,
            category: type.category,
            kind,
            fluid_ml_per_min: num(type?.fluid_ml_per_min?.value ?? type?.fluid_ml_per_min, 0),
            nozzle_d_mm: num(type?.nozzle_d_mm, kind.nozzle_d_mm),
            position: [pos[0], pos[1] + lensY, pos[2]],
            direction: rotateXYZ([0, 0, 1], rot)
        })
    }
    return out
}

// three.js Euler 'XYZ' (the default order): v' = Rx·Ry·Rz·v.
const rotateXYZ = (v, [rx, ry, rz]) => {
    let [x, y, z] = v
    // Rz
    ;[x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)]
    // Ry
    ;[x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)]
    // Rx
    ;[y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)]
    const l = Math.hypot(x, y, z) || 1
    return [x / l, y / l, z / l]
}

/**
 * The field the beams draw: the hall's well-mixed scattering (fill) plus each running
 * machine's jet. Null when the room has no haze settings or no machines — the beams
 * then keep the one uniform scattering they always had.
 */
export const buildHazeField = (settings, machines) => {
    if (!settings || !machines?.length) return null
    const levelOf = (m) => {
        if (settings.levels[m.id] != null) return clamp(num(settings.levels[m.id], 0), 0, 1)
        if (settings.kindLevels[m.category] != null) return clamp(num(settings.kindLevels[m.category], 0), 0, 1)
        return m.kind.defaultLevel
    }
    const running = machines.map((m) => ({ ...m, level: levelOf(m) }))
    const hall = { volume_m3: settings.volume_m3, airChangesPerHour: settings.airChangesPerHour }
    if (settings.model === 'nf-ff') return buildZoneField(settings, running, { ...hall, nearField: settings.nearField })
    // calibrated: scaled so the machines at their usual levels give the photographed haze
    // (the physics' absolute number rests on assumed droplet sizes, fan flows and hall size;
    // the RATIOS — this hazer up, that fog machine on — are what it gets right)
    let scale = 1
    if (settings.calibrateTo > 0) {
        const usual = fillScattering(machines.map((m) => ({ ...m, level: m.kind.defaultLevel })), hall, null)
        if (usual > 0) scale = settings.calibrateTo / usual
    }
    const fill = fillScattering(running, hall, settings.minutes) * scale
    const jets = running
        .filter((m) => m.level > 0)
        .slice(0, MAX_HAZE_SOURCES)
        .map((m) => { const j = jetOf(m); return { ...j, sigma0: j.sigma0 * scale, position: m.position, direction: m.direction, id: m.id } })
    return { fill, jets, blobs: [], patchiness: settings.patchiness, drift: settings.drift, scale }
}

/**
 * The field from the two-zone estimate (hazeZones.js): the fill = the far field (every machine's, summed —
 * exact for one machine, superposed for several); per running machine its jet (unscaled) and a blob holding
 * the rest of its near field's excess mass. `zones` keeps each machine's numbers, for whoever reports them.
 */
const buildZoneField = (settings, running, hall) => {
    let fill = 0
    const jets = []
    const blobs = []
    const zones = []
    for (const m of running) {
        if (!(m.level > 0)) continue
        const z = machineZones(m, hall, settings.minutes)
        fill += z.far
        const blob = nearBlobOf(m, z)
        zones.push({ id: m.id, near: z.near, far: z.far, tauFar_min: z.tauFar_min, G_g_min: z.G_g_min, blobSigma: blob.sigma, radius_m: blob.radius, jetShare: blob.jetShare })
        if (jets.length < MAX_HAZE_SOURCES) {
            jets.push({ ...jetOf(m), position: m.position, direction: m.direction, id: m.id })
            blobs.push({ sigma: blob.sigma, radius: blob.radius })
        }
    }
    return { fill, jets, blobs, patchiness: settings.patchiness, drift: settings.drift, scale: 1, model: 'nf-ff', zones, source: settings.source }
}

// The surfaces' fog: Beer–Lambert at the fill's σ (beerLambertFog.js, used by atmosphereStore.js
// hazeFogBase). The linear stand-in 0 … 1.6/σ (realism.mjs) is no longer what the room draws.

/** Two fields the beams would draw the same (so the store does not wake every beam for nothing). */
export const sameHazeField = (a, b) => {
    if (a === b) return true
    if (!a || !b) return false
    return JSON.stringify(a) === JSON.stringify(b)
}
