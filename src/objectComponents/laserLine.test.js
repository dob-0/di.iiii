import { describe, expect, it } from 'vitest'
import {
    CMF_1931, KM, beamWidth, driveOfHex, fieldDirection, gamutMapConstantY, hgPhase, laserColourFlux, laserFlux, laserOf,
    lineLuminance, linePerLumen, lumaOf, scanLines, xyzToLinearRgb
} from './laserLine.js'

const SIX_W = [2700, 1500, 1800] // mW at 455 / 525 / 638 nm, the maker's 6.0 W Ultra MK2 (Guide v1.2 p. 12)

describe('laserLine: a laser in haze as a line source', () => {
    it('gives each diode its luminous flux, Km·V(λ)·P (lasers-exact.md §3.3: 88 / 813 / 235 lm, 1136 lm)', () => {
        const [b, g, r] = laserFlux(SIX_W)
        expect(b).toBeCloseTo(88.5, 0)
        expect(g).toBeCloseTo(812.6, 0)
        expect(r).toBeCloseTo(235.0, 0)
        expect(b + g + r).toBeCloseTo(1136, -1)
        expect(KM).toBe(683)
        // ȳ is V(λ): the CIE table's values at the cube's lines
        expect(CMF_1931[525][1]).toBe(0.7932)
        expect(CMF_1931[455][1]).toBe(0.048)
    })

    it('keeps the luminance of a line that is out of the sRGB gamut, desaturating it toward grey', () => {
        for (const nm of [455, 525, 638]) {
            const raw = xyzToLinearRgb([CMF_1931[nm][0] / CMF_1931[nm][1], 1, CMF_1931[nm][2] / CMF_1931[nm][1]])
            const { rgb, desaturated } = linePerLumen(nm)
            expect(rgb.every((c) => c >= 0)).toBe(true)
            expect(lumaOf(rgb)).toBeCloseTo(lumaOf(raw), 3)
            // 455 and 525 nm are outside the gamut, so they are mapped
            if (nm !== 638) expect(desaturated).toBeGreaterThan(0)
        }
        expect(gamutMapConstantY([0.2, 0.5, 0.1]).desaturated).toBe(0)
        // green stays green-dominant after the mapping
        const g = linePerLumen(525).rgb
        expect(g[1]).toBeGreaterThan(g[0])
        expect(g[1]).toBeGreaterThan(g[2])
    })

    it('makes a cube\'s colour flux: luminance = lumens; green drive = only the 525 nm diode', () => {
        const all = laserColourFlux({ mW: SIX_W })
        // the 4-digit IEC matrix and the BT.709 luminance row agree to 1e-4
        expect(Math.abs(lumaOf(all.rgb) / all.lumens - 1)).toBeLessThan(1e-4)
        const green = laserColourFlux({ mW: SIX_W, drive: [0, 1, 0] })
        expect(green.lumens).toBeCloseTo(812.6, 0)
        expect(driveOfHex('#00ff00')).toEqual([0, 1, 0])
    })

    it('draws L = σs·p(θ)·Φ·T/(W·sinθ): the lasers report\'s figure, and the same intensity at any drawn width', () => {
        // lasers-exact.md §3.4: 6 W, g 0.74, σ 0.005/m, 20 m from the cube, the eye 20 m away, θ 30°: green ≈ 73 cd/m²
        const w = beamWidth(20, 4, 1)
        expect(w * 1000).toBeCloseTo(20.4, 0)
        const L = lineLuminance({ sigmaS: 0.005, g: 0.74, flux: 812.6, cosTheta: Math.cos(Math.PI / 6), width: w, s: 20, d: 20 })
        // the report's 73 uses w = a + φs = 24 mm; the Gaussian width √(a² + (φs)²) is 20.4 mm
        expect(L * w / 0.024).toBeCloseTo(73, -1)
        // a line drawn 10× wider (the pixel floor) is 10× dimmer: its intensity per unit length is kept
        const L10 = lineLuminance({ sigmaS: 0.005, g: 0.74, flux: 812.6, cosTheta: Math.cos(Math.PI / 6), width: w * 10, s: 20, d: 20 })
        expect(L10 * w * 10).toBeCloseTo(L * w, 6)
        // more haze, brighter line (until the optical depth bites)
        expect(lineLuminance({ sigmaS: 0.02, g: 0.74, flux: 812.6, cosTheta: 0.5, width: w, s: 20, d: 20 })).toBeGreaterThan(lineLuminance({ sigmaS: 0.005, g: 0.74, flux: 812.6, cosTheta: 0.5, width: w, s: 20, d: 20 }))
        expect(hgPhase(1, 0.74)).toBeGreaterThan(hgPhase(0, 0.74) * 20)
    })

    it('spreads a scanned shape over its segments by duty share, blank moves carrying nothing', () => {
        // a square of 4 lit points: four segments, each 1/4 of the time
        const square = [[-0.5, -0.5, 0, 1, 0], [0.5, -0.5, 0, 1, 0], [0.5, 0.5, 0, 1, 0], [-0.5, 0.5, 0, 1, 0]]
        const lines = scanLines(square)
        const duty = lines.reduce((s, l) => s + l.duty, 0)
        expect(duty).toBeCloseTo(1, 9)
        expect(lines.length).toBeGreaterThan(4)
        // one blank move: that segment's quarter is dark
        const blanked = scanLines([[-0.5, -0.5, 0, 1, 0], [0.5, -0.5, 0, 0, 0], [0.5, 0.5, 0, 1, 0], [-0.5, 0.5, 0, 1, 0]])
        expect(blanked.reduce((s, l) => s + l.duty, 0)).toBeCloseTo(0.75, 9)
        // no frame: one static beam, all the light, straight down the lamp's −Y
        expect(scanLines(null)).toEqual([{ dir: [0, -1, 0], drive: [1, 1, 1], duty: 1 }])
        // a field point: right is +X, up is +Z, forward −Y
        const d = fieldDirection(1, 0, 18.5)
        expect(d[0]).toBeGreaterThan(0)
        expect(Math.atan2(d[0], -d[1]) * 180 / Math.PI).toBeCloseTo(18.5, 6)
        // a long frame stays under the line cap and keeps its total duty
        const many = Array.from({ length: 400 }, (_, i) => [Math.cos(i / 20), Math.sin(i / 20), 1, 0, 0])
        const capped = scanLines(many, { maxLines: 240 })
        expect(capped.length).toBeLessThanOrEqual(240)
        expect(capped.reduce((s, l) => s + l.duty, 0)).toBeCloseTo(1, 9)
    })

    it('reads a lamp\'s beam.laser, or nothing', () => {
        expect(laserOf(null)).toBe(null)
        expect(laserOf({ laser: { mW: [1, 2, 3], nm: [455, 525, 999] } })).toBe(null)
        const l = laserOf({ laser: { mW: SIX_W, nm: [455, 525, 638], diameter_mm: 4, divergence_mrad: 1, sceneScale: 0.02 } })
        expect(l).toMatchObject({ mW: SIX_W, diameter_mm: 4, divergence_mrad: 1, sceneScale: 0.02, frame: null })
    })
})
