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

    // /wcc/main's meri-andreasyan has three entities on one 12.36MB clip.
    // Before sharing, that was three downloads of identical bytes.
    it('shares one element across objects with the same source and settings', () => {
        const created = countCreatedVideos()

        render(
            <>
                <VideoObject assetRef={{ mimeType: 'video/mp4' }} />
                <VideoObject assetRef={{ mimeType: 'video/mp4' }} />
                <VideoObject assetRef={{ mimeType: 'video/mp4' }} />
            </>
        )

        expect(created).toHaveLength(1)
    })

    // An HTMLVideoElement has one volume. Sharing across objects that disagree
    // would let whichever mounted last silently win for all of them.
    it('does not share across objects whose playback settings differ', () => {
        const created = countCreatedVideos()

        render(
            <>
                <VideoObject assetRef={{ mimeType: 'video/mp4' }} muted volume={1} />
                <VideoObject assetRef={{ mimeType: 'video/mp4' }} muted={false} volume={0.3} />
            </>
        )

        expect(created).toHaveLength(2)
    })

    it('keeps the shared element alive until the last object lets go', () => {
        const created = countCreatedVideos()

        const first = render(<VideoObject assetRef={{ mimeType: 'video/mp4' }} />)
        const second = render(<VideoObject assetRef={{ mimeType: 'video/mp4' }} />)
        expect(created).toHaveLength(1)

        first.unmount()
        expect(created[0].getAttribute('src')).toBe('https://example.com/clip.mp4')

        second.unmount()
        expect(created[0].getAttribute('src')).toBe('')
    })
})
