// An operator's picture, off the machine that draws it — one JPEG at a time.
//
// A Send Out (topOperators.js `top.send`) names an output; this posts that
// operator's picture to the serverXR on the same machine, which puts it on the
// network as an NDI® source under that name (serverXR/src/ndi/sendManager.js).
// The runner's requestAnimationFrame loop calls pump() every frame; nothing
// here has a clock of its own.
//
// Latest frame wins; there is never a queue. At most ONE request is in flight
// per output, and while it is unanswered every later frame is dropped, not
// kept. The answer is the pacer: a machine that encodes slowly sends fewer
// frames instead of falling steadily behind, which is what a queue would do —
// a wall showing a picture from four seconds ago is worse than one showing
// fewer pictures. toBlob is asynchronous too, so it is under the same lock.
//
// Most machines have no NDI runtime, and the server says so with a 503. That
// is the ordinary case, not a fault: the sender waits five seconds before
// asking again, keeps the server's own sentence, and the page repeats it
// calmly. Asking every frame would be sixty refusals a second for nothing.
//
// No name, no requests, ever. The empty name is the default and the quiet
// path — a Send Out nobody has named costs the same as a Picture Out.
//
// NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
// di.iiii never ships the runtime; see docs/architecture/NDI.md.

import { ndiApiUrl } from '../../map/ndiLink.js'

export const RETRY_AFTER_MS = 5000
export const JPEG_QUALITY = 0.85
// Counters travel to the page this often; the state line travels the moment
// it changes. A report per frame would re-render whoever is looking inside
// sixty times a second for a number that only ever goes up.
const COUNTERS_EVERY_MS = 1000

// Never the bare global: `fetch` called detached from `window` throws
// "Illegal invocation" in a browser (the same rule as ndiLink.js).
const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

const outputUrl = (name) => ndiApiUrl(`out.jpg?${new URLSearchParams({ name }).toString()}`)

const readJson = async (response) => {
    try { return await response.json() } catch { return {} }
}

/**
 * @param {object} options
 * @param {(nodeId: string, context: CanvasRenderingContext2D) => boolean} options.drawNode  copy a LOCAL operator's picture into a 2D canvas
 * @param {() => ({ width: number, height: number } | null)} options.size  the engine's canvas size — the offscreen copy matches it, so the whole picture leaves, not a thumbnail
 * @param {(nodeId: string, state: object|null) => void} [options.onState]  what the sender has to say about an output; null when it stops
 * @param {Function} [options.fetchImpl]
 * @param {() => HTMLCanvasElement} [options.createCanvas]
 * @param {number} [options.quality]         JPEG quality, 0..1
 * @param {number} [options.retryAfterMs]    how long a refusal is believed before asking again
 * @param {() => number} [options.now]
 */
export const createPictureOut = ({
    drawNode,
    size,
    onState = null,
    fetchImpl = null,
    createCanvas = () => globalThis.document?.createElement('canvas'),
    quality = JPEG_QUALITY,
    retryAfterMs = RETRY_AFTER_MS,
    now = () => Date.now()
}) => {
    const call = resolveFetch(fetchImpl)
    // nodeId → output
    const outputs = new Map()

    const stateOf = (out) => ({
        name: out.name,
        state: out.state,
        reason: out.reason,
        how: out.how,
        detail: out.detail,
        seq: out.seq,
        viewers: out.viewers,
        frames: out.frames,
        dropped: out.dropped
    })

    const tell = (out, force = false) => {
        if (!onState || out.retired) return
        const line = `${out.state}|${out.reason}|${out.how}|${out.detail}|${out.viewers}`
        const t = now()
        if (!force && line === out.toldLine && t - out.toldAt < COUNTERS_EVERY_MS) return
        out.toldLine = line
        out.toldAt = t
        onState(out.nodeId, stateOf(out))
    }

    // A refusal is believed for a while. Whatever it was — no runtime, too
    // many outputs, a name the server will not take, no server at all — it
    // will not be different on the next frame.
    const pause = (out, state, { reason = '', how = '', detail = '' } = {}) => {
        out.state = state
        out.reason = reason
        out.how = how
        out.detail = detail
        out.notBefore = now() + retryAfterMs
        tell(out, true)
    }

    // Stop the output on the server the moment nothing here feeds it, so the
    // source leaves the network now rather than at the server's idle timeout —
    // a stage operator watching a source list should see it go when it goes.
    // Only ever after the server accepted a frame: a machine with no runtime
    // never hears from us again once it has said so.
    const remove = (out) => {
        if (!out.posted || !call) return
        out.posted = false
        try {
            // keepalive: the page may be closing, and this must still leave.
            call(outputUrl(out.name), { method: 'DELETE', keepalive: true }).catch(() => {})
        } catch { /* nothing left to do about a request that could not start */ }
    }

    const retire = (out) => {
        out.retired = true
        outputs.delete(out.nodeId)
        onState?.(out.nodeId, null)
        // A frame still in flight would recreate the source after the DELETE
        // if both were on the wire together; the answer to it removes instead.
        if (!out.busy) remove(out)
    }

    const answered = async (out, response) => {
        const status = response?.status
        if (status === 200) {
            const body = await readJson(response)
            out.posted = true
            out.frames += 1
            out.seq = Number.isFinite(body?.seq) ? body.seq : out.seq
            out.viewers = Number.isFinite(body?.viewers) ? body.viewers : out.viewers
            out.state = 'sending'
            out.reason = ''
            out.how = ''
            out.detail = ''
            out.notBefore = 0
            tell(out)
            return
        }
        if (status === 503) {
            // No runtime on this machine — the ordinary case. The server's own
            // words, verbatim: it knows the reason and the one line that fixes it.
            const body = await readJson(response)
            pause(out, 'unavailable', { reason: String(body?.reason || ''), how: String(body?.how || '') })
            return
        }
        if (status === 429) {
            const body = await readJson(response)
            pause(out, 'busy', { detail: String(body?.detail || 'too many outputs on this machine') })
            return
        }
        if (status === 400) {
            const body = await readJson(response)
            pause(out, 'refused', { detail: String(body?.detail || 'the server did not take this frame') })
            return
        }
        // A hosted di.iiii answers its own index.html to every address it does
        // not know; anything else that is not one of the four answers is the
        // same thing to us — nothing here can send.
        pause(out, 'unreachable', { detail: `the server answered ${status ?? 'nothing'}` })
    }

    const post = async (out, buffer) => {
        try {
            const response = await call(outputUrl(out.name), {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: buffer
            })
            await answered(out, response)
        } catch (error) {
            pause(out, 'unreachable', { detail: String(error?.message || error) })
        } finally {
            out.busy = false
            if (out.retired) remove(out)
        }
    }

    const send = (out) => {
        const wanted = size?.()
        if (!wanted || !wanted.width || !wanted.height) return
        // thumbnails() clamps to the engine canvas and copies out at OUR
        // canvas's size: matching it is what makes this a full copy.
        if (out.canvas.width !== wanted.width) out.canvas.width = wanted.width
        if (out.canvas.height !== wanted.height) out.canvas.height = wanted.height
        if (!drawNode(out.nodeId, out.context)) return
        out.busy = true
        try {
            out.canvas.toBlob((blob) => {
                if (out.retired) { out.busy = false; remove(out); return }
                if (!blob) {
                    out.busy = false
                    pause(out, 'unreachable', { detail: 'this browser gave no JPEG for the picture' })
                    return
                }
                blob.arrayBuffer().then((buffer) => post(out, buffer)).catch((error) => {
                    out.busy = false
                    pause(out, 'unreachable', { detail: String(error?.message || error) })
                })
            }, 'image/jpeg', quality)
        } catch (error) {
            out.busy = false
            pause(out, 'unreachable', { detail: String(error?.message || error) })
        }
    }

    // --- every frame, from the runner
    const pump = () => {
        if (!call) return
        for (const out of outputs.values()) {
            if (out.busy) { out.dropped += 1; tell(out); continue }
            if (now() < out.notBefore) continue
            send(out)
        }
    }

    /**
     * The outputs this page feeds: nodeId → name, names already resolved
     * (resolveTopParams trims and caps them). An empty name is not an output.
     * A renamed output stops under the old name and starts under the new one.
     */
    const setOutputs = (next) => {
        const wanted = new Map()
        for (const [nodeId, name] of next instanceof Map ? next : new Map()) {
            if (typeof name === 'string' && name.trim()) wanted.set(nodeId, name.trim())
        }
        for (const out of [...outputs.values()]) {
            if (wanted.get(out.nodeId) !== out.name) retire(out)
        }
        for (const [nodeId, name] of wanted) {
            if (outputs.has(nodeId)) continue
            const canvas = createCanvas?.()
            const context = canvas?.getContext?.('2d')
            if (!context) continue
            outputs.set(nodeId, {
                nodeId, name, canvas, context,
                busy: false, retired: false, posted: false, notBefore: 0,
                state: 'starting', reason: '', how: '', detail: '',
                seq: 0, viewers: 0, frames: 0, dropped: 0,
                toldLine: '', toldAt: 0
            })
        }
    }

    return {
        pump,
        setOutputs,
        /** What each output is doing, for a test or a console. */
        outputs: () => [...outputs.values()].map((out) => ({ nodeId: out.nodeId, busy: out.busy, posted: out.posted, ...stateOf(out) })),
        stop() {
            for (const out of [...outputs.values()]) retire(out)
        }
    }
}
