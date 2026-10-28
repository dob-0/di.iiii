// The pose sidecar (src/scan/ar/poseSidecar.js) into the reconstruction's own formats,
// and the walk's metres into the reconstruction's scale.
//
// THREE ROUTES, by how established they are:
//
//   1. COLMAP text model — DOCUMENTED. cameras.txt (PINHOLE fx fy cx cy) +
//      images.txt (QW QX QY QZ TX TY TZ, world → camera, OpenCV camera axes) +
//      an empty points3D.txt is exactly the input COLMAP's FAQ "Reconstruct
//      sparse/dense model from known camera poses" asks for (feature_extractor,
//      exhaustive_matcher, point_triangulator --input_path this). colmap.github.io
//      /format.html and /faq.html.
//   2. Meshroom / AliceVision — poses written INTO the SfMData that CameraInit
//      made (so views, ids and intrinsics are AliceVision's own) and locked,
//      then aliceVision_computeStructureFromKnownPoses (in Meshroom 2025.1,
//      ~/tools/meshroom/current/aliceVision/bin). The rotation order of the JSON
//      was checked by aliceVision_exportColmap reading our file back, not assumed
//      (see injectPosesIntoSfm).
//   3. SCALE ONLY — whatever reconstructed the frames, its camera centres and the
//      walk's metric centres for the same images give the scale by Horn's
//      closed-form symmetric scale (Horn 1987, "Closed-form solution of absolute
//      orientation using unit quaternions", JOSA A 4(4), §2.D): s = sqrt(Σ|d_i−d̄|² / Σ|r_i−r̄|²),
//      which needs no rotation. The spread of pairwise distance ratios says how
//      much to trust it.

import path from 'node:path'
import { quatToRows, rowsToQuat } from '../../src/scan/ar/arMath.js'

const fmt = (x, p = 9) => Number(x).toFixed(p).replace(/\.?0+$/, '') || '0'

/**
 * A WebXR camera-to-world pose into COLMAP's world-to-camera, OpenCV axes.
 * WebXR's camera is x right, y UP, looks −z; OpenCV's is x right, y DOWN, looks +z:
 * the same frame turned 180° about x, so R_c2w(cv) = R_c2w(xr) · diag(1, −1, −1).
 */
export const webxrToColmap = (position, orientation) => {
    const r = quatToRows(orientation)
    const c2w = r.map((row) => [row[0], -row[1], -row[2]])
    const w2c = [0, 1, 2].map((i) => [c2w[0][i], c2w[1][i], c2w[2][i]])
    const t = w2c.map((row) => -(row[0] * position[0] + row[1] * position[1] + row[2] * position[2]))
    const [qx, qy, qz, qw] = rowsToQuat(w2c)
    return { q: [qw, qx, qy, qz], t, w2c }
}

const intrinsicsKey = (i) => [i.width, i.height, i.fx, i.fy, i.cx, i.cy].join(' ')

export const sidecarToColmap = (sidecar) => {
    const frames = (sidecar.frames || []).filter((f) => f.file)
    const cameras = new Map()
    for (const f of frames) {
        const key = intrinsicsKey(f.intrinsics)
        if (!cameras.has(key)) cameras.set(key, { id: cameras.size + 1, ...f.intrinsics })
    }
    const camerasTxt = ['# Camera list with one line of data per camera:', '#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]',
        ...[...cameras.values()].map((c) => `${c.id} PINHOLE ${c.width} ${c.height} ${fmt(c.fx)} ${fmt(c.fy)} ${fmt(c.cx)} ${fmt(c.cy)}`)].join('\n') + '\n'
    const images = ['# Image list with two lines of data per image:', '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME', '#   POINTS2D[] as (X, Y, POINT3D_ID)']
    frames.forEach((f, k) => {
        const { q, t } = webxrToColmap(f.position, f.orientation)
        const cam = cameras.get(intrinsicsKey(f.intrinsics)).id
        images.push(`${k + 1} ${q.map((v) => fmt(v)).join(' ')} ${t.map((v) => fmt(v)).join(' ')} ${cam} ${path.basename(f.file)}`, '')
    })
    return { camerasTxt, imagesTxt: images.join('\n') + '\n', points3DTxt: '# 3D point list (empty: point_triangulator fills it)\n' }
}

/**
 * Lock the walk's poses into an AliceVision SfMData that CameraInit wrote,
 * matching views by image file name. Rotation: world → camera, written COLUMN by
 * column (Eigen's storage order); centre: the camera centre in world metres.
 * Order MEASURED 2026-10-23: written row by row, aliceVision_exportColmap
 * (Meshroom 2025.1) read our file back as the inverse rotation; column by column
 * its images.txt matches sidecarToColmap's to 1e-6 (decision record).
 */
export const injectPosesIntoSfm = (sfm, sidecar) => {
    const byName = new Map((sidecar.frames || []).filter((f) => f.file).map((f) => [path.basename(f.file), f]))
    const poses = []
    let matched = 0
    for (const view of sfm.views || []) {
        const frame = byName.get(path.basename(String(view.path || '')))
        if (!frame) continue
        const { w2c } = webxrToColmap(frame.position, frame.orientation)
        const poseId = String(view.poseId || view.viewId)
        view.poseId = poseId
        poses.push({ poseId, pose: { transform: { rotation: [0, 1, 2].flatMap((j) => w2c.map((row) => row[j])).map((v) => fmt(v, 12)), center: frame.position.map((v) => fmt(v, 9)) }, locked: '1' } })
        matched += 1
    }
    return { sfm: { ...sfm, poses }, matched, views: (sfm.views || []).length }
}

/** Camera centres of a reconstruction, by image file name: COLMAP images.txt. */
export const readColmapCentres = (imagesTxt) => {
    const centres = new Map()
    // An image line has 10 fields; its POINTS2D line (empty, or triples) never has
    // exactly 10 starting with an integer id and a quaternion, so read lines by shape.
    const lines = String(imagesTxt).split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length !== 10 || !/^\d+$/.test(parts[0])) continue
        const [qw, qx, qy, qz, tx, ty, tz] = parts.slice(1, 8).map(Number)
        const r = quatToRows([qx, qy, qz, qw])
        const t = [tx, ty, tz]
        // C = −Rᵀ t
        centres.set(parts[9], [0, 1, 2].map((j) => -(r[0][j] * t[0] + r[1][j] * t[1] + r[2][j] * t[2])))
    }
    return centres
}

/** Camera centres of a reconstruction, by image file name: AliceVision SfMData. */
export const readSfmCentres = (sfm) => {
    const poseById = new Map((sfm.poses || []).map((p) => [String(p.poseId), p.pose?.transform?.center?.map(Number)]))
    const centres = new Map()
    for (const v of sfm.views || []) {
        const c = poseById.get(String(v.poseId))
        if (c) centres.set(path.basename(String(v.path)), c)
    }
    return centres
}

const mean = (pts) => pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((s) => s / pts.length)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Horn's symmetric scale from model-unit centres to metric centres, with a spread check. */
export const scaleFromCentres = (modelCentres, metricCentres) => {
    if (modelCentres.length !== metricCentres.length || modelCentres.length < 3) return null
    const mm = mean(modelCentres)
    const me = mean(metricCentres)
    const num = metricCentres.reduce((s, p) => s + dist(p, me) ** 2, 0)
    const den = modelCentres.reduce((s, p) => s + dist(p, mm) ** 2, 0)
    if (!(den > 0)) return null
    const scale = Math.sqrt(num / den)
    const ratios = []
    const n = modelCentres.length
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += Math.max(1, Math.floor(n / 40))) {
            const d = dist(modelCentres[i], modelCentres[j])
            if (d > 1e-6 && dist(metricCentres[i], metricCentres[j]) > 0.3) ratios.push(dist(metricCentres[i], metricCentres[j]) / d)
        }
    }
    ratios.sort((a, b) => a - b)
    const q = (f) => ratios[Math.min(ratios.length - 1, Math.floor(f * ratios.length))]
    return {
        scale,
        pairs: ratios.length,
        median: ratios.length ? q(0.5) : null,
        spread: ratios.length ? (q(0.75) - q(0.25)) / q(0.5) : null,
        cameras: n
    }
}

/** The scale record fit.mjs takes (--scale-from). */
export const posedScaleFromSidecar = (sidecar, reconstructionCentres) => {
    const model = []
    const metric = []
    for (const f of sidecar.frames || []) {
        if (!f.file) continue
        const c = reconstructionCentres.get(path.basename(f.file))
        if (!c) continue
        model.push(c)
        metric.push(f.position)
    }
    const fit = scaleFromCentres(model, metric)
    if (!fit) return null
    return {
        kind: 'di.place.posed-scale',
        source: sidecar.scale?.source || 'unknown',
        walk: sidecar.walk || '',
        ...fit
    }
}
