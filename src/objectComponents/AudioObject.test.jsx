import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AudioObject, { resolveAudioSrc } from './AudioObject.jsx'

vi.mock('@react-three/drei', () => ({
    PositionalAudio: () => null,
    Sphere: ({ children }) => <group>{children}</group>
}))

let mockAssetUrl = 'https://example.com/track.flac'
vi.mock('../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => mockAssetUrl
}))

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('AudioObject html-audio fallback teardown', () => {
    // Regression test for audit finding #28: the fallback <audio> element's
    // per-render effect cleanup only paused playback, never releasing .src
    // or the ref on the component's real unmount — leaking a live HTMLAudio
    // element (and its network/decoder resources) after the node was removed.
    it('clears src and pauses on final unmount', () => {
        const instances = []
        const OriginalAudio = window.Audio
        function FakeAudio(url) {
            this.src = url
            this.pause = vi.fn()
            instances.push(this)
        }
        window.Audio = FakeAudio

        const { unmount } = render(
            <AudioObject assetRef={{ mimeType: 'audio/flac' }} data="https://example.com/track.flac" />
        )

        expect(instances).toHaveLength(1)
        const audioEl = instances[0]

        unmount()

        expect(audioEl.pause).toHaveBeenCalled()
        expect(audioEl.src).toBe('')

        window.Audio = OriginalAudio
    })
})

// Regression test for audit batch 2: HTMLMediaElement.src always reads back
// ABSOLUTE, while sourceUrl is a server-relative `/serverXR/api/…` path in
// every real document — so `audioEl.src !== sourceUrl` was always true. Every
// effect re-run (a collaborator nudging media.volume via a remote op, a loop
// toggle, an editor volume slider tick) paused, reassigned src and restarted
// the track from zero.
describe('AudioObject source-change detection', () => {
    const withFakeAudio = () => {
        const instances = []
        function FakeAudio(url) {
            // Match the browser: reading .src gives back an absolute URL.
            let raw = url
            this.srcAssignments = 0
            Object.defineProperty(this, 'src', {
                get: () => (raw ? new URL(raw, window.location.href).href : ''),
                set: (next) => { raw = next; this.srcAssignments += 1 },
                configurable: true
            })
            this.pause = vi.fn()
            this.play = vi.fn(async () => {})
            instances.push(this)
        }
        window.Audio = FakeAudio
        return instances
    }

    it('does not reload the element when only volume changes on a relative url', () => {
        mockAssetUrl = '/serverXR/api/projects/p/assets/a1'
        const OriginalAudio = window.Audio
        const instances = withFakeAudio()

        const { rerender } = render(
            <AudioObject assetRef={{ mimeType: 'audio/flac' }} data="x" audioVolume={0.5} />
        )
        expect(instances).toHaveLength(1)
        const audioEl = instances[0]
        const before = audioEl.srcAssignments

        rerender(<AudioObject assetRef={{ mimeType: 'audio/flac' }} data="x" audioVolume={0.9} />)

        // A volume change must not reassign src (which restarts playback at 0
        // and re-buffers the file); only a genuine source change may.
        expect(instances).toHaveLength(1)
        expect(audioEl.srcAssignments).toBe(before)
        window.Audio = OriginalAudio
        mockAssetUrl = 'https://example.com/track.flac'
    })

    it('resolveAudioSrc matches what the element reports back', () => {
        expect(resolveAudioSrc('/serverXR/api/a')).toBe(new URL('/serverXR/api/a', window.location.href).href)
        expect(resolveAudioSrc('https://example.com/t.flac')).toBe('https://example.com/t.flac')
        expect(resolveAudioSrc('')).toBe('')
    })
})
