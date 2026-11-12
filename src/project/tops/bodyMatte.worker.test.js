import { afterEach, describe, expect, it, vi } from 'vitest'
import { BODY_MATTE_WORKER_DELEGATE, WORKER_RUN_TIMEOUT_MS, createBodyMatte } from './bodyMatte.js'

const fakeWorker = () => {
    const w = {
        sent: [],
        transfers: [],
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage(message, transfer) { w.sent.push(message); w.transfers.push(transfer || []) },
        terminate() { w.terminated = true },
        reply(message) { w.onmessage?.({ data: message }) },
        runs: () => w.sent.filter((m) => m.type === 'run')
    }
    return w
}
const picture = () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
const mask = (seq, key, extra = {}) => ({ type: 'mask', seq, key, bytes: new Uint8Array([0, 128, 255, 255]), width: 2, height: 2, ms: 14, ...extra })
const fakeSegmenter = () => ({
    closed: false,
    segmentForVideo: () => ({ confidenceMasks: [{ width: 2, height: 2, getAsFloat32Array: () => new Float32Array([0, 0.5, 1, 1]) }], close() {} }),
    close() { this.closed = true }
})
const ready = (w, matte) => { matte.acquire('n'); w.reply({ type: 'ready' }) }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => { vi.useRealTimers() })

describe('body matte on a worker', () => {
    it('starts one worker on the first holder, says loading until it answers, then ready', () => {
        const w = fakeWorker()
        const created = vi.fn(() => w)
        const matte = createBodyMatte({ createWorker: created })
        matte.acquire('a'); matte.acquire('b')
        expect(created).toHaveBeenCalledTimes(1)
        expect(w.sent[0]).toMatchObject({ type: 'init' })
        expect(matte.status()).toBe('loading')
        expect(matte.statusText()).toBe('body model loading')
        expect(matte.budget()).toBe(0)
        w.reply({ type: 'ready' })
        expect(matte.status()).toBe('ready')
        expect(matte.statusText()).toBe('')
        expect(matte.where()).toBe('worker')
    })

    // Where the model runs (graphics card or processor) is a measured choice, so it is a parameter:
    // the service tells the worker, and the worker says back what it really started.
    it('tells the worker where to run the model (the default, or the one asked for) and reports what the worker says', () => {
        const a = fakeWorker()
        const first = createBodyMatte({ createWorker: () => a })
        first.acquire('n')
        expect(['CPU', 'GPU']).toContain(BODY_MATTE_WORKER_DELEGATE)
        expect(a.sent[0]).toMatchObject({ type: 'init', delegate: BODY_MATTE_WORKER_DELEGATE })
        expect(first.delegate()).toBe(null)
        a.reply({ type: 'ready', delegate: BODY_MATTE_WORKER_DELEGATE })
        expect(first.delegate()).toBe(BODY_MATTE_WORKER_DELEGATE)
        first.release('n')
        expect(first.delegate()).toBe(null)
        for (const asked of ['CPU', 'GPU']) {
            const b = fakeWorker()
            const second = createBodyMatte({ createWorker: () => b, workerDelegate: asked })
            second.acquire('n')
            expect(b.sent[0]).toMatchObject({ type: 'init', delegate: asked })
        }
    })

    it('posts a picture, allows one job at a time, and hands the answer over once', () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w })
        ready(w, matte)
        expect(matte.budget()).toBe(1)
        const image = picture()
        expect(matte.submit('src', image)).toBe(true)
        expect(w.runs()).toHaveLength(1)
        expect(w.transfers.at(-1)).toEqual([image.data.buffer])
        expect(matte.budget()).toBe(0)
        expect(matte.submit('other', picture())).toBe(false)
        expect(matte.poll()).toEqual([])
        w.reply(mask(w.runs()[0].seq, 'src'))
        expect(matte.budget()).toBe(1)
        const [answer] = matte.poll()
        expect(answer).toMatchObject({ key: 'src', width: 2, height: 2 })
        expect(Array.from(answer.bytes)).toEqual([0, 128, 255, 255])
        expect(answer.age).toBeGreaterThanOrEqual(0)
        expect(matte.poll()).toEqual([])
        expect(matte.stats()).toMatchObject({ runs: 1, answers: 1, meanMs: 14 })
    })

    it('uses an answer that arrives late, and drops an older one that arrives after a newer one', () => {
        let now = 1000
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w, clock: () => now })
        ready(w, matte)
        matte.submit('src', picture())
        const first = w.runs()[0].seq
        now = 1900 // nine tenths of a second later: still taken, with its age
        w.reply(mask(first, 'src'))
        expect(matte.poll()[0].age).toBe(900)
        matte.submit('src', picture())
        const second = w.runs()[1].seq
        w.reply(mask(second, 'src'))
        expect(matte.poll()).toHaveLength(1)
        w.reply(mask(first, 'src')) // the old picture's answer shows up again
        expect(matte.poll()).toEqual([])
        expect(matte.stats().ageMax).toBe(900)
    })

    it('keeps one answer per source apart (two sources, answers by key)', () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w })
        ready(w, matte)
        matte.submit('a', picture()); w.reply(mask(w.runs()[0].seq, 'a'))
        matte.submit('b', picture()); w.reply(mask(w.runs()[1].seq, 'b'))
        expect(matte.poll().map((x) => x.key)).toEqual(['a', 'b'])
    })

    it('frees the worker when a run fails, without an answer', () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w })
        ready(w, matte)
        matte.submit('a', picture())
        w.reply({ type: 'fail', seq: w.runs()[0].seq, message: 'boom' })
        expect(matte.budget()).toBe(1)
        expect(matte.poll()).toEqual([])
        expect(matte.status()).toBe('ready')
    })

    it('falls back to the page thread when the worker fails to load the model', async () => {
        const w = fakeWorker()
        const seg = fakeSegmenter()
        const matte = createBodyMatte({ createWorker: () => w, loadSegmenter: async () => seg })
        matte.acquire('n')
        w.reply({ type: 'error', message: 'no GPU' })
        expect(w.terminated).toBe(true)
        expect(matte.status()).toBe('loading')
        await tick()
        expect(matte.status()).toBe('ready')
        expect(matte.where()).toBe('page')
        expect(matte.stats().workerFailures).toBe(1)
        expect(matte.submit('src', picture())).toBe(true)
        expect(Array.from(matte.poll()[0].bytes)).toEqual([0, 128, 255, 255])
    })

    it('falls back when the worker dies while a job is out, and the lost job does not block', async () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w, loadSegmenter: async () => fakeSegmenter() })
        ready(w, matte)
        matte.submit('src', picture())
        w.onerror({})
        await tick()
        expect(matte.where()).toBe('page')
        expect(matte.budget()).toBe(1)
        expect(matte.submit('src', picture())).toBe(true)
        expect(matte.poll()).toHaveLength(1)
    })

    // A worker that is alive but never answers a run (a lost GPU context, a hang) sends no
    // error event: without a limit the job stays out, the budget stays 0 and the mask on
    // stage stays frozen without a word. The render loop asks budget() every frame, so the
    // limit is checked there.
    it('falls back when a run is not answered in time (a stuck worker), counted as a worker failure', async () => {
        const w = fakeWorker()
        let now = 1000
        const matte = createBodyMatte({ createWorker: () => w, loadSegmenter: async () => fakeSegmenter(), clock: () => now })
        ready(w, matte)
        expect(matte.submit('src', picture())).toBe(true)
        now += WORKER_RUN_TIMEOUT_MS
        expect(matte.budget()).toBe(0)
        expect(matte.where()).toBe('worker')
        expect(w.terminated).toBe(false)
        now += 1
        expect(matte.budget()).toBe(0)
        expect(w.terminated).toBe(true)
        expect(matte.stats().workerFailures).toBe(1)
        await tick()
        expect(matte.where()).toBe('page')
        expect(matte.status()).toBe('ready')
        expect(matte.budget()).toBe(1)
        expect(matte.submit('src', picture())).toBe(true)
        expect(matte.poll()).toHaveLength(1)
    })

    it('keeps the worker when a slow answer still comes inside the limit, and an idle worker has no limit', () => {
        const w = fakeWorker()
        let now = 0
        const matte = createBodyMatte({ createWorker: () => w, clock: () => now })
        ready(w, matte)
        matte.submit('src', picture())
        now += WORKER_RUN_TIMEOUT_MS - 1
        expect(matte.budget()).toBe(0)
        w.reply(mask(w.runs()[0].seq, 'src'))
        now += 10 * WORKER_RUN_TIMEOUT_MS
        expect(matte.budget()).toBe(1)
        expect(matte.where()).toBe('worker')
        expect(matte.stats().workerFailures).toBe(0)
    })

    it('falls back when no worker can be made or making it throws', async () => {
        for (const createWorker of [() => null, () => { throw new Error('no OffscreenCanvas') }]) {
            const matte = createBodyMatte({ createWorker, loadSegmenter: async () => fakeSegmenter() })
            matte.acquire('n')
            await tick()
            expect(matte.status()).toBe('ready')
            expect(matte.where()).toBe('page')
        }
    })

    it('falls back when the worker never answers its init', async () => {
        vi.useFakeTimers()
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w, loadSegmenter: async () => fakeSegmenter() })
        matte.acquire('n')
        await vi.advanceTimersByTimeAsync(31000)
        expect(w.terminated).toBe(true)
        expect(matte.where()).toBe('page')
        expect(matte.status()).toBe('ready')
    })

    it('reports an error when the worker and the page both fail', async () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w, loadSegmenter: async () => { throw new Error('x') } })
        matte.acquire('n')
        w.reply({ type: 'error', message: 'x' })
        await tick()
        expect(matte.status()).toBe('error')
        expect(matte.statusText()).toBe('body model not available')
    })

    it('ends the worker when the last holder lets go, and makes a new one next time', () => {
        const workers = []
        const matte = createBodyMatte({ createWorker: () => { const x = fakeWorker(); workers.push(x); return x } })
        matte.acquire('a'); matte.acquire('b')
        workers[0].reply({ type: 'ready' })
        matte.submit('a', picture())
        matte.release('a')
        expect(workers[0].terminated).toBe(false)
        matte.release('b')
        expect(workers[0].terminated).toBe(true)
        expect(workers[0].sent.at(-1)).toEqual({ type: 'close' })
        expect(matte.status()).toBe('idle')
        expect(matte.budget()).toBe(0)
        expect(matte.poll()).toEqual([])
        matte.acquire('c')
        expect(workers).toHaveLength(2)
    })

    it('ignores a message from a worker that was already ended', () => {
        const w = fakeWorker()
        const matte = createBodyMatte({ createWorker: () => w })
        matte.acquire('a')
        matte.release('a')
        w.reply({ type: 'ready' })
        expect(matte.status()).toBe('idle')
    })
})

describe('body matte on the page thread (no worker)', () => {
    it('keeps the old behaviour when only a segmenter is injected', async () => {
        const matte = createBodyMatte({ loadSegmenter: async () => fakeSegmenter() })
        matte.acquire('n')
        await tick()
        expect(matte.where()).toBe('page')
        expect(matte.budget()).toBe(1)
        expect(matte.run({})?.width).toBe(2)
    })

    it('submit runs at once and poll hands each result over, with its own copy of the bytes', async () => {
        const matte = createBodyMatte({ loadSegmenter: async () => fakeSegmenter() })
        matte.acquire('n')
        await tick()
        expect(matte.submit('a', picture())).toBe(true)
        expect(matte.submit('b', picture())).toBe(true)
        const got = matte.poll()
        expect(got.map((x) => x.key)).toEqual(['a', 'b'])
        expect(got[0].bytes).not.toBe(got[1].bytes)
    })

    it('does not accept a job before the model is ready', () => {
        const matte = createBodyMatte({ loadSegmenter: async () => fakeSegmenter() })
        expect(matte.submit('a', picture())).toBe(false)
        matte.acquire('n')
        expect(matte.budget()).toBe(0)
    })
})
