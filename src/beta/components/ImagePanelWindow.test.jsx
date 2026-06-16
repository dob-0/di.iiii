import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
