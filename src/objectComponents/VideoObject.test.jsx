import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoObject, { hasUsableVideoFrame } from './VideoObject.jsx'

const { videoTextureMock } = vi.hoisted(() => ({
    videoTextureMock: vi.fn(function MockVideoTexture(video) {
        this.video = video
        this.dispose = vi.fn()
    })
}))

vi.mock('three', () => ({
    VideoTexture: videoTextureMock,
    SRGBColorSpace: 'srgb',
    LinearFilter: 'linear'
}))

vi.mock('@react-three/drei', () => ({
    Html: ({ children }) => <div>{children}</div>
}))

vi.mock('../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => null
}))

describe('VideoObject', () => {
    let createElementSpy
    let originalCreateElement
    let fakeVideo
    let videoListeners
    let consoleErrorSpy

    beforeEach(() => {
        videoTextureMock.mockClear()
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        originalCreateElement = document.createElement.bind(document)
        videoListeners = new Map()
        fakeVideo = {
            readyState: 0,
            videoWidth: 0,
            videoHeight: 0,
            setAttribute: vi.fn(),
            load: vi.fn(),
            play: vi.fn().mockResolvedValue(undefined),
            pause: vi.fn(),
            addEventListener: vi.fn((name, handler) => {
                videoListeners.set(name, handler)
            }),
            removeEventListener: vi.fn((name, handler) => {
                if (videoListeners.get(name) === handler) {
                    videoListeners.delete(name)
                }
            })
        }
        createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
            if (tagName === 'video') {
                return fakeVideo
            }
            return originalCreateElement(tagName, options)
        })
    })

    afterEach(() => {
        createElementSpy?.mockRestore()
        consoleErrorSpy?.mockRestore()
    })

    it('recognizes only decoded videos with dimensions as usable WebGL texture sources', () => {
        expect(hasUsableVideoFrame({ readyState: 1, videoWidth: 640, videoHeight: 360 })).toBe(false)
        expect(hasUsableVideoFrame({ readyState: 2, videoWidth: 0, videoHeight: 360 })).toBe(false)
        expect(hasUsableVideoFrame({ readyState: 2, videoWidth: 640, videoHeight: 360 })).toBe(true)
    })

    it('waits for loaded video data before constructing a VideoTexture', async () => {
        render(<VideoObject data="/clip.mp4" assetRef={{ mimeType: 'video/mp4' }} />)

        await Promise.resolve()
        expect(videoTextureMock).not.toHaveBeenCalled()

        act(() => {
            fakeVideo.readyState = 1
            fakeVideo.videoWidth = 1280
            fakeVideo.videoHeight = 720
            videoListeners.get('loadedmetadata')?.()
        })
        expect(videoTextureMock).not.toHaveBeenCalled()

        act(() => {
            fakeVideo.readyState = 2
            videoListeners.get('loadeddata')?.()
        })

        await waitFor(() => {
            expect(videoTextureMock).toHaveBeenCalledTimes(1)
        })
        expect(videoTextureMock).toHaveBeenCalledWith(fakeVideo)

        act(() => {
            videoListeners.get('canplay')?.()
        })
        expect(videoTextureMock).toHaveBeenCalledTimes(1)
    })
})
