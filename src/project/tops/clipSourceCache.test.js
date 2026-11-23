import { describe, expect, it, vi } from 'vitest'
import { acquireClipSource, clipSourceCacheSize } from './clipSourceCache.js'
import { createClipVideo } from './clipVideos.js'

const response = (size, { ok = true } = {}) => ({
    ok,
    headers: { get: (name) => (name === 'content-length' ? String(size) : null) },
    body: { cancel: vi.fn() },
    blob: async () => ({ size })
})
const urls = () => {
    let n = 0
    return { createObjectURL: vi.fn(() => `blob:clip-${++n}`), revokeObjectURL: vi.fn() }
}

describe('a clip played from memory', () => {
    it('fetches a file once for every reader of the same address, outside the HTTP cache', async () => {
        const fetchImpl = vi.fn(async () => response(1000))
        const u = urls()
        const a = acquireClipSource('/assets/a.mp4', { fetchImpl, ...u })
        const b = acquireClipSource('/assets/a.mp4', { fetchImpl, ...u })
        expect(await a.promise).toBe('blob:clip-1')
        expect(await b.promise).toBe('blob:clip-1')
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl).toHaveBeenCalledWith('/assets/a.mp4', { cache: 'no-store' })
        a.release()
        expect(u.revokeObjectURL).not.toHaveBeenCalled()
        b.release(); b.release()
        await Promise.resolve()
        expect(u.revokeObjectURL).toHaveBeenCalledTimes(1)
        expect(clipSourceCacheSize()).toBe(0)
    })

    it('answers null for a file over the memory ceiling, a refused fetch and a broken one', async () => {
        const u = urls()
        const big = acquireClipSource('/assets/big.mp4', { fetchImpl: async () => response(10_000), maxBytes: 5000, ...u })
        const refused = acquireClipSource('/assets/no.mp4', { fetchImpl: async () => response(10, { ok: false }), ...u })
        const broken = acquireClipSource('/assets/x.mp4', { fetchImpl: async () => { throw new Error('offline') }, ...u })
        expect([await big.promise, await refused.promise, await broken.promise]).toEqual([null, null, null])
        expect(u.createObjectURL).not.toHaveBeenCalled()
        big.release(); refused.release(); broken.release()
        expect(clipSourceCacheSize()).toBe(0)
    })
})

describe('a clip video with a memory source', () => {
    const fake = () => {
        const video = { paused: true, duration: NaN, currentTime: 0, playbackRate: 1, src: '', play: () => Promise.resolve(), pause: () => {}, load: () => {}, setAttribute: () => {}, removeAttribute: (name) => { if (name === 'src') video.src = '' }, addEventListener: () => {}, removeEventListener: () => {} }
        return video
    }
    const make = (loadSource) => {
        const video = fake()
        const clip = createClipVideo({ asset: '/assets/a.mp4', playing: true }, { loadSource, document: { createElement: () => video }, requestFrame: () => 1, cancelFrame: () => {} })
        return { video, clip }
    }
    const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }

    it('keeps the previous clip until the next file is in memory, then switches', async () => {
        const first = deferred(); const second = deferred()
        const release = [vi.fn(), vi.fn()]
        const loadSource = vi.fn()
            .mockReturnValueOnce({ promise: first.promise, release: release[0] })
            .mockReturnValueOnce({ promise: second.promise, release: release[1] })
        const { video, clip } = make(loadSource)
        first.resolve('blob:a'); await first.promise
        expect(video.src).toBe('blob:a')
        clip.update({ asset: '/assets/b.mp4', playing: true })
        expect(video.src).toBe('blob:a')
        expect(release[0]).toHaveBeenCalledTimes(1)
        second.resolve('blob:b'); await second.promise
        expect(video.src).toBe('blob:b')
        clip.dispose()
        expect(release[1]).toHaveBeenCalledTimes(1)
    })

    it('plays the address directly when the file cannot be held, and drops a late answer', async () => {
        const slow = deferred(); const direct = deferred()
        const loadSource = vi.fn()
            .mockReturnValueOnce({ promise: slow.promise, release: () => {} })
            .mockReturnValueOnce({ promise: direct.promise, release: () => {} })
        const { video, clip } = make(loadSource)
        clip.update({ asset: '/assets/b.mp4', playing: true })
        direct.resolve(null); await direct.promise
        expect(video.src).toBe('/assets/b.mp4')
        slow.resolve('blob:late'); await slow.promise
        expect(video.src).toBe('/assets/b.mp4')
    })
})
