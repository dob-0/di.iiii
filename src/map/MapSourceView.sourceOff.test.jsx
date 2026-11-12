import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    apiBaseUrl: 'https://diiii.xyz/serverXR'
}))

import MapSourceView from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'
import { cameraSourceKey, resetSourcesOffForTest, setSourceOff } from '../project/tops/sourceSwitch.js'

// Source switch review note: switching a camera off stopped the tracks but the <video>
// kept its srcObject (last frame on screen, stream object held). It must be let go.
const surface = normalizeMappingSurface({ id: 's1', resolution: [640, 360], source: { kind: 'camera', ref: 'dev1' } })
const fakeStream = () => {
    const track = Object.assign(new EventTarget(), { label: 'Front', readyState: 'live', stop: vi.fn() })
    const stream = Object.assign(new EventTarget(), { getTracks: () => [track], getVideoTracks: () => [track] })
    return { stream, track }
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

let getUserMedia
let made
beforeEach(() => {
    localStorage.clear()
    resetSourcesOffForTest()
    made = []
    getUserMedia = vi.fn(async () => { const one = fakeStream(); made.push(one); return one.stream })
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
})
afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    resetSourcesOffForTest()
})

describe('MapSourceView and the source switch', () => {
    it('off lets go of the stream on the video; on asks for a fresh one', async () => {
        const { container } = render(<MapSourceView surface={surface} />)
        await flush()
        const video = container.querySelector('video')
        expect(video.srcObject).toBe(made[0].stream)
        act(() => { setSourceOff(cameraSourceKey('Front'), true) })
        await flush()
        expect(made[0].track.stop).toHaveBeenCalled()
        expect(video.srcObject).toBe(null)
        act(() => { setSourceOff(cameraSourceKey('Front'), false) })
        await flush()
        const fresh = made[made.length - 1]
        expect(fresh).not.toBe(made[0])
        expect(video.srcObject).toBe(fresh.stream)
    })
    it('unmount lets go of the stream on the video', async () => {
        const { container, unmount } = render(<MapSourceView surface={surface} />)
        await flush()
        const video = container.querySelector('video')
        expect(video.srcObject).toBe(made[0].stream)
        unmount()
        expect(video.srcObject).toBe(null)
    })
})
