import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { captureCanvasPicture, SCENE_PICTURE_FPS } from './canvasPicture.js'

const fakeStream = () => {
    const track = { stop: vi.fn() }
    return { track, stream: { getTracks: () => [track] } }
}
const fakeVideo = () => ({ play: vi.fn(() => Promise.resolve()), pause: vi.fn(), srcObject: undefined })

describe('captureCanvasPicture — a drawn canvas as a picture on a wire', () => {
    it('captures at the Scene rate into a VideoTexture, the webcam\'s own kind', () => {
        const { stream } = fakeStream()
        const canvas = { captureStream: vi.fn(() => stream) }
        const video = fakeVideo()
        const capture = captureCanvasPicture(canvas, { createVideo: () => video })
        expect(canvas.captureStream).toHaveBeenCalledWith(SCENE_PICTURE_FPS)
        expect(capture.texture).toBeInstanceOf(THREE.VideoTexture)
        expect(video.srcObject).toBe(stream)
        expect(video.muted).toBe(true)
        expect(video.play).toHaveBeenCalled()
    })

    it('stop() ends every track and frees the texture', () => {
        const { track, stream } = fakeStream()
        const video = fakeVideo()
        const capture = captureCanvasPicture({ captureStream: () => stream }, { createVideo: () => video })
        const dispose = vi.spyOn(capture.texture, 'dispose')
        capture.stop()
        expect(track.stop).toHaveBeenCalled()
        expect(dispose).toHaveBeenCalled()
        expect(video.srcObject).toBeNull()
    })

    it('no capture in this browser → null, never a fake picture', () => {
        expect(captureCanvasPicture(null)).toBeNull()
        expect(captureCanvasPicture({})).toBeNull()
        expect(captureCanvasPicture({ captureStream: () => { throw new Error('tainted') } })).toBeNull()
    })
})
