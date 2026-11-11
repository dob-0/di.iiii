// The body matte: finds the person in a picture so the Body effect (top.matte)
// can cut the artist out as a flat shape.
//
// One shared segmenter per page. MediaPipe tasks-vision ImageSegmenter with the
// selfie_segmenter model (float16), GPU delegate, VIDEO mode, run on a picture
// scaled to 480x270 (proven 2026-11-10: 53.9 fps at 1920x1080 output, see
// platina/matte-speed-test/RESULT.md). The files ship with the app under
// /vendor/ (public/vendor/VENDOR.md, "Body matte"); nothing is fetched from the
// internet, and nothing is loaded until the first Body effect is switched on.
//
// It runs only while a consumer holds it (acquire/release): with no Body effect
// on, the model is closed and costs nothing. While it loads, or if it fails, the
// status says so and run() returns null; the effect then passes the picture
// through (never black, never silent).

export const MATTE_W = 480
export const MATTE_H = 270
export const BODY_MATTE_BASE = '/vendor/mediapipe-tasks-vision@0.10.17'
export const BODY_MATTE_MODEL = '/vendor/mediapipe-models/selfie_segmenter.tflite'

/** Short plain words for the effect row. '' = nothing to say (ready, or not used). */
export const BODY_STATUS_TEXT = {
    idle: '',
    loading: 'body model loading',
    ready: '',
    error: 'body model not available'
}

/** Model confidences (0..1 floats) -> bytes for an 8-bit texture. */
export const confidenceToBytes = (floats, out = new Uint8Array(floats.length)) => {
    for (let i = 0; i < floats.length; i += 1) {
        const v = floats[i]
        out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
    }
    return out
}

const absolute = (path) => {
    const origin = globalThis.location?.origin
    return origin && origin !== 'null' ? `${origin}${path}` : path
}

const defaultLoadModule = async () => {
    const url = absolute(`${BODY_MATTE_BASE}/vision_bundle.mjs`)
    const vision = await import(/* @vite-ignore */ url)
    const files = await vision.FilesetResolver.forVisionTasks(absolute(`${BODY_MATTE_BASE}/wasm`))
    const segmenter = await vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: absolute(BODY_MATTE_MODEL), delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false
    })
    return segmenter
}

/**
 * Make a matte service. `loadSegmenter` resolves to an object with
 * segmentForVideo(image, ms) -> { confidenceMasks: [{width,height,getAsFloat32Array()}], close() }
 * and close(); injected so a test can make it fail or answer.
 */
export const createBodyMatte = ({ loadSegmenter = defaultLoadModule, clock = () => performance.now() } = {}) => {
    let status = 'idle'
    let segmenter = null
    let loading = null
    let lastStamp = 0
    const holders = new Set()
    const listeners = new Set()
    let bytes = null
    const stats = { runs: 0, msTotal: 0, lastMs: 0 }

    const setStatus = (next) => {
        if (next === status) return
        status = next
        for (const listener of listeners) listener(status)
    }

    const load = () => {
        if (loading || segmenter) return
        setStatus('loading')
        const attempt = Promise.resolve().then(loadSegmenter)
        loading = attempt.then((made) => {
            loading = null
            if (!holders.size) { made?.close?.(); setStatus('idle'); return }
            segmenter = made
            setStatus('ready')
        }, () => {
            loading = null
            setStatus('error')
        })
    }

    return {
        /** A consumer starts needing the mask. The first one starts the load. */
        acquire(id) {
            holders.add(id)
            if (status === 'idle') load()
        },
        /** A consumer is done. The last one closes the model. */
        release(id) {
            holders.delete(id)
            if (holders.size) return
            if (segmenter) { try { segmenter.close() } catch { /* already gone */ } segmenter = null }
            if (status !== 'loading') setStatus('idle')
        },
        /** Retry after a failure (the next time an effect is switched on). */
        retry() { if (status === 'error' && holders.size) { setStatus('idle'); load() } },
        status: () => status,
        statusText: () => BODY_STATUS_TEXT[status] || '',
        holders: () => holders.size,
        stats: () => ({ ...stats, meanMs: stats.runs ? stats.msTotal / stats.runs : 0 }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        /**
         * One model run on a MATTE_W x MATTE_H picture (canvas / ImageData / video).
         * Returns { bytes, width, height } (bytes is reused: copy it before the next
         * run) or null when the model is not ready or the run failed.
         */
        run(image) {
            if (!segmenter || status !== 'ready') return null
            try {
                const t0 = clock()
                // The model wants a strictly rising stamp, whoever asks.
                lastStamp = Math.max(lastStamp + 1, Math.floor(t0))
                const result = segmenter.segmentForVideo(image, lastStamp)
                const mask = result.confidenceMasks?.[0]
                if (!mask) { result.close?.(); return null }
                const floats = mask.getAsFloat32Array()
                if (!bytes || bytes.length !== floats.length) bytes = new Uint8Array(floats.length)
                confidenceToBytes(floats, bytes)
                const out = { bytes, width: mask.width, height: mask.height }
                result.close?.()
                const ms = clock() - t0
                stats.runs += 1
                stats.msTotal += ms
                stats.lastMs = ms
                return out
            } catch {
                return null
            }
        }
    }
}

let shared = null
/** The one segmenter of this page. */
export const bodyMatte = () => { if (!shared) shared = createBodyMatte(); return shared }
