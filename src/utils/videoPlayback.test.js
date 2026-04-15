import { describe, expect, it, vi } from 'vitest'
import { attachVideoPlaybackRetry, configureVideoElement } from './videoPlayback.js'

describe('videoPlayback helpers', () => {
    it('configures videos for muted inline autoplay', () => {
        const setAttribute = vi.fn()
        const load = vi.fn()
        const video = { setAttribute, load }

        configureVideoElement(video, 'http://localhost:4000/video.mp4', { preload: 'metadata' })

        expect(video.muted).toBe(true)
        expect(video.defaultMuted).toBe(true)
        expect(video.volume).toBe(0)
        expect(video.autoplay).toBe(true)
        expect(video.playsInline).toBe(true)
        expect(video.preload).toBe('metadata')
        expect(video.crossOrigin).toBe('anonymous')
        expect(video.src).toBe('http://localhost:4000/video.mp4')
        expect(load).toHaveBeenCalled()
        expect(setAttribute).toHaveBeenCalledWith('muted', '')
        expect(setAttribute).toHaveBeenCalledWith('playsinline', '')
    })

    it('retries playback after the initial autoplay block', async () => {
        const addEventListener = vi.fn()
        const removeEventListener = vi.fn()
        const onBlockedChange = vi.fn()
        const play = vi.fn()
            .mockRejectedValueOnce(new Error('blocked'))
            .mockResolvedValueOnce(undefined)
        const videoListeners = new Map()
        const video = {
            play,
            addEventListener: vi.fn((name, handler) => {
                videoListeners.set(name, handler)
            }),
            removeEventListener: vi.fn()
        }

        const windowAddSpy = vi.spyOn(window, 'addEventListener').mockImplementation(addEventListener)
        const windowRemoveSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(removeEventListener)
        const documentAddSpy = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
        const documentRemoveSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})

        const detach = attachVideoPlaybackRetry(video, { onBlockedChange })

        await Promise.resolve()
        expect(onBlockedChange).toHaveBeenCalledWith(true)
        expect(addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), { passive: true })

        const pointerRetry = addEventListener.mock.calls.find(([name]) => name === 'pointerdown')?.[1]
        await pointerRetry?.()
        await Promise.resolve()

        expect(play).toHaveBeenCalledTimes(2)
        expect(onBlockedChange).toHaveBeenCalledWith(false)

        detach()
        expect(windowRemoveSpy).toHaveBeenCalled()
        expect(documentRemoveSpy).toHaveBeenCalled()

        windowAddSpy.mockRestore()
        windowRemoveSpy.mockRestore()
        documentAddSpy.mockRestore()
        documentRemoveSpy.mockRestore()
    })
})
