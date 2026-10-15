#!/usr/bin/env node
/**
 * laser-look-diagnose.mjs — the arithmetic of how the room's laser lines are drawn for one camera, from the shader's own
 * formulas (laserLineMaterial.js as of 2026-10-15), with no GPU: per line and point, the drawn ribbon width, its HDR level
 * after the room's exposure (1 = the screen's white before tone mapping), and how many pixels apart the neighbouring lines
 * of the same fan are compared to how wide each is drawn. Read-only.
 *
 *   node scripts/measure/laser-look-diagnose.mjs --doc document.json [--camera '{"position":[..],"target":[..],"fov":70}']
 *        [--drive 0,1,0] [--height 900]
 *
 * Without --camera, the document's presentationState.fixedCamera. σs = renderSettings.atmosphere.scattering (the room's fill;
 * haze jets add to it locally, not counted here), g = atmosphere.anisotropy. `--drive` is the look's colour as a cube drive
 * (r 638, g 525, b 455 nm; default: the lamp's own colour). Units: metres, pixels, HDR level.
 *
 * `before` = the ribbon shader up to 2026-10-15 (≥ 1.5 px, parabolic profile, bloomed); `after` = the core + halo shader
 * (laserLineMaterial.js, shader job 2: core ≥ 1 px carrying 1 − haloShare, halo = Gaussian of haloRadiusCapped carrying
 * haloShare, each entity a lone line → LONE_LINE_SPACING_RAD cap; drawn after the bloom). `dip` = the light midway between
 * two lines of the same cube over the light on a line's axis, before tone mapping (< 0.735: two lines, Rayleigh).
 */
import fs from 'node:fs'
import { beamWidth, coreHalo, driveOfHex, hgPhase, laserColourFlux, laserOf, LONE_LINE_SPACING_RAD, MIN_PIXELS } from '../../src/objectComponents/laserLine.js'

const arg = (n, f = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f }
const raw = JSON.parse(fs.readFileSync(arg('doc'), 'utf8'))
const doc = raw.document || raw
const cam = arg('camera') ? JSON.parse(arg('camera')) : doc.presentationState?.fixedCamera
const H = Number(arg('height', 900))
const driveArg = arg('drive') ? arg('drive').split(',').map(Number) : null
const atm = doc.renderSettings?.atmosphere || {}
const sigma = Number(atm.scattering) || 0.02
const g = Number(atm.anisotropy) || 0.7
const exposure = Number(doc.renderSettings?.toneMappingExposure) || 1
const pixelAngle = (2 * Math.tan((cam.fov * Math.PI) / 360)) / H

const sub = (a, b) => a.map((v, i) => v - b[i])
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const len = (a) => Math.hypot(...a)
const norm = (a) => a.map((v) => v / len(a))
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i])
const rot = ([x, y, z], v) => { // three.js Euler 'XYZ': R = Rx·Ry·Rz
    let [a, b, c] = v
    ;[a, b] = [a * Math.cos(z) - b * Math.sin(z), a * Math.sin(z) + b * Math.cos(z)]
    ;[a, c] = [a * Math.cos(y) + c * Math.sin(y), -a * Math.sin(y) + c * Math.cos(y)]
    ;[b, c] = [b * Math.cos(x) - c * Math.sin(x), b * Math.sin(x) + c * Math.cos(x)]
    return [a, b, c]
}

const lines = []
for (const e of doc.entities || []) {
    const c = e.components || {}
    const laser = laserOf(c.beam)
    if (!laser) continue
    const t = c.transform || {}
    const drive = driveArg || driveOfHex(c.light?.color)
    const { lumens } = laserColourFlux({ mW: laser.mW, nm: laser.nm, drive })
    lines.push({ id: e.id, p: t.position, d: norm(rot(t.rotation || [0, 0, 0], [0, -1, 0])), flux: lumens * laser.sceneScale * (Number(c.beam?.haze) || 1), laser })
}
const at = (ln, s) => {
    const x = add(ln.p, ln.d, s)
    const toCam = sub(cam.position, x)
    const dist = len(toCam)
    const cos = dot(ln.d, toCam) / dist
    const sin = Math.max(Math.sqrt(Math.max(1 - cos * cos, 0)), 0.01)
    const T = Math.exp(-sigma * (s + dist))
    const W = Math.max(beamWidth(s, ln.laser.diameter_mm, ln.laser.divergence_mrad), dist * pixelAngle * MIN_PIXELS)
    const L = (sigma * hgPhase(cos, g) * ln.flux * T) / (W * sin) * 1.5 // the cross profile's peak (1.5·(1 − u²))
    const px = dist * pixelAngle
    const ch = coreHalo({ sigmaS: sigma, g, flux: ln.flux, cosTheta: cos, s, d: dist, dist, pixelAngle, diameter_mm: ln.laser.diameter_mm, divergence_mrad: ln.laser.divergence_mrad, spacingRad: LONE_LINE_SPACING_RAD })
    const rPx = Math.max(ch.haloRadius, 0.5 * px) / px
    const hPx = (ch.haloShare / (Math.sqrt(2 * Math.PI) * rPx)) // halo per pixel, in units of I·px
    const cPx = (1 - ch.haloShare) / (ch.coreWidth / px) // core per pixel on its axis
    return { x, dist, W, Wpx: W / px, hdr: L * exposure, after: { core_hdr: ch.core * exposure, halo_hdr: ch.halo * exposure, core_px: ch.coreWidth / px, halo_px: rPx, cPx, hPx } }
}
// across two lines `gap` px apart, the light midway over the light on an axis (neighbours on both sides counted)
const dipBefore = (Wpx, gap) => {
    const f = (x) => (Math.abs(x) < Wpx / 2 ? 1.5 * (1 - (2 * x / Wpx) ** 2) : 0)
    return (2 * f(gap / 2)) / (f(0) + 2 * f(gap))
}
const dipAfter = (a, gap) => {
    const core = (x) => Math.min(1, Math.max(0, a.core_px / 2 - Math.abs(x) + 0.5)) * a.cPx
    const halo = (x) => a.hPx * Math.exp(-0.5 * (x / a.halo_px) ** 2)
    const f = (x) => core(x) + halo(x)
    return (2 * f(gap / 2)) / (f(0) + 2 * f(gap))
}
const angleSeen = (a, b) => Math.acos(Math.min(1, dot(norm(sub(a, cam.position)), norm(sub(b, cam.position)))))

const out = { camera: cam, sigma, g, exposure, pixelAngle_mrad: +(pixelAngle * 1000).toFixed(3), cube: {}, forty: {} }
const cubes = lines.filter((l) => l.laser.mW.reduce((a, b) => a + b, 0) < 5000)
const forty = lines.filter((l) => !cubes.includes(l))
for (const s of [2, 5, 10, 20, 40, 60]) {
    const pts = cubes.map((l) => ({ l, ...at(l, s) }))
    // the neighbouring line of the same fan (same aperture), in pixels
    const withGap = pts.map((p) => {
        const mates = pts.filter((q) => q !== p && len(sub(q.l.p, p.l.p)) < 0.01)
        return { p, gap: mates.length ? Math.min(...mates.map((q) => angleSeen(p.x, q.x))) / pixelAngle : null }
    }).filter((v) => v.gap !== null)
    const gaps = withGap.map((v) => v.gap)
    const med = (v) => { const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
    if (withGap.length) {
        const A = withGap.map((v) => v.p.after)
        out.after = out.after || {}
        out.after[s] = {
            core_hdr_median: +med(A.map((a) => a.core_hdr)).toFixed(2), halo_hdr_median: +med(A.map((a) => a.halo_hdr)).toFixed(3),
            core_px: +med(A.map((a) => a.core_px)).toFixed(2), halo_sigma_px: +med(A.map((a) => a.halo_px)).toFixed(2),
            dip_before: +med(withGap.map((v) => dipBefore(v.p.Wpx, v.gap))).toFixed(2), dip_after: +med(withGap.map((v) => dipAfter(v.p.after, v.gap))).toFixed(2)
        }
    }
    out.cube[s] = { hdr_median: +med(pts.map((p) => p.hdr)).toFixed(2), hdr_max: +Math.max(...pts.map((p) => p.hdr)).toFixed(2), drawn_px: +med(pts.map((p) => p.Wpx)).toFixed(2), drawn_m: +med(pts.map((p) => p.W)).toFixed(4), gap_to_mate_px: gaps.length ? +med(gaps).toFixed(2) : null, dist_m: +med(pts.map((p) => p.dist)).toFixed(1) }
    if (forty.length) { const f = forty.map((l) => at(l, s)); out.forty[s] = { hdr_median: +med(f.map((p) => p.hdr)).toFixed(2), drawn_px: +med(f.map((p) => p.Wpx)).toFixed(2) } }
}
console.log(JSON.stringify(out, null, 1))
