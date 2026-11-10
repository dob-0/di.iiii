import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    apiBaseUrl: 'https://diiii.xyz/serverXR'
}))

import MapSourceView from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

// 2026-11-10 (owner row N3522): a camera/stream track that ended left the
// output black until a reload. These pin the self re-open and its limits.
const surface = normalizeMappingSurface({ id: 's1', resolution: [640, 360], source: { kind: 'camera', ref: 'dev1' } })

const fakeStream = () => {
    const track = Object.assign(new EventTarget(), { readyState: 'live', stop: vi.fn() })
    const stream = Object.assign(new EventTarget(), { getTracks: () => [track], getVideoTracks: () => [track] })
    return { stream, track }
}
const failure = (name) => Object.assign(new Error(name), { name })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

let getUserMedia
beforeEach(() => {
    vi.useFakeTimers()
    getUserMedia = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('a camera whose track ends is opened again by itself', () => {
    it('opens a second stream and gives it to the video', async () => {
        const first = fakeStream()
        const second = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        expect(container.querySelector('video').srcObject).toBe(first.stream)
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(container.querySelector('video').srcObject).toBe(second.stream)
    })

    it('stops the old tracks', async () => {
        const first = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(fakeStream().stream)
        render(<MapSourceView surface={surface} />)
        await flush()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        expect(first.track.stop).toHaveBeenCalled()
    })

    it('makes no further call when it unmounts during a back-off that was really scheduled', async () => {
        const first = fakeStream()
        getUserMedia.mockResolvedValue(first.stream)
        const { unmount } = render(<MapSourceView surface={surface} />)
        await flush()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(100)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        unmount()
        expect(vi.getTimerCount()).toBe(0)
        await tick(10000)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
    })

    it('re-opens when the stream goes inactive without a track event', async () => {
        const first = fakeStream()
        const second = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        act(() => { first.stream.dispatchEvent(new Event('inactive')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(container.querySelector('video').srcObject).toBe(second.stream)
    })
})

describe('the back-off', () => {
    it('waits 0.5, 1, 2 then 3 s between attempts', async () => {
        getUserMedia.mockRejectedValue(failure('NotReadableError'))
        render(<MapSourceView surface={surface} />)
        await flush()
        let calls = 1
        let at = 0
        for (const wait of [500, 1000, 2000, 3000, 3000]) {
            await tick(wait - 1)
            expect(getUserMedia).toHaveBeenCalledTimes(calls)
            await tick(1)
            calls += 1
            at += wait
            expect(getUserMedia).toHaveBeenCalledTimes(calls)
        }
        expect(at).toBe(9500)
    })

    it('a feed that opens and ends within a second escalates instead of retrying at 0.5 s', async () => {
        const streams = []
        getUserMedia.mockImplementation(() => { const next = fakeStream(); streams.push(next); return Promise.resolve(next.stream) })
        render(<MapSourceView surface={surface} />)
        await flush()
        await tick(1000)
        act(() => { streams[0].track.dispatchEvent(new Event('ended')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        await tick(1000)
        act(() => { streams[1].track.dispatchEvent(new Event('ended')) })
        await tick(999)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        await tick(1)
        expect(getUserMedia).toHaveBeenCalledTimes(3)
        await tick(1000)
        act(() => { streams[2].track.dispatchEvent(new Event('ended')) })
        await tick(1999)
        expect(getUserMedia).toHaveBeenCalledTimes(3)
        await tick(1)
        expect(getUserMedia).toHaveBeenCalledTimes(4)
    })

    it('starts over at 0.5 s only after the track stayed live for 5 s', async () => {
        const streams = []
        getUserMedia.mockImplementation(() => { const next = fakeStream(); streams.push(next); return Promise.resolve(next.stream) })
        render(<MapSourceView surface={surface} />)
        await flush()
        await tick(1000)
        act(() => { streams[0].track.dispatchEvent(new Event('ended')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        await tick(5000)
        act(() => { streams[1].track.dispatchEvent(new Event('ended')) })
        await tick(499)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        await tick(1)
        expect(getUserMedia).toHaveBeenCalledTimes(3)
    })
})

describe('the default camera (no device asked for)', () => {
    const defaultSurface = normalizeMappingSurface({ id: 's2', resolution: [640, 360], source: { kind: 'camera', ref: '' } })

    it('comes back after it was live, ended, and one re-open was busy', async () => {
        const first = fakeStream()
        const third = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream)
            .mockRejectedValueOnce(failure('NotReadableError'))
            .mockResolvedValueOnce(third.stream)
        const { container } = render(<MapSourceView surface={defaultSurface} />)
        await flush()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(container.textContent).not.toContain('camera unavailable')
        await tick(1000)
        expect(getUserMedia).toHaveBeenCalledTimes(3)
        expect(container.querySelector('video').srcObject).toBe(third.stream)
    })

    it('keeps today\'s immediate message when the very first open fails', async () => {
        getUserMedia.mockRejectedValue(failure('NotReadableError'))
        const { container } = render(<MapSourceView surface={defaultSurface} />)
        await flush()
        await tick(10000)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('camera unavailable')
    })
})

describe('first open of a camera that is not there yet', () => {
    it('does not retry a refused permission', async () => {
        getUserMedia.mockRejectedValue(failure('NotAllowedError'))
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        await tick(10000)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('camera not permitted')
    })

    it('does not retry a permission refused on a re-open after the feed ended', async () => {
        const first = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream).mockRejectedValue(failure('NotAllowedError'))
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(vi.getTimerCount()).toBe(0)
        await tick(10000)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(container.textContent).toContain('camera not permitted')
    })

    it('retries a busy device and then shows it', async () => {
        const live = fakeStream()
        getUserMedia.mockRejectedValueOnce(failure('NotReadableError')).mockResolvedValueOnce(live.stream)
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        await tick(500)
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(container.querySelector('video').srcObject).toBe(live.stream)
    })

    // Review round 2: a pending retry must say so, never a silent black rectangle.
    it('says it is reconnecting while a first open keeps failing, and clears it when the picture is there', async () => {
        const live = fakeStream()
        getUserMedia.mockRejectedValueOnce(failure('NotFoundError')).mockResolvedValueOnce(live.stream)
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        expect(container.textContent).toContain('camera reconnecting')
        expect(container.querySelector('video')).not.toBeNull()
        await tick(500)
        expect(container.querySelector('video').srcObject).toBe(live.stream)
        expect(container.textContent).not.toContain('camera reconnecting')
    })

    it('says it is reconnecting after a live track ended', async () => {
        const first = fakeStream()
        const second = fakeStream()
        getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        expect(container.textContent).not.toContain('camera reconnecting')
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        expect(container.textContent).toContain('camera reconnecting')
        await tick(500)
        expect(container.textContent).not.toContain('camera reconnecting')
    })
})

describe('a stream surface (found by name) whose input drops out of the device list', () => {
    const streamSurface = normalizeMappingSurface({ id: 's3', resolution: [640, 360], source: { kind: 'stream', ref: 'OBS Virtual Camera' } })
    const cam = (deviceId, label = 'OBS Virtual Camera') => ({ kind: 'videoinput', deviceId, label })
    let enumerateDevices
    beforeEach(() => {
        enumerateDevices = vi.fn()
        vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia, enumerateDevices } })
    })

    it('re-opens once the label is back, with no devicechange event', async () => {
        const first = fakeStream()
        const second = fakeStream()
        enumerateDevices.mockResolvedValueOnce([cam('d1')]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([cam('d2')])
        getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValue(second.stream)
        const { container } = render(<MapSourceView surface={streamSurface} />)
        await flush()
        await flush()
        expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'd1' } }, audio: false })
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(10000)
        expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'd2' } }, audio: false })
        expect(container.querySelector('video').srcObject).toBe(second.stream)
    })

    it('does not unmount the camera view for a transient miss', async () => {
        const first = fakeStream()
        enumerateDevices.mockResolvedValueOnce([cam('d1')]).mockResolvedValue([])
        getUserMedia.mockResolvedValue(first.stream)
        const { container } = render(<MapSourceView surface={streamSurface} />)
        await flush()
        await flush()
        const video = container.querySelector('video')
        expect(video).not.toBeNull()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        await tick(1500)
        expect(container.querySelector('video')).toBe(video)
        expect(container.textContent).not.toContain('no input called')
    })

    it('looks again at 0.5, 1, 2 then every 3 s while the label is missing at first', async () => {
        enumerateDevices.mockResolvedValue([cam('z', 'Some Other Camera')])
        const { container } = render(<MapSourceView surface={streamSurface} />)
        await flush()
        expect(container.textContent).toContain('no input called')
        let calls = 1
        for (const wait of [500, 1000, 2000, 3000, 3000]) {
            await tick(wait - 1)
            expect(enumerateDevices).toHaveBeenCalledTimes(calls)
            await tick(1)
            calls += 1
            expect(enumerateDevices).toHaveBeenCalledTimes(calls)
        }
    })

    it('stops looking when it unmounts', async () => {
        enumerateDevices.mockResolvedValue([cam('z', 'Some Other Camera')])
        const { unmount } = render(<MapSourceView surface={streamSurface} />)
        await flush()
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        unmount()
        expect(vi.getTimerCount()).toBe(0)
        const before = enumerateDevices.mock.calls.length
        await tick(10000)
        expect(enumerateDevices).toHaveBeenCalledTimes(before)
    })

    it('runs the hidden-label probe at most once, however many times it looks again', async () => {
        enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'x', label: '' }])
        getUserMedia.mockImplementation(() => Promise.resolve(fakeStream().stream))
        render(<MapSourceView surface={streamSurface} />)
        await flush()
        await flush()
        await tick(10000)
        expect(enumerateDevices.mock.calls.length).toBeGreaterThan(4)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
    })
})
