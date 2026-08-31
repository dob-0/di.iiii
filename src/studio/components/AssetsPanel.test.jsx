import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetsPanel } from './StudioShellPanels.jsx'

const libraryItems = [
    {
        id: 'img-1',
        name: 'photo.png',
        mimeType: 'image/png',
        url: '/serverXR/api/spaces/main/assets/img-1',
        inProject: true,
        inSpace: true,
        shared: true,
        usedByCount: 2
    },
    {
        id: 'doc-1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        url: '/serverXR/api/spaces/main/assets/doc-1',
        inProject: false,
        inSpace: true,
        shared: false,
        usedByCount: 0
    },
    {
        id: 'model-1',
        name: 'tree.glb',
        mimeType: 'model/gltf-binary',
        url: '/api/projects/p/assets/model-1',
        inProject: true,
        inSpace: false,
        shared: false,
        usedByCount: 0
    }
]

describe('AssetsPanel unified Files library', () => {
    it('renders one merged list with residency, usage, and public badges', () => {
        render(<AssetsPanel libraryItems={libraryItems} />)

        expect(screen.getByText('Files (3)')).toBeInTheDocument()
        expect(screen.getByTitle('photo.png — project · space')).toBeInTheDocument()
        expect(screen.getByTitle('notes.txt — space')).toBeInTheDocument()
        expect(screen.getByTitle('tree.glb — project')).toBeInTheDocument()
        expect(screen.getByText('placed ×2')).toBeInTheDocument()
        expect(screen.getByText('public')).toBeInTheDocument()
    })

    it('gates + Add by placeability and Share by space residency', () => {
        const onCreateFromAsset = vi.fn()
        render(
            <AssetsPanel
                libraryItems={libraryItems}
                onCreateFromAsset={onCreateFromAsset}
                onToggleAssetShared={() => {}}
            />
        )

        const addButtons = screen.getAllByRole('button', { name: '+ Add' })
        expect(addButtons).toHaveLength(3)
        // notes.txt (text/plain) is not placeable in the scene
        const disabled = addButtons.filter((b) => b.disabled)
        expect(disabled).toHaveLength(1)

        // Share/Public only for files that live in the space store
        expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /^(Share|Public)$/ })).toHaveLength(2)

        fireEvent.click(addButtons[0])
        expect(onCreateFromAsset).toHaveBeenCalledWith(libraryItems[0])
    })

    it('exposes delete per row and an empty state without items', () => {
        const onDeleteLibraryItem = vi.fn()
        const { rerender } = render(
            <AssetsPanel libraryItems={libraryItems} onDeleteLibraryItem={onDeleteLibraryItem} />
        )

        const deleteButtons = screen.getAllByTitle('Delete this file')
        expect(deleteButtons).toHaveLength(3)
        fireEvent.click(deleteButtons[1])
        expect(onDeleteLibraryItem).toHaveBeenCalledWith(libraryItems[1])

        rerender(<AssetsPanel libraryItems={[]} />)
        expect(screen.getByText(/No files yet/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /How content flows/ })).toHaveAttribute('href', '/wiki#studio-content-model')
    })
})
