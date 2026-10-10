import { describe, expect, it } from 'vitest'
import { HAZE_KINDS } from './hazeField.js'
import { BLOB_VOLUME_R3, blobShape, machineZones, nearBlobOf, nearFieldOf, twoZone } from './hazeZones.js'

// The kit's one smoke machine: Antari Z-1500 III EQUIVALENT, 150 ml/min at 100 % (fixtures.json), the
// code's own assumed droplets and drying (hazeField.js HAZE_KINDS['smoke-machine']).
const smoke = { kind: HAZE_KINDS['smoke-machine'], fluid_ml_per_min: 150, level: 1, nozzle_d_mm: 50 }
const HALL = { volume_m3: 186890, airChangesPerHour: 6, nearField: { radius_m: 3, airSpeed_m_s: 0.1 } }

describe('hazeZones: the two-zone (Nicas 1996) estimate of one machine in the hall', () => {
    it('solves the two-zone equations exactly (checked against a small-step integration)', () => {
        const p = { G: 55, V: 186890, VN: 56.5, beta: 170, Q: 18689, k: 0.3 }
        let n = 0
        let f = 0
        const dt = 0.0005
        for (let t = 0; t < 5; t += dt) {
            const dn = (p.G + p.beta * f - p.beta * n - p.k * p.VN * n) / p.VN
            const df = (p.beta * n - p.beta * f - p.Q * f - p.k * (p.V - p.VN) * f) / (p.V - p.VN)
            n += dn * dt
            f += df * dt
        }
        const exact = twoZone({ ...p, minutes: 5 })
        expect(exact.near / n).toBeCloseTo(1, 3)
        expect(exact.far / f).toBeCloseTo(1, 3)
        // steady state: the far field G/(Q + k·V_F + …) and the near field above it by about G/β
        const ss = twoZone(p)
        expect(ss.near).toBeGreaterThan(ss.far)
        expect(twoZone({ ...p, minutes: 1e5 }).far / ss.far).toBeCloseTo(1, 6)
    })

    it('gives β = ½·FSA·s for a hemisphere near field', () => {
        const nf = nearFieldOf({ radius_m: 3, airSpeed_m_s: 0.1 })
        expect(nf.volume_m3).toBeCloseTo(56.55, 1)
        expect(nf.beta_m3_min).toBeCloseTo(0.5 * 2 * Math.PI * 9 * 6, 6)
    })

    it('answers the kit\'s question: one machine does NOT fill 186,890 m³ on the code\'s assumptions', () => {
        const z = machineZones(smoke, HALL)
        // 150 ml/min × 1.05 g/ml × 0.35 persistent = 55.1 g/min of droplets; 3 µm glycol ≈ 0.86 m²/g
        expect(z.G_g_min).toBeCloseTo(55.1, 1)
        expect(z.eps_m2_g).toBeCloseTo(0.86, 2)
        // the hall: ≈ 2.7 × 10⁻⁴ /m (≈ 74 × thinner than the 0.02 /m dev drew), steady within minutes
        expect(z.far).toBeGreaterThan(2.5e-4)
        expect(z.far).toBeLessThan(2.9e-4)
        expect(z.tauFar_min).toBeLessThan(1.5)
        // near the machine (3 m): ≈ 0.23 /m
        expect(z.near).toBeGreaterThan(0.2)
        expect(z.near).toBeLessThan(0.26)
    })

    it('and in the best case (closed hall 0.5 ACH, droplets that never dry) needs ~2 h and three tank refills for 0.02 /m', () => {
        const kind = { ...HAZE_KINDS['smoke-machine'], dryTau_min: Infinity }
        const z = machineZones({ ...smoke, kind }, { ...HALL, airChangesPerHour: 0.5 })
        expect(z.far).toBeGreaterThan(0.029)
        expect(z.far).toBeLessThan(0.032)
        expect(z.tauFar_min).toBeCloseTo(120, -1)
        const at = (min) => machineZones({ ...smoke, kind }, { ...HALL, airChangesPerHour: 0.5 }, min).far
        // 0.005 /m after ~22 min; at 40 min (the 6 L tank empty at 150 ml/min) ≈ 0.0086 /m; 0.02 /m only after ~129 min
        expect(at(21)).toBeLessThan(0.005)
        expect(at(23)).toBeGreaterThan(0.005)
        expect(at(40)).toBeCloseTo(0.0086, 3)
        expect(at(128)).toBeLessThan(0.02)
        expect(at(131)).toBeGreaterThan(0.02)
    })

    it('puts the near field\'s excess mass around the nozzle: the jet as the jet law gives it, the rest as a soft hemisphere', () => {
        const z = machineZones(smoke, HALL)
        const blob = nearBlobOf(smoke, z)
        // the jet alone holds only ~5 % of what the zone model puts within 3 m
        expect(blob.jetShare).toBeGreaterThan(0.02)
        expect(blob.jetShare).toBeLessThan(0.1)
        // jet + blob = (σ_N − σ_F)·V_N, exactly
        const jetMass = blob.jetShare * (z.near - z.far) * z.nearField.volume_m3
        expect(jetMass + blob.sigma * BLOB_VOLUME_R3 * 27).toBeCloseTo((z.near - z.far) * z.nearField.volume_m3, 6)
        // a hemisphere's volume, give or take the soft edge
        expect(BLOB_VOLUME_R3 / ((2 / 3) * Math.PI)).toBeGreaterThan(1)
        expect(BLOB_VOLUME_R3 / ((2 / 3) * Math.PI)).toBeLessThan(1.05)
        expect(blobShape(0)).toBe(1)
        expect(blobShape(1.3)).toBe(0)
        expect(nearBlobOf({ ...smoke, level: 0 }, machineZones({ ...smoke, level: 0 }, HALL)).sigma).toBe(0)
    })
})
