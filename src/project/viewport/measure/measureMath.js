// MEASUREMENT MODE — the numbers (pure; the GPU half is measureProbes.js, the scene's half
// MeasurementMode.jsx). docs/architecture/MEASUREMENT_MODE.md says what each number means.
//
// Units. The scene's lamps are three.js SpotLights whose `intensity` is candela × the rig's
// ONE `sceneScale` (scripts/place/rig-lib.mjs "PHOTOMETRY"; MOXIR 0.02), lengths are metres
// and `decay` 2 is the inverse-square law. So a linear value read back from the renderer
// (before tone mapping) is a radiance in "scene units"; ÷ sceneScale it is cd/m². Every
// result here carries both, and says where its sceneScale came from.
//
// Exposure. A picture is a camera at a stated EV100 (Lagarde & de Rousiers, "Moving
// Frostbite to Physically Based Rendering", SIGGRAPH 2014 course notes §5.1, after ISO 12232
// saturation-based speed): the luminance L (cd/m²) enters the tone curve as
//     L / (1.2 · 2^EV100)
// three.js multiplies the curve's input by renderer.toneMappingExposure, and its ACES
// operator by a further 1/0.6 (three.js tonemapping_pars_fragment, ACESFilmicToneMapping:
// `color *= toneMappingExposure / 0.6`). That factor is counted as part of the camera here,
// so changing the operator never changes the stated exposure silently. Hence
//     curve input = toneMappingExposure · k_op · sceneScale · L
//     EV100 = log2( 1 / (1.2 · toneMappingExposure · k_op · sceneScale) )
import { ACESFilmicToneMapping } from 'three'

/** The ISO 12232 saturation-based constant in Lagarde's exposure (78 / (100 · 0.65)). */
export const SATURATION_K = 1.2

/** The largest finite IEEE 754 half-float (the readback target's ceiling). */
export const HALF_FLOAT_MAX = 65504

/**
 * Relative luminance weights of linear sRGB / Rec.709 primaries, D65 white
 * (ITU-R BT.709-6 item 3.3; the same primaries as IEC 61966-2-1 sRGB).
 */
export const REC709_Y = Object.freeze([0.2126, 0.7152, 0.0722])

/** The scale three's tone-mapping operator puts on its input on top of toneMappingExposure. */
export const operatorInputScale = (toneMapping) => (toneMapping === ACESFilmicToneMapping ? 1 / 0.6 : 1)

const positive = (n) => Number.isFinite(Number(n)) && Number(n) > 0

/** toneMappingExposure that gives `ev100` (see the header). */
export const exposureForEv100 = (ev100, { sceneScale = 1, toneMapping } = {}) => {
    if (!Number.isFinite(Number(ev100))) throw new Error(`EV100 must be a number, got ${ev100}`)
    if (!positive(sceneScale)) throw new Error(`sceneScale must be > 0, got ${sceneScale}`)
    return 1 / (SATURATION_K * 2 ** Number(ev100) * Number(sceneScale) * operatorInputScale(toneMapping))
}

/** The EV100 a scene's toneMappingExposure stands for (see the header). */
export const ev100ForExposure = (exposure, { sceneScale = 1, toneMapping } = {}) => {
    if (!positive(exposure)) throw new Error(`toneMappingExposure must be > 0, got ${exposure}`)
    if (!positive(sceneScale)) throw new Error(`sceneScale must be > 0, got ${sceneScale}`)
    return Math.log2(1 / (SATURATION_K * Number(exposure) * Number(sceneScale) * operatorInputScale(toneMapping)))
}

/** Luminance Y of a linear Rec.709 RGB triple (same units in as out). */
export const luminanceOf = (r, g, b) => REC709_Y[0] * r + REC709_Y[1] * g + REC709_Y[2] * b

/**
 * Illuminance on a virtual lux probe: an ideal Lambertian patch of reflectance ρ = 1 reflects
 * L = ρ·E/π in every direction (three.js BRDF_Lambert = diffuse/π), so E = π·L/ρ.
 */
export const illuminanceFromPatch = (L, rho = 1) => (Math.PI * L) / rho

/** True when a read-back channel hit the half-float ceiling (or is not a number). */
export const overflowed = (...channels) => channels.some((c) => !Number.isFinite(c) || Math.abs(c) >= HALF_FLOAT_MAX)

/** Mean of RGBA float pixels (stride 4) → [r, g, b], and whether any pixel overflowed. */
export const meanRgb = (pixels) => {
    const n = Math.floor(pixels.length / 4)
    let r = 0
    let g = 0
    let b = 0
    let over = false
    for (let i = 0; i < n; i += 1) {
        const R = pixels[i * 4]
        const G = pixels[i * 4 + 1]
        const B = pixels[i * 4 + 2]
        if (overflowed(R, G, B)) over = true
        r += R
        g += G
        b += B
    }
    return { rgb: n ? [r / n, g / n, b / n] : [0, 0, 0], overflow: over, pixels: n }
}

/** A scene-unit value in physical units, or null when the scale is not known. */
export const toPhysical = (sceneValue, sceneScale) => (positive(sceneScale) ? sceneValue / Number(sceneScale) : null)

const median = (xs) => {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// where the profile first falls to `level` walking outward from the peak, linearly interpolated
const crossing = (xs, ys, peak, level, step) => {
    for (let i = peak; i + step >= 0 && i + step < ys.length; i += step) {
        const a = ys[i]
        const b = ys[i + step]
        if (b <= level) return xs[i] + ((a - level) / (a - b || 1e-30)) * (xs[i + step] - xs[i])
    }
    return null
}

/**
 * A beam's cross-section: samples `{ x, L }` (x in metres across the beam, L its luminance).
 * The background is the median of the outer `edgeShare` of samples on both sides, and is
 * subtracted before the widths are found. Widths are full widths at 50 % and 10 % of the
 * peak above background (the CIE/IES beam and field definitions, applied to the profile);
 * null when the profile never falls that far inside the sampled span. `integral` is ∫(L − bg)dx
 * by the trapezoid rule (cd/m² · m when L is in cd/m²).
 */
export const profileStats = (samples, { edgeShare = 0.1 } = {}) => {
    const pts = (samples || []).filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.L)).sort((a, b) => a.x - b.x)
    if (pts.length < 3) return { background: 0, peak: 0, peakX: null, width50: null, width10: null, integral: 0, samples: pts.length }
    const k = Math.max(1, Math.floor(pts.length * edgeShare))
    const background = median([...pts.slice(0, k), ...pts.slice(-k)].map((p) => p.L))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.L - background)
    let peak = 0
    for (let i = 1; i < ys.length; i += 1) if (ys[i] > ys[peak]) peak = i
    const width = (fraction) => {
        const level = ys[peak] * fraction
        const left = crossing(xs, ys, peak, level, -1)
        const right = crossing(xs, ys, peak, level, 1)
        return left === null || right === null ? null : right - left
    }
    let integral = 0
    for (let i = 1; i < xs.length; i += 1) integral += ((ys[i] + ys[i - 1]) / 2) * (xs[i] - xs[i - 1])
    return { background, peak: ys[peak], peakX: xs[peak], width50: width(0.5), width10: width(0.1), integral, samples: pts.length }
}

/** Relative error (measured − expected) / expected. */
export const relativeError = (measured, expected) => (measured - expected) / expected
