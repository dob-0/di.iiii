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

const WORKER_INIT_TIMEOUT_MS = 30000
// A run that is not answered in this long means the worker is stuck (a lost GPU context, a
// hang): the page-thread path takes over, so the mask never stays frozen without a word.
// The first run after loading compiles the model's shaders: 2.0 s was the longest measured
// (2026-11-11, machine load 11-20), so the limit sits well above it.
export const WORKER_RUN_TIMEOUT_MS = 5000

/** A classic worker (see bodyMatteWorker.js); null when this page cannot run one. */
const defaultCreateWorker = () => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
    return new Worker(new URL('./bodyMatteWorker.js', import.meta.url))
}

/**
 * Make a matte service. `loadSegmenter` resolves to an object with
 * segmentForVideo(image, ms) -> { confidenceMasks: [{width,height,getAsFloat32Array()}], close() }
 * and close(); injected so a test can make it fail or answer. `createWorker` returns a
 * Worker-like { postMessage, terminate, onmessage, onerror } (or null); injected the same way.
 * Giving only `loadSegmenter` keeps the page-thread path (no worker).
 *
 * Two ways to ask for a mask:
 *  - run(image): synchronous, page thread (kept for callers that want the answer now);
 *  - submit(key, image) + poll(): the render loop never waits. With a worker the job is
 *    posted and the answer is polled when it arrives; without one submit runs the model
 *    at once (the engine budgets that to one run a frame) and poll hands the result over.
 */
export const createBodyMatte = ({ loadSegmenter, clock = () => performance.now(), createWorker } = {}) => {
    const injected = loadSegmenter !== undefined
    const loadMain = loadSegmenter || defaultLoadModule
    const makeWorker = createWorker !== undefined ? createWorker : injected ? null : defaultCreateWorker
    let status = 'idle'
    let segmenter = null
    let loading = null
    let worker = null
    let workerTimer = null
    let inFlight = null
    let seq = 0
    let lastStamp = 0
    const holders = new Set()
    const listeners = new Set()
    const done = []
    const lastSeq = new Map()
    let bytes = null
    const stats = { runs: 0, msTotal: 0, lastMs: 0, answers: 0, ageTotal: 0, ageMax: 0, workerFailures: 0 }

    const setStatus = (next) => {
        if (next === status) return
        status = next
        for (const listener of listeners) listener(status)
    }

    const loadOnPage = () => {
        if (loading || segmenter) return
        setStatus('loading')
        const attempt = Promise.resolve().then(loadMain)
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

    const endWorker = () => {
        if (workerTimer) { clearTimeout(workerTimer); workerTimer = null }
        if (worker) {
            const gone = worker
            worker = null
            try { gone.postMessage({ type: 'close' }) } catch { /* already gone */ }
            try { gone.terminate() } catch { /* already gone */ }
        }
        inFlight = null
    }

    // The worker could not start or died: the page-thread path takes over (loudly counted).
    const workerFailed = (which) => {
        if (which !== worker) return
        stats.workerFailures += 1
        endWorker()
        if (holders.size) loadOnPage()
        else setStatus('idle')
    }

    const onWorkerMessage = (which, message) => {
        if (which !== worker || !message) return
        if (message.type === 'ready') {
            if (workerTimer) { clearTimeout(workerTimer); workerTimer = null }
            if (!holders.size) { endWorker(); setStatus('idle'); return }
            setStatus('ready')
        } else if (message.type === 'error') {
            workerFailed(which)
        } else if (message.type === 'fail') {
            if (inFlight && inFlight.seq === message.seq) inFlight = null
        } else if (message.type === 'mask') {
            const job = inFlight && inFlight.seq === message.seq ? inFlight : null
            if (job) inFlight = null
            const key = job ? job.key : message.key
            if (key === undefined) return
            stats.runs += 1
            stats.msTotal += message.ms || 0
            stats.lastMs = message.ms || 0
            if ((lastSeq.get(key) || 0) >= message.seq) return // an older answer than one already handed over
            lastSeq.set(key, message.seq)
            done.push({ key, seq: message.seq, bytes: message.bytes, width: message.width, height: message.height, sentAt: job ? job.sentAt : clock() })
        }
    }

    const startWorker = () => {
        let made = null
        try { made = makeWorker ? makeWorker() : null } catch { made = null }
        if (!made) return false
        worker = made
        made.onmessage = (event) => onWorkerMessage(made, event?.data)
        made.onerror = () => workerFailed(made)
        made.onmessageerror = () => workerFailed(made)
        workerTimer = setTimeout(() => workerFailed(made), WORKER_INIT_TIMEOUT_MS)
        try {
            made.postMessage({ type: 'init', base: absolute(BODY_MATTE_BASE), model: absolute(BODY_MATTE_MODEL) })
        } catch {
            workerFailed(made)
            return true
        }
        return true
    }

    const load = () => {
        if (loading || segmenter || worker) return
        setStatus('loading')
        if (!startWorker()) loadOnPage()
    }

    const runOnPage = (image) => {
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

    return {
        /** A consumer starts needing the mask. The first one starts the load. */
        acquire(id) {
            holders.add(id)
            if (status === 'idle') load()
        },
        /** A consumer is done. The last one ends the worker / closes the model. */
        release(id) {
            holders.delete(id)
            if (holders.size) return
            const hadWorker = !!worker
            endWorker()
            done.length = 0
            lastSeq.clear()
            if (segmenter) { try { segmenter.close() } catch { /* already gone */ } segmenter = null }
            if (hadWorker || status !== 'loading') setStatus('idle')
        },
        /** Retry after a failure (the next time an effect is switched on). */
        retry() { if (status === 'error' && holders.size) { setStatus('idle'); load() } },
        status: () => status,
        statusText: () => BODY_STATUS_TEXT[status] || '',
        holders: () => holders.size,
        /** 'worker' | 'page' | null: where the model runs now. */
        where: () => (worker ? 'worker' : segmenter || loading ? 'page' : null),
        stats: () => ({
            ...stats,
            meanMs: stats.runs ? stats.msTotal / stats.runs : 0,
            ageMean: stats.answers ? stats.ageTotal / stats.answers : 0
        }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        /**
         * How many runs may start now: worker idle = 1, worker busy = 0, page path = 1, not ready = 0.
         * The render loop asks every frame, so this is also where a stuck worker is noticed: a run
         * older than WORKER_RUN_TIMEOUT_MS ends the worker and the page-thread path loads.
         */
        budget() {
            if (status !== 'ready') return 0
            if (worker && inFlight && clock() - inFlight.sentAt > WORKER_RUN_TIMEOUT_MS) {
                workerFailed(worker)
                return 0
            }
            if (worker) return inFlight ? 0 : 1
            return 1
        },
        /**
         * Ask for a mask of `image` ({ data: Uint8ClampedArray RGBA, width, height }); the
         * data is handed over (transferred to the worker), do not reuse it. Returns false when
         * nothing was started. The answer comes from poll().
         */
        submit(key, image) {
            if (status !== 'ready') return false
            seq += 1
            if (worker) {
                if (inFlight) return false
                inFlight = { key, seq, sentAt: clock() }
                try {
                    worker.postMessage({ type: 'run', seq, key, data: image.data, width: image.width, height: image.height }, [image.data.buffer])
                } catch {
                    inFlight = null
                    workerFailed(worker)
                    return false
                }
                return true
            }
            const sentAt = clock()
            const wrapped = typeof ImageData === 'undefined' ? image : new ImageData(image.data, image.width, image.height)
            const result = runOnPage(wrapped)
            if (!result) return false
            lastSeq.set(key, seq)
            done.push({ key, seq, bytes: result.bytes.slice(), width: result.width, height: result.height, sentAt })
            return true
        },
        /** The masks that arrived since the last poll: [{ key, seq, bytes, width, height, sentAt, age }]. */
        poll() {
            if (!done.length) return []
            const now = clock()
            const out = done.splice(0, done.length)
            for (const item of out) {
                item.age = now - item.sentAt
                stats.answers += 1
                stats.ageTotal += item.age
                if (item.age > stats.ageMax) stats.ageMax = item.age
            }
            return out
        },
        /**
         * One model run on a MATTE_W x MATTE_H picture (canvas / ImageData / video), page thread.
         * Returns { bytes, width, height } (bytes is reused: copy it before the next
         * run) or null when the model is not ready on this thread or the run failed.
         */
        run: runOnPage
    }
}

let shared = null
/** The one segmenter of this page. */
export const bodyMatte = () => { if (!shared) shared = createBodyMatte(); return shared }
