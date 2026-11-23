import { describe, expect, it, vi } from 'vitest'
import { hasNewFrame, watchVideoFrames } from './videoFrames.js'

const fakeVideo = () => {
    const callbacks = []
    return {
        paused: false, currentTime: 0,
        requestVideoFrameCallback: vi.fn((fn) => { callbacks.push(fn); return callbacks.length }),
        cancelVideoFrameCallback: vi.fn(),
        newFrame() { const fn = callbacks.shift(); fn?.() }
    }
}

describe('video frame watch', () => {
    it('is null where the browser cannot say', () => {
        expect(watchVideoFrames({})).toBeNull()
    })

    it('a video with no new frame is not uploaded again', () => {
        const video = fakeVideo()
        const watch = watchVideoFrames(video)
        const slot = { lastVideoTime: undefined }
        expect(hasNewFrame(slot, video, watch, true)).toBe(true) // the first look
        slot.lastVideoTime = 0.5
        video.currentTime = 0.52 // a live stream's clock moves on every tick
        expect(hasNewFrame(slot, video, watch, true)).toBe(false)
        expect(hasNewFrame(slot, video, watch, true)).toBe(false)
        video.newFrame()
        expect(hasNewFrame(slot, video, watch, true)).toBe(true)
        expect(hasNewFrame(slot, video, watch, true)).toBe(false)
    })

    it('a paused video that was seeked is uploaded', () => {
        const video = fakeVideo()
        const watch = watchVideoFrames(video)
        const slot = { lastVideoTime: 1 }
        hasNewFrame(slot, video, watch, false)
        video.paused = true
        expect(hasNewFrame(slot, video, watch, true)).toBe(true)
        expect(hasNewFrame(slot, video, watch, false)).toBe(false)
    })

    it('without a watch it is the old currentTime answer', () => {
        expect(hasNewFrame({}, {}, null, true)).toBe(true)
        expect(hasNewFrame({}, {}, null, false)).toBe(false)
    })

    it('stop cancels the pending callback and no more are asked for', () => {
        const video = fakeVideo()
        const watch = watchVideoFrames(video)
        watch.stop()
        expect(video.cancelVideoFrameCallback).toHaveBeenCalled()
        video.newFrame()
        expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1)
    })
})
