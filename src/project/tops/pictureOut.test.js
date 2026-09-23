import { describe, expect, it, vi } from 'vitest'
import { createPictureOut, RETRY_AFTER_MS } from './pictureOut.js'

// Everything the sender touches is handed in: a canvas whose toBlob is
// answered by the test, a fetch whose answers are held until the test lets
// them go, and a clock the test moves. The discipline under test — one
// request in flight, latest frame wins, a refusal believed for a while — is
// entirely about WHEN things happen, so nothing here may be real-time.

const jpeg = () => ({ arrayBuffer: async () => new Uint8Array([0xff, 0xd8]).buffer })
const answer = (status, body = {}) => ({ status, json: async () => body })

const rig = ({ size = { width: 640, height: 360 }, drawn = true, quality } = {}) => {
    const blobCallbacks = []
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ canvas }),
        toBlob: vi.fn((callback) => { blobCallbacks.push(callback) })
    }
    const pending = []
    const fetchImpl = vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }) }))
    const states = []
    let clock = 10_000
    const out = createPictureOut({
        drawNode: vi.fn(() => drawn),
        size: () => size,
        fetchImpl,
        createCanvas: () => canvas,
        quality,
        now: () => clock,
        onState: (nodeId, state) => states.push([nodeId, state])
    })
    // Let the held blob and the held answer go, and drain the microtasks
    // that follow them.
    const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }
    return {
        out, canvas, fetchImpl, states,
        tick: (ms) => { clock += ms },
        encoded: async () => { blobCallbacks.shift()?.(jpeg()); await settle() },
        answered: async (status, body) => { pending.shift()?.resolve(answer(status, body)); await settle() },
        failed: async (error) => { pending.shift()?.reject(error); await settle() },
        posts: () => fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST'),
        deletes: () => fetchImpl.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
        settle
    }
}

describe('sending a picture off the machine', () => {
    it('sends nothing without a name — no request, no encode, ever', () => {
        const { out, canvas, fetchImpl } = rig()
        out.setOutputs(new Map([['send', ''], ['other', '   ']]))
        out.pump(); out.pump(); out.pump()
        expect(canvas.toBlob).not.toHaveBeenCalled()
        expect(fetchImpl).not.toHaveBeenCalled()
        expect(out.outputs()).toEqual([])
    })

    it('posts one JPEG to the sender on this machine, under the name given', async () => {
        const { out, canvas, encoded, posts } = rig({ quality: 0.7 })
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.7)
        await encoded()
        const [url, init] = posts()[0]
        expect(url).toMatch(/\/ndi\/out\.jpg\?name=di\+test$/)
        expect(init.headers['Content-Type']).toBe('image/jpeg')
        expect(init.body).toBeInstanceOf(ArrayBuffer)
    })

    it('keeps one frame in flight and drops the rest — the answer is the pacer', async () => {
        const { out, canvas, encoded, answered, posts, states } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        // toBlob is asynchronous too, so it sits under the same lock.
        out.pump(); out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(1)
        await encoded()
        expect(posts()).toHaveLength(1)
        // The request is unanswered: these frames are dropped, not buffered.
        out.pump(); out.pump(); out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(1)
        expect(posts()).toHaveLength(1)
        await answered(200, { ok: true, name: 'di test', seq: 1, viewers: 2 })
        expect(states.at(-1)[1]).toMatchObject({ state: 'sending', frames: 1, dropped: 5, viewers: 2, seq: 1 })
        // Answered: the next frame goes.
        out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(2)
    })

    it('believes a 503 for five seconds, keeps the server\'s own words, and then asks again', async () => {
        // No runtime on this machine is the ORDINARY case. Retrying every
        // frame would be sixty refusals a second; the reason and the one line
        // that fixes it are kept verbatim for the page to repeat, calmly.
        const { out, canvas, tick, encoded, answered, states } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        await encoded()
        await answered(503, { error: 'unavailable', reason: 'not-installed', how: 'Install NDI Tools from ndi.video on this machine.' })
        expect(states.at(-1)[1]).toMatchObject({ state: 'unavailable', reason: 'not-installed', how: 'Install NDI Tools from ndi.video on this machine.' })
        tick(1000); out.pump()
        tick(3000); out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(1)
        tick(RETRY_AFTER_MS); out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(2)
    })

    it('waits the same way after a 429, a 400 and a server that is not there', async () => {
        for (const [status, body] of [[429, { error: 'busy', detail: 'four outputs already' }], [400, { error: 'bad request', detail: 'name too long' }], [404, {}]]) {
            const { out, canvas, tick, encoded, answered, states } = rig()
            out.setOutputs(new Map([['send', 'di test']]))
            out.pump()
            await encoded()
            await answered(status, body)
            expect(states.at(-1)[1].state, String(status)).not.toBe('sending')
            if (body.detail) expect(states.at(-1)[1].detail).toBe(body.detail)
            tick(RETRY_AFTER_MS - 1); out.pump()
            expect(canvas.toBlob, String(status)).toHaveBeenCalledTimes(1)
        }
    })

    it('treats a fetch that throws as a pause, not a stop', async () => {
        const { out, canvas, tick, encoded, failed, states } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        await encoded()
        await failed(new TypeError('Failed to fetch'))
        expect(states.at(-1)[1]).toMatchObject({ state: 'unreachable', detail: 'Failed to fetch' })
        tick(RETRY_AFTER_MS); out.pump()
        expect(canvas.toBlob).toHaveBeenCalledTimes(2)
    })

    it('copies at the engine\'s own size, so the whole picture leaves and not a thumbnail', () => {
        const { out, canvas } = rig({ size: { width: 1280, height: 720 } })
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        expect([canvas.width, canvas.height]).toEqual([1280, 720])
    })

    it('sends no frame the engine has no picture for yet', () => {
        const { out, canvas } = rig({ drawn: false })
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        expect(canvas.toBlob).not.toHaveBeenCalled()
    })

    it('takes the output off the network when it stops feeding it', async () => {
        const { out, encoded, answered, deletes, states } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        await encoded()
        await answered(200, { ok: true, seq: 1, viewers: 0 })
        out.stop()
        const [url, init] = deletes()[0]
        expect(url).toMatch(/\/ndi\/out\.jpg\?name=di\+test$/)
        // The page may be closing; the request must still leave.
        expect(init.keepalive).toBe(true)
        expect(states.at(-1)).toEqual(['send', null])
    })

    it('stops only after the frame in flight is answered — a late POST would bring the source back', async () => {
        const { out, encoded, answered, deletes } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        await encoded()
        await answered(200, { ok: true, seq: 1, viewers: 0 })
        out.pump()
        await encoded()
        out.stop()
        expect(deletes()).toHaveLength(0)
        await answered(200, { ok: true, seq: 2, viewers: 0 })
        expect(deletes()).toHaveLength(1)
    })

    it('never stops what the server never accepted', async () => {
        // A machine with no runtime has said so once; it hears nothing more.
        const { out, encoded, answered, deletes } = rig()
        out.setOutputs(new Map([['send', 'di test']]))
        out.pump()
        await encoded()
        await answered(503, { reason: 'not-installed', how: 'Install it.' })
        out.stop()
        expect(deletes()).toHaveLength(0)
    })

    it('a renamed output stops under the old name and starts under the new one', async () => {
        const { out, encoded, answered, deletes, posts } = rig()
        out.setOutputs(new Map([['send', 'first']]))
        out.pump()
        await encoded()
        await answered(200, { ok: true, seq: 1, viewers: 0 })
        out.setOutputs(new Map([['send', 'second']]))
        expect(deletes()[0][0]).toMatch(/name=first$/)
        out.pump()
        await encoded()
        expect(posts()[1][0]).toMatch(/name=second$/)
    })
})
