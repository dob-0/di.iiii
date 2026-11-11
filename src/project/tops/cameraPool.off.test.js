import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraPoolSize, openSharedCamera } from './cameraPool.js'
import { cameraSourceKey, resetSourcesOffForTest, setSourceOff } from './sourceSwitch.js'

// A mocked navigator.mediaDevices: two cameras, each capture has a label and clones.
let serial = 0
const makeMedia = () => {
    const tag = (serial += 1) // the pool is module state: each test gets its own device ids
    const devices = [
        { kind: 'videoinput', deviceId: `id-front-${tag}`, label: 'Front' },
        { kind: 'videoinput', deviceId: `id-back-${tag}`, label: 'Back' }
    ]
    const masters = []
    const stream = (label) => {
        const tracks = [{ label, stopped: false, stop() { this.stopped = true } }]
        return { tracks, getTracks: () => tracks, getVideoTracks: () => tracks, clone: () => stream(label) }
    }
    const pending = []
    const media = {
        front: `id-front-${tag}`,
        back: `id-back-${tag}`,
        masters,
        pending,
        enumerateDevices: vi.fn(async () => devices),
        getUserMedia: vi.fn((constraints) => {
            const id = constraints.video.deviceId.exact
            const label = devices.find((device) => device.deviceId === id).label
            const master = stream(label)
            masters.push(master)
            if (media.hold) return new Promise((resolve) => pending.push(() => resolve(master)))
            return Promise.resolve(master)
        })
    }
    return media
}
const dev = (id) => ({ video: { deviceId: { exact: id } }, audio: false })
const stopped = (stream) => stream.getTracks().every((track) => track.stopped)

beforeEach(() => { localStorage.clear(); resetSourcesOffForTest() })
afterEach(() => { localStorage.clear(); resetSourcesOffForTest() })

describe('camera pool and the source switch', () => {
    it('off releases every stream of that source at once, and no other', async () => {
        const media = makeMedia()
        const a = await openSharedCamera(media, dev(media.front))
        const b = await openSharedCamera(media, dev(media.front))
        const other = await openSharedCamera(media, dev(media.back))
        setSourceOff(cameraSourceKey('Front'), true)
        expect(stopped(a)).toBe(true)
        expect(stopped(b)).toBe(true)
        expect(media.masters[0].tracks[0].stopped).toBe(true)
        expect(stopped(other)).toBe(false)
        expect(media.masters[1].tracks[0].stopped).toBe(false)
    })
    it('blocks a new getUserMedia for the source while it is off, then opens again when on', async () => {
        const media = makeMedia()
        setSourceOff(cameraSourceKey('Front'), true)
        await expect(openSharedCamera(media, dev(media.front))).rejects.toMatchObject({ name: 'SourceOff' })
        expect(media.getUserMedia).not.toHaveBeenCalled()
        await openSharedCamera(media, dev(media.back))
        expect(media.getUserMedia).toHaveBeenCalledTimes(1)
        setSourceOff(cameraSourceKey('Front'), false)
        const again = await openSharedCamera(media, dev(media.front))
        expect(stopped(again)).toBe(false)
        expect(media.getUserMedia).toHaveBeenCalledTimes(2)
    })
    it('an open that resolves after the switch went off is stopped and refused', async () => {
        const media = makeMedia()
        media.hold = true
        const opening = openSharedCamera(media, dev(media.front))
        await vi.waitFor(() => expect(media.pending.length).toBe(1))
        setSourceOff(cameraSourceKey('Front'), true)
        media.pending[0]()
        await expect(opening).rejects.toMatchObject({ name: 'SourceOff' })
        expect(media.masters[0].tracks[0].stopped).toBe(true)
    })
    it('the default camera is settled by the capture label', async () => {
        const media = makeMedia()
        media.getUserMedia.mockImplementationOnce(async () => { const s = { tracks: [{ label: 'Front', stopped: false, stop() { this.stopped = true } }] }; s.getTracks = () => s.tracks; s.clone = () => s; return s })
        setSourceOff(cameraSourceKey('Front'), true)
        await expect(openSharedCamera(media, { video: true, audio: false })).rejects.toMatchObject({ name: 'SourceOff' })
    })
    it('with nothing off the pool asks nothing extra', async () => {
        const media = makeMedia()
        await openSharedCamera(media, dev(media.front))
        expect(media.enumerateDevices).not.toHaveBeenCalled()
        expect(cameraPoolSize()).toBeGreaterThan(0)
    })
})
