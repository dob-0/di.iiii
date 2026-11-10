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

    it('makes no further call when it unmounts during the back-off', async () => {
        const first = fakeStream()
        getUserMedia.mockResolvedValue(first.stream)
        const { unmount } = render(<MapSourceView surface={surface} />)
        await flush()
        act(() => { first.track.dispatchEvent(new Event('ended')) })
        unmount()
        await tick(10000)
        expect(getUserMedia).toHaveBeenCalledTimes(1)
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
})
