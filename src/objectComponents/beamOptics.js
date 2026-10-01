// WHAT IS IN THE BEAM'S PATH — prism, honeycomb, frost and gobo — drawn inside the
// beam's own hull (beamAirMaterial.js), no extra draw calls. `components.beam.optics`,
// set by the desk's DMX (dmxDecode.js → dmxPose.js) or by a look:
//
//   { prism:     { facets: 16, rotation: rad }   a radial prism: the beam split into a
//                                                ring of `facets` beams, each tilted out
//                                                by PRISM_SPREAD_DEG from the axis
//     honeycomb: { rotation: rad }               a multi-facet prism: a centre beam and
//                                                six round it, HONEYCOMB_SPREAD_DEG out
//     frost:     0..1                            a diffuser: the beam widens and its
//                                                edge goes soft
//     gobo:      { pattern: 1..17, rotation }    a metal stencil in the beam's focal
//                                                plane: the beam carries its shape }
//
// The physics, each stated once:
//   - A prism facet passes its share of the light: a radial prism of N facets gives N
//     beams of 1/N the candela each, at the same width; a honeycomb gives 7 of 1/7. Both
//     in: N × 7 beams (the shader draws the nearest of them, see below).
//   - Frost spreads the same flux over a wider cone: the beam angle × (1 + FROST_WIDEN·f),
//     the candela ÷ that factor squared (flux kept), and the edge goes Gaussian.
//   - A gobo blocks light; what it lets through is its pattern, sharp at focus.
//
// ASSUMED, and said so: the B380F's prism spreads (no maker figure; a 16-facet beam
// prism on a 2° spot fans to a ring ~10° across — 5° per side), and the GOBO SHAPES —
// no image of the B380F's wheel was found (fixtures.json: "fixed gobo wheel 13+open,
// rotating gobo wheel"); the 17 patterns here are the shapes such wheels carry (spokes,
// dot rings, rings, a breakup, stars, triangles), drawn procedurally, so a look reads
// as "a gobo" in the haze, not as the real one. Replace with the real images when the
// rental house sends the wheel.

import { beamProfileAt } from './beamAir.js'

export const PRISM_SPREAD_DEG = 5
export const HONEYCOMB_SPREAD_DEG = 3.5
export const FROST_WIDEN = 2
export const GOBO_PATTERNS = 17

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

/** The optics a beam carries, cleaned; every part null/0 when absent. */
export const beamOpticsOf = (beam) => {
    const o = beam?.optics
    if (!o || typeof o !== 'object') return { prism: null, honeycomb: null, frost: 0, gobo: null }
    const prism = o.prism && typeof o.prism === 'object'
        ? { facets: clamp(Math.round(num(o.prism.facets, 16)), 2, 32), rotation: num(o.prism.rotation, 0) }
        : null
    const honeycomb = o.honeycomb && typeof o.honeycomb === 'object' ? { rotation: num(o.honeycomb.rotation, 0) } : null
    const pattern = Math.round(num(o.gobo?.pattern, 0))
    const gobo = pattern >= 1 && pattern <= GOBO_PATTERNS ? { pattern, rotation: num(o.gobo.rotation, 0) } : null
    return { prism, honeycomb, frost: clamp(num(o.frost, 0), 0, 1), gobo }
}

/** How much wider the hull must reach for these optics: added tan of the half-angle. */
export const opticsSpreadTan = (optics) =>
    (optics.prism ? Math.tan((PRISM_SPREAD_DEG * Math.PI) / 180) : 0) +
    (optics.honeycomb ? Math.tan((HONEYCOMB_SPREAD_DEG * Math.PI) / 180) : 0)

/** The beam angle's widening under frost (and the candela falls by its square). */
export const frostWiden = (frost) => 1 + FROST_WIDEN * clamp(num(frost, 0), 0, 1)

// ---- the gobo shapes: a stencil's transmission at (u, a) — u the radius in beam radii,
// a the angle round the axis. JS twin of the shader's goboMask(); 1 = open. -------------
const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
}
const fract = (x) => x - Math.floor(x)
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)

export const goboMask = (pattern, u, a, soft = 0.06) => {
    if (!pattern) return 1
    const family = (pattern - 1) % 6
    const n = 3 + Math.floor((pattern - 1) / 6) * 2 // 3, 5, 7 of each family across the 17
    if (family === 0) {
        // spokes: n radial bars
        const bar = Math.abs(Math.sin((n * a) / 2))
        return smooth(0.55 - soft * 4, 0.55 + soft * 4, bar)
    }
    if (family === 1) {
        // a ring of n dots
        const k = Math.round((a * n) / (2 * Math.PI))
        const da = a - (k * 2 * Math.PI) / n
        const dx = u * Math.cos(da) - 0.6
        const dy = u * Math.sin(da)
        return 1 - smooth(0.18 - soft, 0.18 + soft, Math.hypot(dx, dy))
    }
    if (family === 2) {
        // concentric rings
        const r = fract(u * (n * 0.5 + 0.5))
        return smooth(0.35 - soft * 2, 0.35 + soft * 2, Math.abs(r - 0.5) * 2)
    }
    if (family === 3) {
        // breakup: a cellular stencil
        const cx = Math.floor(u * Math.cos(a) * (n + 2))
        const cy = Math.floor(u * Math.sin(a) * (n + 2))
        return hash2(cx + pattern, cy) > 0.45 ? 1 : 0
    }
    if (family === 4) {
        // a star of n points
        const star = 0.45 + 0.35 * Math.cos(n * a)
        return 1 - smooth(star - soft, star + soft, u)
    }
    // an n-sided polygon (a triangle first)
    const seg = (2 * Math.PI) / n
    const local = ((a % seg) + seg) % seg - seg / 2
    const edge = Math.cos(seg / 2) / Math.cos(local)
    return 1 - smooth(0.75 * edge - soft, 0.75 * edge + soft, u)
}

// The same, in GLSL, for beamAirMaterial.js — line for line with goboMask above.
export const GOBO_GLSL = /* glsl */`
float goboSmooth(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float goboHash(float x, float y) { return fract(sin(x * 127.1 + y * 311.7) * 43758.5453); }
float goboMask(float pattern, float u, float a, float soft) {
    if (pattern < 0.5) return 1.0;
    float family = mod(pattern - 1.0, 6.0);
    float n = 3.0 + floor((pattern - 1.0) / 6.0) * 2.0;
    if (family < 0.5) {
        float bar = abs(sin(n * a * 0.5));
        return goboSmooth(0.55 - soft * 4.0, 0.55 + soft * 4.0, bar);
    }
    if (family < 1.5) {
        float k = floor(a * n / 6.2831853 + 0.5);
        float da = a - k * 6.2831853 / n;
        float dx = u * cos(da) - 0.6;
        float dy = u * sin(da);
        return 1.0 - goboSmooth(0.18 - soft, 0.18 + soft, length(vec2(dx, dy)));
    }
    if (family < 2.5) {
        float r = fract(u * (n * 0.5 + 0.5));
        return goboSmooth(0.35 - soft * 2.0, 0.35 + soft * 2.0, abs(r - 0.5) * 2.0);
    }
    if (family < 3.5) {
        float cx = floor(u * cos(a) * (n + 2.0));
        float cy = floor(u * sin(a) * (n + 2.0));
        return goboHash(cx + pattern, cy) > 0.45 ? 1.0 : 0.0;
    }
    if (family < 4.5) {
        float star = 0.45 + 0.35 * cos(n * a);
        return 1.0 - goboSmooth(star - soft, star + soft, u);
    }
    float seg = 6.2831853 / n;
    float local = mod(a, seg) - seg * 0.5;
    float edge = cos(seg * 0.5) / cos(local);
    return 1.0 - goboSmooth(0.75 * edge - soft, 0.75 * edge + soft, u);
}
`

// ---- the beam's cross-section with its optics: the shader's beamShape(), in JS. -------
// q: the point across the beam (metres, from the axis), R: one beam's radius at this
// depth (aperture + s·tan, frost included), p: the profile's exponent, s: the depth.
// Returns the light there as a fraction of the plain beam's centre.

// One part's light across it, before any gobo.
const part = (qx, qy, R, p) => beamProfileAt(Math.hypot(qx, qy) / Math.max(R, 1e-5), p)

/**
 * The parts of a split beam drawn at a point: the nearest two of the prism's ring, and
 * round each the honeycomb's centre and nearest three — eight candidates, a flat loop
 * (a GPU compiler unrolls nested loops into a program too large to build: ANGLE's
 * Direct3D back end lost the context on ponyo when this was nested). The gobo is cut
 * once, on the nearest part. Where the parts still overlap (near the lens) the beam is
 * drawn as one wider beam carrying the same light (MERGE_FROM … MERGE_TO beam radii).
 */
export const beamShape = (qx, qy, R, p, s, optics) => {
    const prism = Boolean(optics.prism)
    const honey = Boolean(optics.honeycomb)
    if (!prism && !honey) {
        const prof = part(qx, qy, R, p)
        return optics.gobo && prof > 0.001 ? prof * goboMask(optics.gobo.pattern, Math.hypot(qx, qy) / Math.max(R, 1e-5), Math.atan2(qy, qx) - optics.gobo.rotation) : prof
    }
    const dP = prism ? s * Math.tan((PRISM_SPREAD_DEG * Math.PI) / 180) : 0
    const dH = honey ? s * Math.tan((HONEYCOMB_SPREAD_DEG * Math.PI) / 180) : 0
    const spread = dP + dH
    const Rm = R + spread
    const merged = part(qx, qy, Rm, p) * (R / Rm) ** 2
    const nP = prism ? optics.prism.facets : 1
    const stepP = (2 * Math.PI) / nP
    const kP = prism ? Math.floor((Math.atan2(qy, qx) - optics.prism.rotation) / stepP) : 0
    const stepH = Math.PI / 3
    let sum = 0
    let best = 0
    let bx = qx
    let by = qy
    for (let c = 0; c < 8; c += 1) {
        const ip = Math.floor(c / 4)
        const ih = c - ip * 4
        if (!prism && ip > 0) break
        if (!honey && ih > 0) continue
        let cx = 0
        let cy = 0
        if (prism) {
            const th = (kP + ip) * stepP + optics.prism.rotation
            cx += dP * Math.cos(th)
            cy += dP * Math.sin(th)
        }
        if (honey && ih > 0) {
            const kH = Math.floor((Math.atan2(qy - cy, qx - cx) - optics.honeycomb.rotation) / stepH + 0.5)
            const th = (kH + ih - 2) * stepH + optics.honeycomb.rotation
            cx += dH * Math.cos(th)
            cy += dH * Math.sin(th)
        }
        const prof = part(qx - cx, qy - cy, R, p)
        sum += prof
        if (prof > best) {
            best = prof
            bx = qx - cx
            by = qy - cy
        }
    }
    let apart = sum / (nP * (honey ? 7 : 1))
    if (optics.gobo && best > 0.001) apart *= goboMask(optics.gobo.pattern, Math.hypot(bx, by) / Math.max(R, 1e-5), Math.atan2(by, bx) - optics.gobo.rotation)
    const w = smooth(MERGE_FROM, MERGE_TO, spread / Math.max(R, 1e-5))
    return merged + (apart - merged) * w
}

// Where a split beam's parts still overlap they are drawn as one (above).
export const MERGE_FROM = 1
export const MERGE_TO = 2

export const BEAM_SHAPE_GLSL = /* glsl */`
uniform float uPrismN;   // facets of the radial prism, 0 = out
uniform float uPrismTan; // tan of its spread
uniform float uPrismRot;
uniform float uHoney;    // 1 = the honeycomb is in
uniform float uHoneyTan;
uniform float uHoneyRot;
uniform float uGobo;     // pattern 1..17, 0 = open
uniform float uGoboRot;
${GOBO_GLSL}
float profileAt(float u, float p) { return exp(-0.693147 * pow(u, p)); }
float beamShape(vec2 q, float R, float p, float s) {
    bool prism = uPrismN > 0.5;
    bool honey = uHoney > 0.5;
    if (!prism && !honey) {
        float prof = profileAt(length(q) / max(R, 1e-5), p);
        if (uGobo > 0.5 && prof > 0.001) prof *= goboMask(uGobo, length(q) / max(R, 1e-5), atan(q.y, q.x) - uGoboRot, 0.06);
        return prof;
    }
    float dP = prism ? s * uPrismTan : 0.0;
    float dH = honey ? s * uHoneyTan : 0.0;
    float spread = dP + dH;
    float Rm = R + spread;
    float merged = profileAt(length(q) / Rm, p) * (R / Rm) * (R / Rm);
    float nP = prism ? uPrismN : 1.0;
    float stepP = 6.2831853 / nP;
    float kP = prism ? floor((atan(q.y, q.x) - uPrismRot) / stepP) : 0.0;
    float stepH = 1.0471976;
    float sum = 0.0;
    float best = 0.0;
    vec2 bestQ = q;
    for (int c = 0; c < 8; c++) {
        int ip = c / 4;
        int ih = c - ip * 4;
        if (!prism && ip > 0) break;
        if (!honey && ih > 0) continue;
        vec2 centre = vec2(0.0);
        if (prism) {
            float th = (kP + float(ip)) * stepP + uPrismRot;
            centre += dP * vec2(cos(th), sin(th));
        }
        if (honey && ih > 0) {
            vec2 rel = q - centre;
            float kH = floor((atan(rel.y, rel.x) - uHoneyRot) / stepH + 0.5);
            float th = (kH + float(ih - 2)) * stepH + uHoneyRot;
            centre += dH * vec2(cos(th), sin(th));
        }
        vec2 local = q - centre;
        float prof = profileAt(length(local) / max(R, 1e-5), p);
        sum += prof;
        if (prof > best) { best = prof; bestQ = local; }
    }
    float apart = sum / (nP * (honey ? 7.0 : 1.0));
    if (uGobo > 0.5 && best > 0.001) apart *= goboMask(uGobo, length(bestQ) / max(R, 1e-5), atan(bestQ.y, bestQ.x) - uGoboRot, 0.06);
    float w = goboSmooth(${MERGE_FROM.toFixed(1)}, ${MERGE_TO.toFixed(1)}, spread / max(R, 1e-5));
    return mix(merged, apart, w);
}
`
