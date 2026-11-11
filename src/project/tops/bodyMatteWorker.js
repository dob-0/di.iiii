// The body matte's model, run in a Web Worker so the page's render thread never waits for it.
//
// A CLASSIC worker (no imports, nothing to bundle): MediaPipe's own wasm loader uses
// importScripts, which a module worker refuses; dynamic import() works in a classic worker,
// so the vendored vision_bundle.mjs is loaded with it. bodyMatte.js creates this file with
//   new Worker(new URL('./bodyMatteWorker.js', import.meta.url))
// (the form Vite builds in dev and in production).
//
// Messages in:  { type: 'init', base, model }                       -> { type: 'ready' } | { type: 'error', message }
//               { type: 'run', seq, key, data (RGBA bytes, transferred), width, height }
//                                                                    -> { type: 'mask', seq, key, bytes, width, height, ms } | { type: 'fail', seq, message }
//               { type: 'close' }
let segmenter = null
let lastStamp = 0

const post = (message, transfer) => self.postMessage(message, transfer || [])

const init = async ({ base, model }) => {
    try {
        const vision = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`)
        const files = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`)
        segmenter = await vision.ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: model, delegate: 'GPU' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false
        })
        post({ type: 'ready' })
    } catch (error) {
        post({ type: 'error', message: String((error && error.message) || error) })
    }
}

const run = ({ seq, key, data, width, height }) => {
    if (!segmenter) { post({ type: 'fail', seq, message: 'no model' }); return }
    try {
        const t0 = performance.now()
        lastStamp = Math.max(lastStamp + 1, Math.floor(t0))
        const result = segmenter.segmentForVideo(new ImageData(new Uint8ClampedArray(data.buffer || data), width, height), lastStamp)
        const mask = result.confidenceMasks && result.confidenceMasks[0]
        if (!mask) { if (result.close) result.close(); post({ type: 'fail', seq, message: 'no mask' }); return }
        const floats = mask.getAsFloat32Array()
        const bytes = new Uint8Array(floats.length)
        for (let i = 0; i < floats.length; i += 1) {
            const v = floats[i]
            bytes[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
        }
        const out = { type: 'mask', seq, key, bytes, width: mask.width, height: mask.height, ms: performance.now() - t0 }
        if (result.close) result.close()
        post(out, [bytes.buffer])
    } catch (error) {
        post({ type: 'fail', seq, message: String((error && error.message) || error) })
    }
}

self.onmessage = (event) => {
    const message = event.data || {}
    if (message.type === 'init') init(message)
    else if (message.type === 'run') run(message)
    else if (message.type === 'close') {
        if (segmenter) { try { segmenter.close() } catch { /* already gone */ } segmenter = null }
    }
}
