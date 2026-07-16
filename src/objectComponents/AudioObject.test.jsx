import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AudioObject from './AudioObject.jsx'

vi.mock('@react-three/drei', () => ({
    PositionalAudio: () => null,
    Sphere: ({ children }) => <group>{children}</group>
}))

vi.mock('../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => 'https://example.com/track.flac'
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
