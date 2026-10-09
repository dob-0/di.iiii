// A LASER IN HAZE, AS A LINE SOURCE — the arithmetic (no three import; laserLineMaterial.js is the
// same formulas in GLSL, and laserLine.test.js pins them).
//
// A laser beam is millimetres wide and spreads by about a milliradian: the LaserCube Ultra MK2 leaves
// its aperture 4 mm wide with 1 mrad divergence (maker's Guide v1.2 pp. 11-12; whether these are 1/e or
// 1/e² values, full or half angle, is NOT stated — read here as full width and full angle). Drawn as a
// spot lamp's cone it was 20× too wide and carried ~6,000× too little light (MOXIR simulation audit
// §2.4). Here it is what it is: a line of light.
//
// 1. FLUX PER COLOUR. Each diode's radiant power P (W) at its wavelength λ gives luminous flux
//        Φv = Km · V(λ) · P,     Km = 683 lm/W
//    (SI definition of the candela, BIPM SI Brochure 9th ed.; V(λ) the CIE 1924 photopic luminous
//    efficiency = ȳ(λ) of the CIE 1931 2° observer). 6 W cube (2.7 / 1.5 / 1.8 W at 455 / 525 / 638 nm):
//    88 + 813 + 235 = 1136 lm. The owner's cubes are the 7.5 W variant (4.0 / 2.0 / 1.5 W, Manual v1.0 p. 11; owner
//    2026-10-09): 131 + 1084 + 196 = 1410 lm. The rig reads the variant from fixtures.json (variant_in_use).
//
// 2. BRIGHTNESS IN HAZE. A beam element dl scatters intensity dI = σs · p(θ) · Φ · dl toward an eye at
//    scattering angle θ (between the beam's direction and the direction to the eye). Seen from the side
//    it is a strip of length dl·sinθ and width w, so its luminance is
//        L = σs · p(θ) · Φ · T / (w · sinθ)        [cd/m² when Φ is in lm]
//    T = exp(−σt·(s + d)) Beer–Lambert along the beam (s from the aperture) and toward the eye (d);
//    p = Henyey–Greenstein (ApJ 93, 1941) with g from atmosphere.anisotropy (0.74 for the kit:
//    lasers-exact.md §3.2, an own Mie computation for 0.3-1 µm glycol droplets; ASSUMPTION).
//    (lasers-exact.md §3.1 and §4; the same single-scattering model as beamAir.js.)
//
// 3. NARROWER THAN A PIXEL. At 60 m the beam is 6 cm wide: far under a pixel from the floor. The line
//    is DRAWN at least `MIN_PIXELS` pixels wide, and its luminance is that of the drawn width W, not the
//    beam's own w: L·W = σs·p·Φ·T / sinθ is kept, so what a pixel sums (the line's intensity per unit
//    length) is right whatever width it is drawn at (lasers-exact.md §4 formula 4).
//
// 4. A SCANNED SHAPE. The cube traces the points of a frame in order, again and again, at a fixed point
//    rate: each point holds 1/N of the time. A camera or an eye integrates over many frames, so a segment
//    from point i to point i+1 is a SHEET of light carrying Φ·drive·(1/N) — its duty share — spread over
//    its angle. Drawn as sub-lines every SCAN_STEP_DEG, each with its share. A blank move (0,0,0) carries
//    nothing. The frame format is the laser frame of the Nodes editor (shared/laserFrame on PR #776:
//    points [x, y, r, g, b], x, y −1…1 in the cube's field, colour 0…1); read here without depending on it.
//
// 5. COLOUR. 455 and 525 nm lie OUTSIDE the sRGB gamut: no screen shows them. Each line's CIE 1931 XYZ
//    (x̄, ȳ, z̄ at its wavelength, scaled to its flux) is converted to linear Rec.709 (IEC 61966-2-1
//    matrix) and, where a channel goes negative, DESATURATED toward the grey of the same luminance until
//    it is in gamut (Y kept). A stated choice of gamut mapping, not a standard one; the picture's
//    luminance is right, its saturation is less than the laser's.
//
// Limits, stated: single scattering (no glow from multiple scattering); a scanned shape's sub-lines all
// run to the same length (the beam's measured throw), not each to the surface it meets; the beam's spot on
// the surface it ends on is not drawn (a 4-6 cm dot); diode power is taken as linear in the drive level;
// the cube's field half-angle (FIELD_HALF_DEG) reads the maker's ">37°" as ±18.5° optical — an ASSUMPTION.

export const KM = 683 // lm/W, the luminous efficacy of 540 THz radiation (SI)

// CIE 1931 2° colour-matching functions at the cube's three wavelengths, 1 nm table: x̄, ȳ, z̄.
// Source: CVRL (UCL Colour & Vision Research Laboratory), ciexyz31_1.csv — the CIE 1931 2° standard
// observer at 1 nm as tabulated by the CIE (CIE 015 / ISO/CIE 11664-1); fetched 2026-10-09 from
// http://www.cvrl.org/database/data/cmfs/ciexyz31_1.csv. ȳ = V(λ) (cvrl vl1924e_1.csv agrees).
export const CMF_1931 = {
    455: [0.3187, 0.048, 1.7441],
    525: [0.1096, 0.7932, 0.05725001],
    638: [0.4847436, 0.1911552, 0.00002364]
}
export const CMF_SOURCE = 'CIE 1931 2° observer, 1 nm (CVRL ciexyz31_1.csv, fetched 2026-10-09)'

// The LaserCube's wavelengths, in the order of a frame's colour (r, g, b): 638, 525, 455 nm.
export const CUBE_NM = [455, 525, 638]
export const DRIVE_ORDER = { 638: 0, 525: 1, 455: 2 }

export const FIELD_HALF_DEG = 18.5
export const SCAN_STEP_DEG = 0.5
export const MAX_SCAN_LINES = 240
export const MIN_PIXELS = 1.5
// Looking straight down a beam, 1/sinθ has no bound: the strip becomes a disc. Held here.
export const MIN_SIN = 0.01

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

/** V(λ) at a cube wavelength (the CIE 1931 ȳ). */
export const vLambda = (nm) => {
    const row = CMF_1931[nm]
    if (!row) throw new Error(`no colour-matching data at ${nm} nm`)
    return row[1]
}

/** Luminous flux (lm) of each diode: Km · V(λ) · P, P in mW. */
export const laserFlux = (mW, nm = CUBE_NM) => nm.map((l, i) => (KM * vLambda(l) * Math.max(num(mW?.[i]), 0)) / 1000)

// XYZ → linear Rec.709 / sRGB primaries, D65 (IEC 61966-2-1:1999).
const M = [
    [3.2406, -1.5372, -0.4986],
    [-0.9689, 1.8758, 0.0415],
    [0.0557, -0.204, 1.057]
]
// the luminance of linear Rec.709 (the matrix's own Y row: ITU-R BT.709)
const LUMA = [0.2126, 0.7152, 0.0722]
export const xyzToLinearRgb = ([X, Y, Z]) => M.map((r) => r[0] * X + r[1] * Y + r[2] * Z)
export const lumaOf = (rgb) => LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2]

/**
 * Into gamut at constant luminance: rgb moved toward the grey (Y, Y, Y) of the same luminance just far
 * enough that no channel is negative. Returns { rgb, desaturated } (0 = untouched, 1 = grey).
 */
export const gamutMapConstantY = (rgb) => {
    const Y = lumaOf(rgb)
    if (rgb.every((c) => c >= 0)) return { rgb: rgb.slice(), desaturated: 0 }
    if (!(Y > 0)) return { rgb: [0, 0, 0], desaturated: 1 }
    // c(t) = c + t·(Y − c) ≥ 0 for every channel: t ≥ −c / (Y − c) where c < 0
    let t = 0
    for (const c of rgb) if (c < 0) t = Math.max(t, -c / (Y - c))
    return { rgb: rgb.map((c) => Math.max(0, c + t * (Y - c))), desaturated: t }
}

/** The linear Rec.709 colour of 1 lm of a monochromatic line at `nm` (luminance 1), gamut-mapped. */
export const linePerLumen = (nm) => {
    const [x, y, z] = CMF_1931[nm]
    return gamutMapConstantY(xyzToLinearRgb([x / y, 1, z / y]))
}

/**
 * A cube's light at a drive level per diode: the summed colour in linear Rec.709, scaled so its luminance
 * IS the luminous flux (lm), and that flux. `drive` is [r, g, b] 0…1 as a frame carries it (r = 638 nm,
 * g = 525 nm, b = 455 nm); diode power is taken as linear in the drive (ASSUMED).
 */
export const laserColourFlux = ({ mW, nm = CUBE_NM, drive = [1, 1, 1] } = {}) => {
    const flux = laserFlux(mW, nm)
    const rgb = [0, 0, 0]
    let lumens = 0
    nm.forEach((l, i) => {
        const d = clamp(num(drive[DRIVE_ORDER[l]], 0), 0, 1)
        const phi = flux[i] * d
        lumens += phi
        const c = linePerLumen(l).rgb
        for (let k = 0; k < 3; k += 1) rgb[k] += c[k] * phi
    })
    return { rgb, lumens }
}

/** A hex colour (#rrggbb) read as the cube's drive per channel (what the cube gets — no sRGB decoding). */
export const driveOfHex = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
    if (!m) return [1, 1, 1]
    const v = parseInt(m[1], 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255)
}

/** Henyey–Greenstein phase function, 1/sr. */
export const hgPhase = (cosTheta, g) => {
    const gg = clamp(num(g, 0.7), -0.95, 0.95)
    return (1 - gg * gg) / (4 * Math.PI * Math.pow(1 + gg * gg - 2 * gg * clamp(cosTheta, -1, 1), 1.5))
}

/** The beam's width s metres from the aperture (a Gaussian beam's: √(a² + (φ·s)²)), metres. */
export const beamWidth = (s, diameter_mm = 4, divergence_mrad = 1) => Math.hypot(diameter_mm / 1000, (divergence_mrad / 1000) * Math.max(s, 0))

/**
 * Luminance of the line where it is drawn W metres wide (W ≥ the beam's own width), cd/m² per lm of Φ:
 *   L = σs · p(θ) · Φ · T / (W · sinθ),   T = exp(−σt·(s + d))
 */
export const lineLuminance = ({ sigmaS, sigmaT = sigmaS, g, flux, cosTheta, width, s = 0, d = 0 }) => {
    const sin = Math.max(Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0)), MIN_SIN)
    const T = Math.exp(-Math.max(num(sigmaT), 0) * (Math.max(s, 0) + Math.max(d, 0)))
    return (Math.max(num(sigmaS), 0) * hgPhase(cosTheta, g) * Math.max(num(flux), 0) * T) / (Math.max(width, 1e-9) * sin)
}

/** A frame's points, cleaned the way the Nodes editor's laser frame is: [x, y, r, g, b], x/y −1…1, colour 0…1; bad points dropped. */
export const framePoints = (points, max = 2000) => {
    const out = []
    for (const p of Array.isArray(points) ? points : []) {
        if (out.length >= max) break
        const v = Array.isArray(p) ? p.slice(0, 5).map(Number) : [p?.x, p?.y, p?.r, p?.g, p?.b].map(Number)
        if (v.length < 5 || v.some((n) => !Number.isFinite(n))) continue
        out.push([clamp(v[0], -1, 1), clamp(v[1], -1, 1), clamp(v[2], 0, 1), clamp(v[3], 0, 1), clamp(v[4], 0, 1)])
    }
    return out
}

const DEG = Math.PI / 180
/**
 * The direction of a field point in the LAMP's own frame: a lamp entity throws down its local −Y
 * (spotLightAim.js), so the cube's forward is −Y, its right +X and its up +Z (right × up = forward).
 */
export const fieldDirection = (x, y, fieldHalfDeg = FIELD_HALF_DEG) => {
    const tx = Math.tan(clamp(x, -1, 1) * fieldHalfDeg * DEG)
    const ty = Math.tan(clamp(y, -1, 1) * fieldHalfDeg * DEG)
    const l = Math.hypot(tx, ty, 1)
    return [tx / l, -1 / l, ty / l]
}

/**
 * The lines a cube draws, time-averaged: [{ dir (lamp frame), drive [r,g,b], duty }]. No frame (or an
 * empty one): one static beam straight out, full duty. A frame: each segment i → i+1 (closing the loop)
 * with the colour of point i+1, its duty 1/N spread over sub-lines every `stepDeg`.
 */
export const scanLines = (points, { fieldHalfDeg = FIELD_HALF_DEG, stepDeg = SCAN_STEP_DEG, maxLines = MAX_SCAN_LINES, drive = [1, 1, 1] } = {}) => {
    const pts = framePoints(points)
    if (!pts.length) return [{ dir: [0, -1, 0], drive: drive.slice(), duty: 1 }]
    const N = pts.length
    const segments = []
    let total = 0
    for (let i = 0; i < N; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % N]
        const colour = [b[2], b[3], b[4]]
        if (!(colour[0] > 0 || colour[1] > 0 || colour[2] > 0)) continue
        const angle = Math.hypot(b[0] - a[0], b[1] - a[1]) * fieldHalfDeg
        const k = Math.max(1, Math.ceil(angle / stepDeg))
        segments.push({ a, b, colour, k })
        total += k
    }
    const out = []
    // more lit segments than lines one draw takes: neighbouring segments are merged, each group drawn as
    // one line at its middle with the group's summed duty and mean colour (the flux is kept, detail is not)
    if (segments.length > maxLines) {
        const stride = Math.ceil(segments.length / maxLines)
        for (let i = 0; i < segments.length; i += stride) {
            const group = segments.slice(i, i + stride)
            const mid = group[Math.floor(group.length / 2)]
            const colour = [0, 1, 2].map((c) => group.reduce((sum, g) => sum + g.colour[c], 0) / group.length)
            out.push({ dir: fieldDirection((mid.a[0] + mid.b[0]) / 2, (mid.a[1] + mid.b[1]) / 2, fieldHalfDeg), drive: colour, duty: group.length / N })
        }
        return out
    }
    // too many sub-lines for one draw: every segment keeps its share, in fewer, coarser lines
    const thin = total > maxLines ? maxLines / total : 1
    for (const { a, b, colour, k } of segments) {
        const n = Math.max(1, Math.floor(k * thin))
        for (let j = 0; j < n; j += 1) {
            const t = n === 1 ? 0.5 : (j + 0.5) / n
            out.push({ dir: fieldDirection(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, fieldHalfDeg), drive: colour, duty: 1 / N / n })
        }
    }
    return out
}

/**
 * A lamp's `beam.laser` read for the renderer, or null: the diodes (mW per nm), beam diameter and
 * divergence, the scene's exposure scale, and the frame it holds (if any).
 */
export const laserOf = (beam) => {
    const l = beam?.laser
    if (!l || typeof l !== 'object' || !Array.isArray(l.mW)) return null
    const nm = Array.isArray(l.nm) && l.nm.length === l.mW.length ? l.nm.map(Number) : CUBE_NM
    if (!nm.every((x) => CMF_1931[x])) return null
    return {
        mW: l.mW.map((v) => Math.max(num(v), 0)),
        nm,
        diameter_mm: Math.max(num(l.diameter_mm, 4), 0.1),
        divergence_mrad: Math.max(num(l.divergence_mrad, 1), 0.01),
        sceneScale: num(l.sceneScale, 0.02) > 0 ? num(l.sceneScale, 0.02) : 0.02,
        fieldHalfDeg: clamp(num(l.fieldHalfDeg, FIELD_HALF_DEG), 1, 60),
        frame: Array.isArray(l.frame) ? framePoints(l.frame) : null
    }
}
