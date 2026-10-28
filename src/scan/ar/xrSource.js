// THE LIVE SOURCE — an immersive-ar WebXR session on an Android phone, turned into ticks.
//
// Specs and docs this follows (also in docs/ai/decisions/2026-10-23-scan-ar-guidance.md):
//   * WebXR Device API (W3C CR) — requestSession('immersive-ar'), local-floor space,
//     XRViewerPose, XRView.projectionMatrix.
//   * WebXR AR Module — immersive-ar, the camera behind the content.
//   * WebXR Hit Test Module — requestHitTestSource({ space, offsetRay }).
//   * WebXR Anchors Module — frame.createAnchor(), trackedAnchors.
//   * WebXR DOM Overlays Module — domOverlay: { root }; our HTML stays on top.
//   * WebXR Depth Sensing Module — depthSensing { usagePreference, dataFormatPreference },
//     XRCPUDepthInformation.getDepthInMeters(u, v) in normalised view coordinates.
//   * WebXR Raw Camera Access (immersive-web/raw-camera-access, Chrome 107+) —
//     XRView.camera, XRWebGLBinding.getCameraImage(camera): a WebGL texture of the
//     camera picture, valid only inside the frame callback.
//   * Chrome on Android ships all of them on ARCore (chromestatus; developers.google.com/ar/develop/webxr).
//
// WHAT IS NOT PROVEN until the owner's S24 runs it: that the camera texture comes
// out the right way up (read with readPixels, flipped once here), its size (the
// sidecar and the screen print it — that number IS the measurement the brief asks
// for), and that depth arrives as cpu-optimized. Each failure falls back and says so.

import { laplacianVariance } from '../sharpness.js'
import { toWorld, unprojectView } from './arMath.js'

export const AR_OPTIONAL_FEATURES = ['hit-test', 'anchors', 'dom-overlay', 'depth-sensing', 'camera-access', 'light-estimation']

export const arSessionInit = (overlayRoot) => ({
    requiredFeatures: ['local-floor'],
    optionalFeatures: AR_OPTIONAL_FEATURES,
    ...(overlayRoot ? { domOverlay: { root: overlayRoot } } : {}),
    depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] }
})

/** 'yes' | 'no' — may this browser start an AR scan at all? */
export const arSupport = async (xr = typeof navigator !== 'undefined' ? navigator.xr : null) => {
    if (!xr?.isSessionSupported) return 'no'
    try {
        return (await xr.isSessionSupported('immersive-ar')) ? 'yes' : 'no'
    } catch {
        return 'no'
    }
}

/** Call INSIDE the tap handler: a session needs a user gesture. */
export const requestArSession = (overlayRoot, xr = navigator.xr) => xr.requestSession('immersive-ar', arSessionInit(overlayRoot))

const TICK_MS = 100
const READ_MS = 250
const GRID_U = 16
const GRID_V = 12
const CROP = 96
// Where hit-test looks when the phone has no depth: a 5 × 3 fan across the view.
const FAN = [-0.5, -0.25, 0, 0.25, 0.5].flatMap((x) => [-0.25, 0, 0.25].map((y) => [x, y]))

const poseOf = (transform) => ({
    position: [transform.position.x, transform.position.y, transform.position.z],
    orientation: [transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w]
})

const lumaOf = (pixels) => {
    let sum = 0
    for (let i = 0; i < pixels.length; i += 4) sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    return sum / (pixels.length / 4) / 255
}

/**
 * Drive `renderer` (a three.js WebGLRenderer) from `session`. `draw()` is called
 * after every tick so the caller renders its scene with renderer.xr's camera.
 */
export const createXrSource = async ({ session, renderer, draw }) => {
    const gl = renderer.getContext()
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local-floor')
    await renderer.xr.setSession(session)
    const features = Array.isArray(session.enabledFeatures) ? [...session.enabledFeatures] : []
    const depthOnCpu = session.depthUsage === 'cpu-optimized'
    let binding = null
    try {
        binding = typeof XRWebGLBinding === 'function' ? new XRWebGLBinding(session, gl) : null
    } catch {
        binding = null
    }
    const framebuffer = gl.createFramebuffer()
    let hitSources = []
    if (!depthOnCpu && session.requestHitTestSource) {
        try {
            const viewer = await session.requestReferenceSpace('viewer')
            hitSources = await Promise.all(FAN.map(([x, y]) => session.requestHitTestSource({
                space: viewer,
                offsetRay: new XRRay({ x: 0, y: 0, z: 0, w: 1 }, { x, y, z: -1, w: 0 })
            })))
        } catch {
            hitSources = []
        }
    }

    let onTick = null
    let started = 0
    let lastTick = -Infinity
    let lastRead = -Infinity
    let reading = { luma: null, sharpness: null }
    let anchor = null
    let anchorAsked = false
    let grabs = []
    let cameraSize = null

    const readCamera = (view, region) => {
        if (!binding || !view.camera) return null
        const texture = binding.getCameraImage(view.camera)
        if (!texture) return null
        const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING)
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        const pixels = new Uint8Array(region.width * region.height * 4)
        gl.readPixels(region.x, region.y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous)
        renderer.resetState()
        return pixels
    }

    const finishGrab = (pixels, width, height, tick) => {
        // readPixels starts at the bottom row; an image starts at the top.
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        const image = context.createImageData(width, height)
        const row = width * 4
        for (let y = 0; y < height; y += 1) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
        context.putImageData(image, 0, 0)
        return new Promise((resolve) => canvas.toBlob((blob) => resolve({ blob, width, height, tick }), 'image/jpeg', 0.92))
    }

    renderer.setAnimationLoop((time, frame) => {
        if (!frame) return
        const space = renderer.xr.getReferenceSpace()
        const viewerPose = frame.getViewerPose(space)
        if (!viewerPose) { draw?.(null); return }
        const view = viewerPose.views[0]
        if (!started) started = time
        if (!anchorAsked && frame.createAnchor) {
            anchorAsked = true
            frame.createAnchor(new XRRigidTransform(), space).then((a) => { anchor = a }).catch(() => {})
        }
        if (view.camera) cameraSize = { width: view.camera.width, height: view.camera.height }

        if (grabs.length && cameraSize) {
            const pending = grabs
            grabs = []
            const pixels = readCamera(view, { x: 0, y: 0, ...cameraSize })
            const tick = { time: time - started, pose: poseOf(view.transform), projection: Array.from(view.projectionMatrix), viewport: cameraSize }
            for (const g of pending) {
                if (pixels) finishGrab(pixels, cameraSize.width, cameraSize.height, tick).then(g)
                else g({ blob: null, ...cameraSize, tick })
            }
        } else if (grabs.length) {
            const pending = grabs
            grabs = []
            pending.forEach((g) => g({ blob: null, width: 0, height: 0, tick: null }))
        }

        if (time - started - lastTick >= TICK_MS) {
            lastTick = time - started
            const pose = poseOf(view.transform)
            const projection = Array.from(view.projectionMatrix)
            const samples = []
            let centreDistance = null
            if (depthOnCpu) {
                try {
                    const depth = frame.getDepthInformation(view)
                    if (depth) {
                        for (let i = 0; i < GRID_U; i += 1) {
                            for (let j = 0; j < GRID_V; j += 1) {
                                const u = (i + 0.5) / GRID_U
                                const v = (j + 0.5) / GRID_V
                                const d = depth.getDepthInMeters(u, v)
                                if (d > 0.1 && d < 8) samples.push(toWorld(pose, unprojectView(projection, u, v, d)))
                            }
                        }
                        const c = depth.getDepthInMeters(0.5, 0.5)
                        centreDistance = c > 0 ? c : null
                    }
                } catch {
                    // depth not ready this frame
                }
            }
            if (!samples.length) {
                for (const [k, source] of hitSources.entries()) {
                    const hit = frame.getHitTestResults(source)[0]
                    const p = hit?.getPose(space)?.transform?.position
                    if (!p) continue
                    samples.push([p.x, p.y, p.z])
                    if (FAN[k][0] === 0 && FAN[k][1] === 0) {
                        centreDistance = Math.hypot(p.x - pose.position[0], p.y - pose.position[1], p.z - pose.position[2])
                    }
                }
            }
            if (cameraSize && time - lastRead >= READ_MS) {
                lastRead = time
                const region = {
                    x: Math.max(0, Math.floor(cameraSize.width / 2 - CROP / 2)),
                    y: Math.max(0, Math.floor(cameraSize.height / 2 - CROP / 2)),
                    width: Math.min(CROP, cameraSize.width),
                    height: Math.min(CROP, cameraSize.height)
                }
                const pixels = readCamera(view, region)
                if (pixels) {
                    reading = {
                        luma: lumaOf(pixels),
                        sharpness: laplacianVariance({ data: pixels, width: region.width, height: region.height })
                    }
                }
            }
            let anchorPose = null
            if (anchor && frame.trackedAnchors?.has(anchor)) {
                const p = frame.getPose(anchor.anchorSpace, space)
                if (p) anchorPose = poseOf(p.transform)
            }
            onTick?.({
                time: lastTick,
                pose,
                projection,
                viewport: cameraSize || { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
                samples,
                centreDistance,
                luma: reading.luma,
                sharpness: reading.sharpness,
                anchor: anchorPose
            })
        }
        draw?.(view)
    })

    return {
        kind: 'xr',
        features,
        depth: depthOnCpu ? 'depth' : hitSources.length ? 'hit-test' : 'none',
        get cameraSize() { return cameraSize },
        start(fn) { onTick = fn },
        /** The full camera picture of the next frame: { blob, width, height, tick }. */
        requestGrab: () => new Promise((resolve) => { grabs.push(resolve) }),
        stop() {
            renderer.setAnimationLoop(null)
            hitSources.forEach((s) => s.cancel?.())
            gl.deleteFramebuffer(framebuffer)
            return session.end().catch(() => {})
        }
    }
}
