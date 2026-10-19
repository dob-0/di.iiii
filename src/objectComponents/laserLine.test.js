import { describe, expect, it } from 'vitest'
import {
    CMF_1931, KM, beamWidth, driveOfHex, fieldDirection, gamutMapConstantY, hgPhase, laserColourFlux, laserFlux, laserOf,
    lineLuminance, linePerLumen, lumaOf, scanLines, xyzToLinearRgb, frameIndexAt, framesOf, laserFrameAt, nextFrameIn, poseAt, scanLinesAt,
    MIN_CORE_PX, coreHalo, coreWidth, haloRadius, haloRadiusCapped, haloShare,
    LONE_LINE_SPACING_RAD, SCAN_STEP_DEG, SPOT_ALBEDO, laserSpot, lineSpacings
} from './laserLine.js'
import { laserLineGeometry, laserSpotGeometry } from './laserLineMaterial.js'

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

// N562 (2026-10-13): frames in time — a list of frames over a period, the one drawn picked by the show's time.
describe('laserLine: frames in time', () => {
    const left = [[-0.5, 0, 1, 1, 1]]
    const right = [[0.5, 0, 1, 1, 1]]
    const dark = [[0, 0, 0, 0, 0]]
    const laser = laserOf({ laser: { mW: SIX_W, nm: [455, 525, 638], frame: [[0, 0.5, 0, 1, 0]], frames: { period: 3, list: [left, right, dark] } } })

    it('reads frames beside the static frame, dropping empty or bad ones', () => {
        expect(laser.frames.period).toBe(3)
        expect(laser.frames.list).toEqual([left, right, dark])
        expect(framesOf({ period: 2, list: [[], [['x']], right] })).toEqual({ period: 2, list: [right] })
        expect(framesOf({ period: 0, list: [right] })).toBe(null)
        expect(framesOf({ period: 2, list: [] })).toBe(null)
        expect(laserOf({ laser: { mW: SIX_W } }).frames).toBe(null)
    })

    it('picks the frame by time: even steps over the period, wrapping, negative time too', () => {
        expect([0, 0.99, 1, 1.5, 2, 2.99, 3, 4.2, -0.5].map((t) => frameIndexAt(laser.frames, t))).toEqual([0, 0, 1, 1, 2, 2, 0, 1, 2])
        expect(frameIndexAt(null, 1)).toBe(-1)
        expect(nextFrameIn(laser.frames, 1.25)).toBeCloseTo(0.75, 9)
        expect(nextFrameIn(null, 1)).toBe(Infinity)
    })

    it('scanLines by time: the line moves across the field from frame to frame, and a blank frame draws nothing', () => {
        const at0 = scanLinesAt(laser, 0.5)
        const at1 = scanLinesAt(laser, 1.5)
        expect(at0).toHaveLength(1)
        expect(at1).toHaveLength(1)
        expect(at0[0].duty).toBe(1)
        // x −0.5 of a ±18.5° field: 9.25° to the lamp's right of its −Y, then the mirror
        expect(Math.atan2(at0[0].dir[0], -at0[0].dir[1]) * 180 / Math.PI).toBeCloseTo(-9.25, 6)
        expect(Math.atan2(at1[0].dir[0], -at1[0].dir[1]) * 180 / Math.PI).toBeCloseTo(9.25, 6)
        expect(scanLinesAt(laser, 2.5)).toEqual([])
        expect(at0).toEqual(scanLines(left))
    })

    it('keeps the static path unchanged: no frames → the static frame at any time, the same lines as before', () => {
        const still = laserOf({ laser: { mW: SIX_W, nm: [455, 525, 638], frame: [[0, 0.5, 0, 1, 0], [0.5, 0.5, 0, 1, 0]] } })
        expect(laserFrameAt(still, 0)).toBe(still.frame)
        expect(laserFrameAt(still, 123.4)).toBe(still.frame)
        expect(scanLinesAt(still, 7)).toEqual(scanLines(still.frame))
        const bare = laserOf({ laser: { mW: SIX_W } })
        expect(scanLinesAt(bare, 7)).toEqual([{ dir: [0, -1, 0], drive: [1, 1, 1], duty: 1 }])
    })
})

// 2026-10-13: with frames the look's colour never reached the lines (they kept the frame's own colour, so 'the net'
// in green drew white). The lamp's drive now scales the frame per diode, as a projector's DMX colour channels do.
describe('laserLine: keyframes that tween (2026-10-17, the room shows what the cubes show)', () => {
    const a = [[-1, 0, 1, 1, 1], [0, 0, 0, 0, 0]]
    const b = [[1, 0, 1, 1, 1], [0, 0.5, 0, 0, 0]]
    const other = [[0, 0, 1, 1, 1]]

    it('framesOf keeps tween: true and drops anything else', () => {
        expect(framesOf({ period: 4, list: [a, b], tween: true })).toEqual({ period: 4, list: [a, b], tween: true })
        expect(framesOf({ period: 4, list: [a, b], tween: 'yes' })).toEqual({ period: 4, list: [a, b] })
    })

    it('poseAt blends point by point by how far t is through the step, and wraps into the first frame', () => {
        const frames = { period: 4, list: [a, b], tween: true }
        expect(poseAt(frames, 0)).toEqual(a)
        expect(poseAt(frames, 1)[0][0]).toBeCloseTo(0, 9)
        expect(poseAt(frames, 1)[1][1]).toBeCloseTo(0.25, 9)
        expect(poseAt(frames, 3)[0][0]).toBeCloseTo(0, 9)
        expect(poseAt(frames, 2)).toEqual(b)
        expect(poseAt(null, 1)).toBe(null)
    })

    it('holds the frame when the pair does not match, and without the flag unless asked', () => {
        expect(poseAt({ period: 4, list: [a, other], tween: true }, 1)).toEqual(a)
        expect(poseAt({ period: 4, list: [a, b] }, 1)).toEqual(a)
        expect(poseAt({ period: 4, list: [a, b] }, 1, true)[0][0]).toBeCloseTo(0, 9)
    })

    it('laserFrameAt draws the blended pose when the frames tween', () => {
        const laser = laserOf({ laser: { mW: SIX_W, nm: [455, 525, 638], frames: { period: 4, list: [a, b], tween: true } } })
        expect(laser.frames.tween).toBe(true)
        expect(laserFrameAt(laser, 1)[0][0]).toBeCloseTo(0, 9)
        expect(laserFrameAt(laser, 0)).toEqual(a)
    })
})

describe('a frame is scaled by the lamp\'s colour', () => {
    const frame = [[-0.5, 0, 0, 0, 0], [-0.5, 0, 1, 1, 1], [0.5, 0, 0, 0, 0], [0.5, 0, 1, 1, 1]]
    it('white lit points under a green look draw green lines', () => {
        const lines = scanLines(frame, { drive: [0, 1, 0] })
        expect(lines.length).toBeGreaterThan(0)
        for (const l of lines) expect(l.drive).toEqual([0, 1, 0])
    })
    it('the default drive leaves the frame\'s own colour', () => {
        const red = [[0, 0, 0, 0, 0], [0, 0, 1, 0, 0]]
        for (const l of scanLines(red)) expect(l.drive).toEqual([1, 0, 0])
    })
    it('blank moves stay blank whatever the look', () => {
        const lines = scanLines(frame, { drive: [1, 1, 1] })
        const lit = lines.reduce((sum, l) => sum + l.duty, 0)
        expect(lit).toBeCloseTo(0.5, 6)
    })
})


describe('laserLine 7.: core and halo (2026-10-15, lasers that look like lasers)', () => {
    it('draws the core as wide as the beam, never under one pixel', () => {
        // 10 m from the cube, 1 mrad: the beam is √(4² + 10²) mm = 10.8 mm
        expect(coreWidth({ s: 10, dist: 1, pixelAngle: 0.001 })).toBeCloseTo(0.01077, 4)
        // 50 m from the eye at 1.556 mrad a pixel (fov 70°, 900 px): the pixel (78 mm) wins over the beam
        expect(coreWidth({ s: 10, dist: 50, pixelAngle: 1.556e-3 })).toBeCloseTo(0.0778, 4)
        expect(MIN_CORE_PX).toBe(1)
    })

    it('splits the scattered light by Beer–Lambert and spreads the halo by Fermi–Eyges', () => {
        expect(haloShare(0.02, 0)).toBe(0)
        expect(haloShare(0.02, 10)).toBeCloseTo(1 - Math.exp(-0.2), 6)
        // √((2/3)·0.02·2·0.3·10³) = √8 = 2.83 m
        expect(haloRadius(0.02, 0.7, 10)).toBeCloseTo(Math.sqrt(8), 6)
        expect(haloRadius(0, 0.7, 10)).toBe(0)
        // a sharper forward lobe (larger g) spreads less
        expect(haloRadius(0.02, 0.9, 10)).toBeLessThan(haloRadius(0.02, 0.7, 10))
    })

    it('holds a fan of lines apart: no halo wider than half the gap to the next line', () => {
        // MOXIR cube fan: 6 lines over 0.090 rad, 18 mrad apart; at 10 m the gap is 0.18 m
        expect(haloRadiusCapped(0.02, 0.7, 10, 0.018)).toBeCloseTo(0.09, 6)
        expect(haloRadiusCapped(0.02, 0.7, 10)).toBeCloseTo(Math.sqrt(8), 6)
    })

    it('keeps what a pixel sums: core·W + halo·√(2π)·r = the line intensity per length, capped or not', () => {
        const a = { sigmaS: 0.02, g: 0.7, flux: 3.61, cosTheta: 0, s: 10, d: 0, dist: 10, pixelAngle: 8.09e-4 }
        const c = coreHalo(a)
        const r0 = haloRadius(0.02, 0.7, 10)
        expect(c.haloRadius).toBeCloseTo(r0, 12)
        expect(c.core * c.coreWidth + c.halo * Math.sqrt(2 * Math.PI) * c.haloRadius).toBeCloseTo(c.perLength, 9)
        expect(c.perLength).toBeCloseTo(lineLuminance({ ...a, width: 1 }), 12)
        // the core outshines its halo by far: a laser reads as a line
        expect(c.core / c.halo).toBeGreaterThan(50)
        // a capped halo is narrower and carries the same share (shader job 2): its light is kept, its peak rises
        const k = coreHalo({ ...a, spacingRad: 0.018 })
        expect(k.haloRadius).toBeCloseTo(0.5 * 0.018 * 10, 12)
        expect(k.core * k.coreWidth + k.halo * Math.sqrt(2 * Math.PI) * k.haloRadius).toBeCloseTo(k.perLength, 9)
        expect(k.halo).toBeGreaterThan(c.halo)
    })

    it('the owner\'s comb at 20 m: white core, coloured halo, six lines still six', () => {
        // the 2026-10-15 diagnosis: eye 41 m away, 1.556 mrad a pixel, cube lines 18 mrad apart
        const px = 1.556e-3
        const at = { sigmaS: 0.02, g: 0.7, flux: 1, cosTheta: 0.95, s: 20, d: 41, dist: 41, pixelAngle: px, spacingRad: 0.018 }
        const c = coreHalo(at)
        // across a comb of such lines: the light at a line's axis against the light midway to the next (two halos, no core)
        const gap = 0.018 * 20
        const r = c.haloRadius
        const peak = c.core + c.halo * (1 + 2 * Math.exp(-(gap * gap) / (2 * r * r)))
        const valley = 2 * c.halo * Math.exp(-(gap * gap) / (8 * r * r))
        // Rayleigh's criterion: two lines read as two while the dip between them falls below ~0.735 of the peak
        expect(valley / peak).toBeLessThan(0.735)
        expect(gap / (41 * px)).toBeGreaterThan(5) // and they are more than five pixels apart there
        // the halo is visible next to the core (a few % to tens of % of it), not a fog of 0.1 %
        expect(c.halo / c.core).toBeGreaterThan(0.02)
        expect(c.halo / c.core).toBeLessThan(0.5)
    })

    it('lineSpacings: nearest neighbour in the fan; a lone line takes the cube\'s scan step', () => {
        const fan = [-2, -1, 0, 1, 2].map((k) => fieldDirection(k * 0.1, 0))
        const sp = lineSpacings(fan)
        const step = 0.1 * 18.5 * Math.PI / 180
        sp.forEach((a) => expect(a).toBeCloseTo(step, 2))
        expect(lineSpacings([[0, -1, 0]])).toEqual([LONE_LINE_SPACING_RAD])
        expect(LONE_LINE_SPACING_RAD).toBeCloseTo(SCAN_STEP_DEG * Math.PI / 180, 12)
        // two sub-lines that point the same way are not each other's neighbour
        expect(lineSpacings([[0, -1, 0], [0, -1, 0]])).toEqual([LONE_LINE_SPACING_RAD, LONE_LINE_SPACING_RAD])
        expect(lineSpacings(null)).toEqual([])
    })

    it('laserSpot: a Lambertian dot as wide as the beam, its light kept when drawn wider', () => {
        // 4 mm + 1 mrad: 4.0 cm at 40 m, 6.0 cm at 60 m (the brief's 4–6 cm)
        expect(laserSpot({ s: 40 }).beamWidth).toBeCloseTo(0.0402, 3)
        expect(laserSpot({ s: 60 }).beamWidth).toBeCloseTo(0.0601, 3)
        const near = laserSpot({ flux: 2, s: 40, sigmaT: 0, dist: 5, pixelAngle: 1e-3 }) // beam wider than a pixel
        expect(near.width).toBeCloseTo(near.beamWidth, 12)
        expect(near.luminance).toBeCloseTo((SPOT_ALBEDO * 2) / (Math.PI * Math.PI * near.width * near.width / 4), 6)
        // seen from far, drawn as one pixel: L·A (the dot's light) is the same
        const far = laserSpot({ flux: 2, s: 40, sigmaT: 0, dist: 60, pixelAngle: 1.556e-3 })
        expect(far.width).toBeGreaterThan(far.beamWidth)
        expect(far.luminance * far.width ** 2).toBeCloseTo(near.luminance * near.width ** 2, 9)
        // Beer–Lambert on the way to the wall
        expect(laserSpot({ flux: 2, s: 40, sigmaT: 0.02, dist: 5 }).luminance / near.luminance).toBeCloseTo(Math.exp(-0.8), 9)
    })

    it('the geometry carries each line\'s spacing, and one dot per line that met a surface', () => {
        const lines = [
            { dir: [0, -1, 0], flux: [0, 1, 0], length: 30, spacing: 0.018, spot: true },
            { dir: [0, -1, 0], flux: [0, 1, 0], length: 12, spot: false }
        ]
        const g = laserLineGeometry(lines, 20, 4)
        const sp = g.getAttribute('aSpacing').array
        expect(sp[0]).toBeCloseTo(0.018, 6)
        expect(sp[sp.length - 1]).toBeCloseTo(LONE_LINE_SPACING_RAD, 6)
        const dots = laserSpotGeometry(lines)
        expect(dots.userData.spotCount).toBe(1)
        expect(dots.getAttribute('aS').array[0]).toBe(30)
        expect(dots.index.count).toBe(6)
    })

    it('a 40 W line is brighter per length than a cube line by its flux ratio, whatever the width', () => {
        const cube = laserColourFlux({ mW: [666.667, 333.333, 250] }).lumens
        const forty = laserColourFlux({ mW: [16000, 15000, 10000] }).lumens
        const at = { sigmaS: 0.02, g: 0.7, cosTheta: 0.5, s: 10, d: 10, dist: 10, pixelAngle: 1e-3 }
        expect(coreHalo({ ...at, flux: forty }).perLength / coreHalo({ ...at, flux: cube }).perLength).toBeCloseTo(forty / cube, 9)
        expect(forty / cube).toBeGreaterThan(40)
    })
})
