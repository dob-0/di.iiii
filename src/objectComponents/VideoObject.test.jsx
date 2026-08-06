import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoObject from './VideoObject.jsx'

vi.mock('@react-three/drei', () => ({
    Html: () => null
}))

vi.mock('three', () => {
    class VideoTexture {
        constructor(video) { this.image = video }
        dispose() {}
    }
    return {
        VideoTexture,
        SRGBColorSpace: 'srgb',
        LinearFilter: 1006,
        DoubleSide: 2
    }
})

vi.mock('../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => 'https://example.com/clip.mp4'
}))

vi.mock('../utils/videoPlayback.js', () => ({
    attachVideoPlaybackRetry: () => () => {},
    attachVideoSound: () => () => {},
    configureVideoElement: (video, src) => { video.src = src }
}))

const countCreatedVideos = () => {
    const created = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
        const el = realCreate(tag, ...rest)
        if (String(tag).toLowerCase() === 'video') created.push(el)
        return el
    })
    return created
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('VideoObject network cost', () => {
    // The plane's aspect ratio used to come from a SECOND <video> created only
    // to read videoWidth/videoHeight, so every video in the app was fetched
    // twice. On /wcc/main — which embeds ten artist projects at once — that
    // turned three objects sharing one 12.36MB clip into six downloads and
    // 74MB of transfer. One element per source, or that comes straight back.
    it('creates exactly one video element per source', () => {
        const created = countCreatedVideos()

        render(<VideoObject assetRef={{ mimeType: 'video/mp4' }} />)

        expect(created).toHaveLength(1)
        expect(created[0].src).toBe('https://example.com/clip.mp4')
    })

    it('releases the element on unmount', () => {
        const created = countCreatedVideos()

        const { unmount } = render(<VideoObject assetRef={{ mimeType: 'video/mp4' }} />)
        expect(created).toHaveLength(1)
        unmount()

        // Read the attribute, not .src — jsdom resolves an empty src against
        // the document base URL and hands back "http://localhost:3000/".
        expect(created[0].getAttribute('src')).toBe('')
    })
})
