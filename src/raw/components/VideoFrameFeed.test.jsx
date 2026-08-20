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
})
