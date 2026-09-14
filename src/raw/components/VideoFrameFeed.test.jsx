import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const fakeTexture = { isTexture: true }
let hookResult = { texture: null }
vi.mock('../../objectComponents/VideoObject.jsx', () => ({
    default: () => null,
    useVideoTextureSource: vi.fn(() => hookResult)
}))
vi.mock('../../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => '/assets/clip.mp4'
}))

import VideoFrameFeed from './VideoFrameFeed.jsx'
import { useVideoTextureSource } from '../../objectComponents/VideoObject.jsx'

const node = { id: 'vid-1', typeId: 'media.video', values: { src: 'a1' } }
const asset = { id: 'a1', mimeType: 'video/mp4', url: '/assets/clip.mp4' }

describe('VideoFrameFeed', () => {
    it('publishes the playing texture into the frame side channel', () => {
        hookResult = { texture: fakeTexture }
        const onFrameChange = vi.fn()
        render(<VideoFrameFeed node={node} asset={asset} onFrameChange={onFrameChange} />)
        expect(onFrameChange).toHaveBeenCalledWith('vid-1', fakeTexture)
    })

    it('publishes null while nothing plays, and clears on unmount', () => {
        hookResult = { texture: null }
        const onFrameChange = vi.fn()
        const view = render(<VideoFrameFeed node={node} asset={asset} onFrameChange={onFrameChange} />)
        expect(onFrameChange).toHaveBeenCalledWith('vid-1', null)
        hookResult = { texture: fakeTexture }
        view.rerender(<VideoFrameFeed node={node} asset={asset} onFrameChange={onFrameChange} />)
        onFrameChange.mockClear()
        view.unmount()
        expect(onFrameChange).toHaveBeenCalledWith('vid-1', null)
    })

    it('is a silent tap: never unmuted, never re-keyed by a volume move', () => {
        hookResult = { texture: fakeTexture }
        useVideoTextureSource.mockClear()
        const loud = { ...node, values: { src: 'a1', muted: false, volume: 0.3 } }
        const view = render(<VideoFrameFeed node={loud} asset={asset} values={loud.values} onFrameChange={() => {}} />)
        view.rerender(<VideoFrameFeed node={loud} asset={asset} values={{ ...loud.values, volume: 0.9 }} onFrameChange={() => {}} />)
        const settings = useVideoTextureSource.mock.calls.map((call) => call[1])
        expect(settings.every((entry) => entry.muted === true && entry.volume === 1)).toBe(true)
    })

    it('reads a wired Loop from the resolved values', () => {
        useVideoTextureSource.mockClear()
        render(<VideoFrameFeed node={node} asset={asset} values={{ src: 'a1', loop: false }} onFrameChange={() => {}} />)
        expect(useVideoTextureSource.mock.lastCall[1].loop).toBe(false)
    })
})
