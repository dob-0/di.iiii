import { describe, expect, it, vi } from 'vitest'
import { cameraPoolSize, openSharedCamera } from './cameraPool.js'

const fakeMedia = () => {
    const opened = []
    const makeStream = (label) => {
        const tracks = [{ label, stopped: false, stop() { this.stopped = true } }]
        return { tracks, getTracks: () => tracks, clone: () => makeStream(label + '-clone') }
    }
    return { opened, getUserMedia: vi.fn(async () => { const s = makeStream('cam'); opened.push(s); return s }) }
}
const dev = (id) => ({ video: { deviceId: { exact: id } }, audio: false })

describe('one camera, one reader per page', () => {
    it('two openers of the same device open it once', async () => {
        const media = fakeMedia()
        const [a, b] = await Promise.all([openSharedCamera(media, dev('phone')), openSharedCamera(media, dev('phone'))])
        expect(media.getUserMedia).toHaveBeenCalledTimes(1)
        expect(a).not.toBe(b)
    })
    it('releases the device only when the last one stops', async () => {
        const media = fakeMedia()
        const a = await openSharedCamera(media, dev('phone2'))
        const b = await openSharedCamera(media, dev('phone2'))
        a.getTracks().forEach((t) => t.stop())
        expect(media.opened[0].tracks[0].stopped).toBe(false)
        b.getTracks().forEach((t) => t.stop())
        expect(media.opened[0].tracks[0].stopped).toBe(true)
        expect(cameraPoolSize()).toBe(1)
    })
    it('another device is opened separately; a failed open is not cached', async () => {
        const media = fakeMedia()
        await openSharedCamera(media, dev('a')); await openSharedCamera(media, dev('b'))
        expect(media.getUserMedia).toHaveBeenCalledTimes(2)
        const bad = { getUserMedia: vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue({ getTracks: () => [], clone() { return this } }) }
        await expect(openSharedCamera(bad, dev('c'))).rejects.toThrow('busy')
        await openSharedCamera(bad, dev('c'))
        expect(bad.getUserMedia).toHaveBeenCalledTimes(2)
    })
})
