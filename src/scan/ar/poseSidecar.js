// THE POSE SIDECAR — every kept frame with where the camera was and what lens it had.
//
// One JSON per walk, uploaded next to the frames into the space's sources project.
// scripts/place/poses.mjs turns it into a COLMAP text model (cameras.txt,
// images.txt — COLMAP docs, "Output format", and the FAQ "Reconstruct
// sparse/dense model from known camera poses") and an AliceVision SfMData file
// for Meshroom, and uses the metric camera centres to SCALE the reconstruction
// (Umeyama 1991 similarity fit) — the walk carries its own size, so the build
// needs no tape and no --door-guess.
//
// CONVENTIONS, written into the file so nobody has to guess them:
//   pose: camera → world, WebXR (right-handed, metres, +y up, camera looks -z);
//   intrinsics: pinhole in PIXELS of the saved image, origin top-left, v down;
//     fx = P[0]·w/2, fy = P[5]·h/2, cx = (1 − P[8])·w/2, cy = (1 + P[9])·h/2
//     from the column-major XRView.projectionMatrix P (derived in arMath.js
//     unprojectView; the test round-trips it).

import { round } from './arMath.js'

export const SIDECAR_VERSION = 1
export const SIDECAR_KIND = 'di.scan.poses'

export const intrinsicsFromProjection = (projection, width, height) => ({
    model: 'PINHOLE',
    width,
    height,
    fx: round((projection[0] * width) / 2, 3),
    fy: round((projection[5] * height) / 2, 3),
    cx: round(((1 - projection[8]) * width) / 2, 3),
    cy: round(((1 + projection[9]) * height) / 2, 3)
})

/** Project a camera-space point to pixels with those intrinsics (for the round-trip test). */
export const projectPixels = (intr, p) => {
    const depth = -p[2]
    return [intr.cx + (intr.fx * p[0]) / depth, intr.cy - (intr.fy * p[1]) / depth]
}

export const createSidecar = ({ spaceId = '', walk = '', startedAt = new Date().toISOString(), route = 'webxr', device = '' } = {}) => ({
    kind: SIDECAR_KIND,
    version: SIDECAR_VERSION,
    space: spaceId,
    walk,
    startedAt,
    route,
    device,
    conventions: {
        pose: 'camera-to-world; WebXR: right-handed, metres, +y up, camera looks -z; orientation quaternion [x,y,z,w]',
        intrinsics: 'pinhole in pixels of the saved image; origin top-left, v down',
        referenceSpace: 'local-floor (y = 0 is the floor the session found)'
    },
    // AR tracking measures in metres; that is the whole point of item 5.
    scale: {
        metresPerUnit: 1,
        source: route === 'webxr' ? 'webxr-tracking' : 'none',
        note: route === 'webxr'
            ? 'positions are the AR session’s own metres (ARCore through WebXR); accuracy unvalidated against a tape'
            : 'no tracking: positions are not metric'
    },
    cameraImage: null,
    frames: []
})

/** Add one kept frame. Returns the record written. */
export const addFrame = (sidecar, { file = null, time, pose, projection, width, height, sharpness = null, blurPx = null, anchor = null }) => {
    const record = {
        index: sidecar.frames.length,
        file,
        time: round(time, 1),
        position: pose.position.map((v) => round(v, 4)),
        orientation: pose.orientation.map((v) => round(v, 6)),
        intrinsics: intrinsicsFromProjection(projection, width, height),
        sharpness: sharpness === null ? null : round(sharpness, 2),
        predictedBlurPx: blurPx === null ? null : round(blurPx, 2),
        anchor
    }
    if (!sidecar.cameraImage) sidecar.cameraImage = { width, height }
    sidecar.frames.push(record)
    return record
}

/** A walk is usable for posed reconstruction when enough frames carry a file. */
export const sidecarReadiness = (sidecar) => {
    const withFiles = sidecar.frames.filter((f) => f.file).length
    return { frames: sidecar.frames.length, withFiles, ready: withFiles >= 20 }
}

export const sidecarFilename = (walk) => `${walk || 'walk'}.poses.json`
