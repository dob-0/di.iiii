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

// 7. CORE AND HALO (2026-10-15, owner: "the lasers don't even look like lasers"). What the eye sees of a laser in haze is a
//    thin bright CORE (the singly scattered light, 1. and 2. above, as wide as the beam) and a faint HALO around it: light
//    that scattered more than once on its way out of the beam. The pure arithmetic of both, for the renderer (owed: the
//    shader, laserLineMaterial.js; the measurements are in laserLine.test.js).
//    Core: drawn as wide as the beam, never thinner than MIN_CORE_PX pixels; what a pixel sums is kept (3.).
//    Halo share: of the light singly scattered toward the eye, the part that scatters again over the path s it has already
//    run in the beam's air is 1 − exp(−σs·s) (Beer–Lambert); the core keeps exp(−σs·s). Energy is kept, not lost.
//    Halo radius: small-angle multiple scattering, the Fermi–Eyges result for a pencil beam (Eyges, Phys. Rev. 74, 1948;
//    used for light beams in water by the beam-spread-function literature): the mean square radial spread after a path s
//    is ⟨r²⟩ = (2/3)·σs·⟨θ²⟩·s³, with ⟨θ²⟩ ≈ 2·(1 − g) for a Henyey–Greenstein phase with asymmetry g (⟨cos θ⟩ = g, and
//    1 − cos θ ≈ θ²/2). The halo radius is √⟨r²⟩. ASSUMPTION: HG under-states the sharp forward peak of real glycol-droplet
//    Mie scattering, so this halo is wider and fainter than a real one; it is a stated model, unvalidated against a photo.
//    Cap: no halo is drawn wider than HALO_SPACING_CAP of the angle to the next line of the same fan, so a comb of lines
//    stays a comb of lines. The capped Gaussian still carries the whole haloShare (2026-10-15, shader job 2: the cap
//    corrects the model's too-wide HG halo, it does not throw light away — what a pixel row sums stays I).
//    A line with no neighbour in its own fan (a cube's single static beam) is capped as if its neighbour were
//    LONE_LINE_SPACING_RAD away: the cube's own scan step (SCAN_STEP_DEG), the finest comb a cube draws. ASSUMPTION,
//    unvalidated against a photo: without it a lone line's Fermi–Eyges halo is metres wide (8 m at s 20 m, σs 0.02,
//    g 0.7) and the lines of six cubes, each a separate entity, sum into a fog under the roof again.
export const MIN_CORE_PX = 1
export const HALO_SPACING_CAP = 0.5
export const LONE_LINE_SPACING_RAD = (SCAN_STEP_DEG * Math.PI) / 180

/** The core's drawn width (m): the beam's own width at s, or MIN_CORE_PX pixels at the eye's distance, whichever is wider. */
export const coreWidth = ({ s = 0, dist = 1, pixelAngle = 0.001, diameter_mm = 4, divergence_mrad = 1, minPx = MIN_CORE_PX } = {}) =>
    Math.max(beamWidth(s, diameter_mm, divergence_mrad), Math.max(dist, 0) * Math.max(pixelAngle, 0) * minPx)

/** The share of the scattered light that sits in the halo after a path s (m) in air of σs (1/m): 1 − exp(−σs·s). */
export const haloShare = (sigmaS, s) => 1 - Math.exp(-Math.max(num(sigmaS), 0) * Math.max(num(s), 0))

/** Fermi–Eyges halo radius (m) after a path s: √((2/3)·σs·2(1 − g)·s³). */
export const haloRadius = (sigmaS, g, s) => {
    const gg = clamp(num(g, 0.7), -0.95, 0.95)
    return Math.sqrt((2 / 3) * Math.max(num(sigmaS), 0) * 2 * (1 - gg) * Math.pow(Math.max(num(s), 0), 3))
}

/** The halo radius held under HALO_SPACING_CAP of the gap to the neighbouring line (spacing in radians, at path s). */
export const haloRadiusCapped = (sigmaS, g, s, spacingRad = Infinity) => {
    const r = haloRadius(sigmaS, g, s)
    const cap = Number.isFinite(spacingRad) && spacingRad > 0 ? HALO_SPACING_CAP * spacingRad * Math.max(s, 0) : Infinity
    return Math.min(r, cap)
}

/**
 * A line's look at one point: the intensity per unit length I (= L·W, cd/m per lm of Φ, 2.), the core's luminance over its
 * drawn width, and the halo's peak luminance (a Gaussian of the capped radius r across the line: peak = share·I / (√(2π)·r)).
 * The shader (laserLineMaterial.js) draws exactly this: core·W + halo·√(2π)·r = I.
 */
export const coreHalo = ({ sigmaS, sigmaT = sigmaS, g, flux, cosTheta, s = 0, d = 0, dist = d, pixelAngle = 0.001, diameter_mm = 4, divergence_mrad = 1, spacingRad = Infinity }) => {
    const perLength = lineLuminance({ sigmaS, sigmaT, g, flux, cosTheta, width: 1, s, d })
    const W = coreWidth({ s, dist, pixelAngle, diameter_mm, divergence_mrad })
    const share = haloShare(sigmaS, s)
    const r = haloRadiusCapped(sigmaS, g, s, spacingRad)
    return {
        perLength,
        coreWidth: W,
        core: ((1 - share) * perLength) / W,
        haloRadius: r,
        haloShare: share,
        halo: r > 0 ? (share * perLength) / (Math.sqrt(2 * Math.PI) * r) : 0
    }
}

/**
 * Per line of a fan, the angle (rad) to its nearest neighbour in the same fan — what caps its halo (haloRadiusCapped).
 * A fan of one line: LONE_LINE_SPACING_RAD. Lines that point the same way (two sub-lines of one point) do not count as
 * neighbours. dirs: unit vectors.
 */
export const lineSpacings = (dirs) => {
    const list = Array.isArray(dirs) ? dirs : []
    return list.map((a, i) => {
        let best = Infinity
        for (let j = 0; j < list.length; j += 1) {
            if (j === i) continue
            const b = list[j]
            const c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)
            const angle = Math.acos(c)
            if (angle > 1e-6 && angle < best) best = angle
        }
        return Number.isFinite(best) ? best : LONE_LINE_SPACING_RAD
    })
}

// 8. THE END SPOT (2026-10-15). Where a line meets its first surface (beamReach.js) it lights a dot as wide as the beam
//    there (beamWidth: 4 mm + 1 mrad → 4 cm at 40 m, 6 cm at 60 m). A diffuse (Lambertian) surface of reflectance ρ under
//    illuminance E = Φ·T/A shows the luminance L = ρ·E/π (the definition of a Lambertian reflector; CIE S 017 17-21-087).
//    Drawn at least MIN_CORE_PX wide; a dot drawn wider than the beam is dimmed by the area ratio, so its total light (L·A)
//    stays the beam's. SPOT_ALBEDO 0.3: ASSUMPTION, a mid-grey building surface — the hit does not know its material yet.
export const SPOT_ALBEDO = 0.3

/** The end spot of a line reaching a surface at path s: { width (m, drawn), luminance (per unit Φ the line law uses) }. */
export const laserSpot = ({ flux = 1, s = 0, sigmaT = 0, dist = 1, pixelAngle = 0.001, diameter_mm = 4, divergence_mrad = 1, albedo = SPOT_ALBEDO } = {}) => {
    const w = beamWidth(s, diameter_mm, divergence_mrad)
    const drawn = coreWidth({ s, dist, pixelAngle, diameter_mm, divergence_mrad })
    const area = (Math.PI * drawn * drawn) / 4
    const E = (Math.max(num(flux), 0) * Math.exp(-Math.max(num(sigmaT), 0) * Math.max(num(s), 0))) / area
    return { beamWidth: w, width: drawn, luminance: (clamp(num(albedo, SPOT_ALBEDO), 0, 1) * E) / Math.PI }
}

// 9. WHAT THE SCREEN SHOWS (2026-10-15, owner 15:5x: "white core with colour halo"). The room tone-maps with three.js's
//    ACESFilmicToneMapping (three r185 tonemapping_pars_fragment: Stephen Hill's RRT+ODT fit, sRGB→AP1 input matrix,
//    exposure/0.6). Its input matrix mixes every channel into the other two, so a line far above white saturates all three
//    and reads WHITE, while its dimmer halo stays inside the curve and keeps the laser's colour. No special case: this is
//    the same curve the room applies, reproduced here so the look can be tested without a GPU.
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]]
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]]
const acesFit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
const mul3 = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])

/** Linear HDR rgb → linear display rgb 0…1, as the room's ACESFilmic tone mapping at `exposure` draws it. */
export const toneMapAces = (rgb, exposure = 1) =>
    mul3(ACES_OUT, mul3(ACES_IN, rgb.map((c) => (Math.max(num(c), 0) * exposure) / 0.6)).map(acesFit)).map((c) => clamp(c, 0, 1))

/** How white a displayed colour is: its smallest channel over its largest (1 = white or grey, 0 = a pure primary). */
export const whiteness = (rgb) => {
    const hi = Math.max(...rgb)
    return hi > 0 ? Math.min(...rgb) / hi : 0
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
        const own = [b[2], b[3], b[4]]
        if (!(own[0] > 0 || own[1] > 0 || own[2] > 0)) continue
        // The lamp's colour (the look's, read as drive) scales the frame's own colour per diode, as a projector's DMX
        // colour channels scale the frame it plays; default drive [1, 1, 1] leaves the frame as written.
        const colour = own.map((c, k) => c * (drive[k] ?? 1))
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
 * divergence, the scene's exposure scale, the frame it holds (if any) and its frames in time (if any, see 6.).
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
        frame: Array.isArray(l.frame) ? framePoints(l.frame) : null,
        frames: framesOf(l.frames)
    }
}

// 6. FRAMES IN TIME (2026-10-13, ledger N562). Next to the static `frame`, a laser may hold `frames`:
//    { period, list } — `list` frames played in order, evenly, over `period` seconds, again and again. The frame on at
//    show time t (seconds) is list[floor(((t mod period) / period) · n)]; t is the SERVER's time (serverClock.js), so
//    every viewer draws the same frame. A frame here is a cube's whole drawing for that step (each still scanned at its
//    point rate and time-averaged as in 4.). A laser with `frames` draws them; `frame` is then not read. Without
//    `frames` nothing changes: the static path is the same call as before.
export const MIN_PERIOD_S = 0.05
export const MAX_PERIOD_S = 3600
export const MAX_FRAMES = 256
export const MAX_FRAME_POINTS_TOTAL = 20000

/** `frames` cleaned: { period (s), list: [points…] } with every frame non-empty, or null. */
export const framesOf = (frames) => {
    if (!frames || typeof frames !== 'object' || !Array.isArray(frames.list)) return null
    const period = num(frames.period, 0)
    if (!(period > 0)) return null
    const list = []
    let total = 0
    for (const f of frames.list.slice(0, MAX_FRAMES)) {
        const pts = framePoints(f)
        if (!pts.length) continue
        if (total + pts.length > MAX_FRAME_POINTS_TOTAL) break
        total += pts.length
        list.push(pts)
    }
    return list.length ? { period: clamp(period, MIN_PERIOD_S, MAX_PERIOD_S), list } : null
}

/** Which of `frames.list` is on at show time `t` (seconds): an index, or -1 when there are no frames. */
export const frameIndexAt = (frames, t) => {
    if (!frames?.list?.length || !(frames.period > 0)) return -1
    const n = frames.list.length
    const phase = ((num(t) % frames.period) + frames.period) % frames.period
    return Math.min(n - 1, Math.floor((phase / frames.period) * n))
}

/** The points a laser (laserOf's reading) draws at show time `t`: its frame in time, else its static frame. */
export const laserFrameAt = (laser, t) => {
    const i = frameIndexAt(laser?.frames, t)
    return i >= 0 ? laser.frames.list[i] : laser?.frame || null
}

/** scanLines of what a laser draws at show time `t` (its own field half-angle). */
export const scanLinesAt = (laser, t, opts = {}) => scanLines(laserFrameAt(laser, t), { fieldHalfDeg: laser?.fieldHalfDeg ?? FIELD_HALF_DEG, ...opts })

/** Seconds until the frame on at `t` changes (Infinity when the laser holds no frames in time). */
export const nextFrameIn = (frames, t) => {
    if (!frames?.list?.length || !(frames.period > 0)) return Infinity
    const step = frames.period / frames.list.length
    const phase = ((num(t) % step) + step) % step
    return step - phase
}
