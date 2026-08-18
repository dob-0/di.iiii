import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ImagePanelWindow from './ImagePanelWindow.jsx'

describe('ImagePanelWindow', () => {
    it('renders a selected project image asset', () => {
        render(
            <ImagePanelWindow
                node={{ id: 'image-1', typeId: 'view.image', label: 'Image', values: { src: 'asset-1' } }}
                assetMap={new Map([
                    ['asset-1', { id: 'asset-1', name: 'poster.webp', url: '/assets/poster.webp' }]
                ])}
            />
        )

        expect(screen.getByRole('img', { name: 'poster.webp' })).toBeTruthy()
    })

    // view.image.src is a texture input and source.webcam.frame is a texture
    // output, so the edge has always been legal — the panel just ignored it and
    // showed "No image selected yet." next to a wire carrying live video. The
    // repo's own all-nodes example documented this as impossible until the
    // 2026-08-18 port audit. A DOM element cannot be mounted twice, so the
    // frame is copied to a canvas rather than the <video> being re-parented.
    it('draws a wired live texture to a canvas instead of claiming nothing is set', () => {
        const video = document.createElement('video')
        Object.defineProperty(video, 'videoWidth', { value: 320 })
        Object.defineProperty(video, 'videoHeight', { value: 240 })
        const { container } = render(
            <ImagePanelWindow
                node={{ id: 'image-live', typeId: 'view.image', label: 'Image', values: {} }}
                values={{ src: { image: video, isTexture: true } }}
                assetMap={new Map()}
            />
        )

        expect(container.querySelector('canvas')).toBeTruthy()
        expect(screen.queryByText('No image selected yet.')).toBeNull()
    })

    it('does not mistake a texture object for an asset id', () => {
        const get = vi.fn()
        render(
            <ImagePanelWindow
                node={{ id: 'image-live-2', typeId: 'view.image', label: 'Image', values: {} }}
                values={{ src: { image: document.createElement('video') } }}
                assetMap={{ get }}
            />
        )
        expect(get).not.toHaveBeenCalled()
    })

    it('shows an empty state when no image is assigned', () => {
        render(
            <ImagePanelWindow
                node={{ id: 'image-empty', typeId: 'view.image', label: 'Image', values: {} }}
                assetMap={new Map()}
            />
        )

        expect(screen.getByText('No image selected yet.')).toBeTruthy()
    })
})
