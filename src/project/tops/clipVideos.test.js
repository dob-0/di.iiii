import { describe, expect, it, vi } from 'vitest'
import { CLIP_MODE, clipWindow, createClipVideo, normaliseClipValues, resolveClipUrl, stepClip } from './clipVideos.js'

// A <video> with no decoder: time moves only when the test says so, and
// play/pause/seek are recorded.
const fakeVideo = () => {
    const listeners = new Map()
    const attributes = new Map()
    const video = {
        paused: true,
        seeking: false,
        duration: NaN,
        currentTime: 0,
        playbackRate: 1,
        src: '',
        loads: 0,
        play: vi.fn(() => { video.paused = false; return Promise.resolve() }),
        pause: vi.fn(() => { video.paused = true }),
        load: vi.fn(() => { video.loads += 1 }),
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => { attributes.delete(name); if (name === 'src') video.src = '' },
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type) => listeners.delete(type),
        emit: (type) => listeners.get(type)?.(),
        listeners
    }
    return video
}

const harness = (values, { resolveAssetUrl } = {}) => {
    const video = fakeVideo()
    const frames = []
    let clock = 0
    const clip = createClipVideo(values, {
        resolveAssetUrl,
        document: { createElement: () => video },
        requestFrame: (fn) => { frames.push(fn); return frames.length },
        cancelFrame: () => { frames.length = 0 }
    })
    // Run the one pending animation frame, `ms` after the last.
    const tick = (ms = 16) => {
        clock += ms
        const pending = frames.splice(0)
        pending.forEach((fn) => fn(clock))
        return pending.length
    }
    const load = (duration) => { video.duration = duration; video.emit('loadedmetadata') }
    return { clip, video, tick, load, frames }
}

describe('clip values', () => {
    it('fills defaults and clamps', () => {
        expect(normaliseClipValues({})).toEqual({ asset: '', speed: 1, mode: '0', in: 0, out: 1, trigger: 0, playing: true })
        expect(normaliseClipValues({ speed: 9, mode: '7', in: -1, out: 3, playing: false })).toMatchObject({ speed: 4, mode: '0', in: 0, out: 1, playing: false })
    })

    it('plays the window between in and out, either way round', () => {
        expect(clipWindow(10, { in: 0.2, out: 0.5 })).toEqual({ start: 2, end: 5 })
        expect(clipWindow(10, { in: 0.5, out: 0.2 })).toEqual({ start: 2, end: 5 })
        // An empty window plays from in to the end rather than nothing.
        expect(clipWindow(10, { in: 0.4, out: 0.4 })).toEqual({ start: 4, end: 10 })
    })
})

describe('stepping the transport', () => {
    const at = (time, values, extra = {}) => stepClip({ time, duration: 10, dt: 0.1, values, ...extra })

    it('loops back to in at the out point', () => {
        expect(at(4, { in: 0.2, out: 0.5 })).toEqual({ direction: 1, seek: null, play: true })
        expect(at(5, { in: 0.2, out: 0.5 })).toEqual({ direction: 1, seek: 2, play: true })
        expect(at(1, { in: 0.2, out: 0.5 })).toEqual({ direction: 1, seek: 2, play: true })
    })

    it('stops at the out point once', () => {
        expect(at(5, { out: 0.5, mode: CLIP_MODE.ONCE })).toEqual({ direction: 1, seek: null, play: false })
        expect(at(6, { out: 0.5, mode: CLIP_MODE.ONCE }).seek).toBe(5)
    })

    it('bounces: turns at out, steps back by hand, turns again at in', () => {
        const values = { in: 0.2, out: 0.5, mode: CLIP_MODE.BOUNCE, speed: 2 }
        expect(at(5, values)).toEqual({ direction: -1, seek: 5, play: false })
        expect(at(4, values, { direction: -1 })).toEqual({ direction: -1, seek: 3.8, play: false })
        expect(at(2.1, values, { direction: -1 })).toEqual({ direction: 1, seek: 2, play: true })
    })

    it('does nothing while paused or at speed 0', () => {
        expect(at(5, { playing: false })).toEqual({ direction: 1, seek: null, play: false })
        expect(at(5, { speed: 0 }).play).toBe(false)
    })
})

describe('a clip video', () => {
    it('is a muted inline video playing its resolved url at its speed', () => {
        const { clip, video } = harness({ asset: 'abc', speed: 2 }, { resolveAssetUrl: (asset) => `/files/${asset}` })
        expect(clip.video).toBe(video)
        expect(video.muted).toBe(true)
        expect(video.playsInline).toBe(true)
        expect(video.src).toBe('/files/abc')
        expect(video.playbackRate).toBe(2)
        expect(video.play).toHaveBeenCalled()
    })

    it('starts from in when the file has loaded, and loops at out', () => {
        const { video, tick, load } = harness({ asset: 'a.mp4', in: 0.2, out: 0.5 })
        load(10)
        tick()
        expect(video.currentTime).toBe(2)
        video.currentTime = 4.9
        tick()
        expect(video.currentTime).toBe(4.9)
        video.currentTime = 5.02
        tick()
        expect(video.currentTime).toBe(2)
        expect(video.paused).toBe(false)
    })

    it('restarts from in when trigger changes', () => {
        const { clip, video, load, tick } = harness({ asset: 'a.mp4', in: 0.1 })
        load(10)
        tick()
        video.currentTime = 7
        clip.update({ asset: 'a.mp4', in: 0.1, trigger: 1 })
        expect(video.currentTime).toBe(1)
        clip.update({ asset: 'a.mp4', in: 0.1, trigger: 1 })
        video.currentTime = 7
        clip.update({ asset: 'a.mp4', in: 0.1, trigger: 1 })
        expect(video.currentTime).toBe(7)
    })

    it('once: holds the out point and stops ticking until triggered', () => {
        const { clip, video, load, tick, frames } = harness({ asset: 'a.mp4', mode: CLIP_MODE.ONCE, out: 0.5 })
        load(10)
        tick()
        video.currentTime = 5
        tick()
        expect(video.paused).toBe(true)
        expect(frames.length).toBe(0)
        clip.update({ asset: 'a.mp4', mode: CLIP_MODE.ONCE, out: 0.5, trigger: 1 })
        expect(video.currentTime).toBe(0)
        expect(video.paused).toBe(false)
        expect(frames.length).toBe(1)
    })

    it('bounce steps backwards on animation frames', () => {
        const { video, load, tick } = harness({ asset: 'a.mp4', mode: CLIP_MODE.BOUNCE, out: 0.5 })
        load(10)
        tick()
        video.currentTime = 5
        tick()
        expect(video.paused).toBe(true)
        tick(100)
        expect(video.currentTime).toBeCloseTo(4.9)
        tick(100)
        expect(video.currentTime).toBeCloseTo(4.8)
    })

    it('stays cheap when paused: no animation frame is requested', () => {
        const { clip, video, frames, load } = harness({ asset: 'a.mp4', playing: false })
        load(10)
        expect(frames.length).toBe(0)
        expect(video.paused).toBe(true)
        clip.update({ asset: 'a.mp4', playing: true })
        expect(frames.length).toBe(1)
        clip.update({ asset: 'a.mp4', playing: false })
        expect(frames.length).toBe(0)
        expect(video.paused).toBe(true)
    })

    it('lets go of the file on dispose', () => {
        const { clip, video, frames } = harness({ asset: 'a.mp4' })
        clip.dispose()
        expect(video.src).toBe('')
        expect(video.loads).toBeGreaterThan(0)
        expect(frames.length).toBe(0)
        expect(video.listeners.size).toBe(0)
    })
})

describe('where a clip plays from', () => {
    it('uses a URL as it is', () => {
        expect(resolveClipUrl('https://example.test/a.mp4', 'space')).toBe('https://example.test/a.mp4')
        expect(resolveClipUrl('blob:abc', 'space')).toBe('blob:abc')
        expect(resolveClipUrl('')).toBe('')
    })

    it('finds an id in the project assets, then the project, then the space', () => {
        expect(resolveClipUrl('a1', 'space', { assets: [{ id: 'a1', url: 'https://cdn.test/a1' }] })).toBe('https://cdn.test/a1')
        expect(resolveClipUrl('a2', 'space', { assets: [], projectId: 'p1' })).toMatch(/\/api\/projects\/p1\/assets\/a2$/)
        expect(resolveClipUrl('a3', 'space')).toMatch(/\/api\/spaces\/space\/assets\/a3$/)
        expect(resolveClipUrl('a4')).toBe('')
    })
})
