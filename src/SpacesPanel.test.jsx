import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpacesPanel from './SpacesPanel.jsx'

vi.mock('./hooks/usePanelDrag.js', () => ({
    usePanelDrag: () => ({
        panelRef: { current: null },
        dragProps: {},
        dragStyle: {},
        isDragging: false,
        panelPointerProps: {}
    })
}))

vi.mock('./hooks/usePanelResize.js', () => ({
    usePanelResize: () => ({
        width: 320,
        height: 400,
        resizerProps: {},
        isResizing: false
    })
}))

describe('SpacesPanel', () => {
    it('lets admins choose where a newly created space opens next', () => {
        const handleOpenAfterCreateTargetChange = vi.fn()

        render(
            <SpacesPanel
                spaces={[]}
                currentSpaceId="main"
                newSpaceName=""
                onSpaceNameChange={vi.fn()}
                openAfterCreateTarget="public"
                onOpenAfterCreateTargetChange={handleOpenAfterCreateTargetChange}
                canCreateSpace
                ttlHours={24}
                isCreatingSpace={false}
                onCreateSpace={vi.fn()}
                onCreatePermanentSpace={vi.fn()}
                onOpenSpace={vi.fn()}
                onCopyLink={vi.fn()}
                onDeleteSpace={vi.fn()}
                onTogglePermanent={vi.fn()}
                onClose={vi.fn()}
                surfaceMode="sheet"
            />
        )

        expect(screen.getByLabelText('Open After Create')).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Public route' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Studio workspace' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Beta workspace' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Admin page' })).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Open After Create'), {
            target: { value: 'beta' }
        })

        expect(handleOpenAfterCreateTargetChange).toHaveBeenCalledWith('beta')
    })

    it('exposes a rename action for existing spaces', () => {
        const handleRenameSpace = vi.fn()

        render(
            <SpacesPanel
                spaces={[{
                    id: 'gallery',
                    label: 'Gallery',
                    isPermanent: true,
                    lastActive: Date.now()
                }]}
                currentSpaceId="main"
                newSpaceName=""
                onSpaceNameChange={vi.fn()}
                openAfterCreateTarget="public"
                onOpenAfterCreateTargetChange={vi.fn()}
                canCreateSpace
                ttlHours={24}
                isCreatingSpace={false}
                onCreateSpace={vi.fn()}
                onCreatePermanentSpace={vi.fn()}
                onOpenSpace={vi.fn()}
                onCopyLink={vi.fn()}
                onDeleteSpace={vi.fn()}
                onRenameSpace={handleRenameSpace}
                onTogglePermanent={vi.fn()}
                onClose={vi.fn()}
                surfaceMode="sheet"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

        expect(handleRenameSpace).toHaveBeenCalledWith('gallery')
    })

    it('shows the live link and public toggle for a public owned space', () => {
        const handleTogglePublic = vi.fn()

        render(
            <SpacesPanel
                spaces={[{
                    id: 'gallery',
                    label: 'Gallery',
                    isPermanent: true,
                    isPublic: true,
                    isOwner: true,
                    lastActive: Date.now()
                }]}
                currentSpaceId="main"
                newSpaceName=""
                onSpaceNameChange={vi.fn()}
                openAfterCreateTarget="public"
                onOpenAfterCreateTargetChange={vi.fn()}
                canCreateSpace
                ttlHours={24}
                isCreatingSpace={false}
                onCreateSpace={vi.fn()}
                onCreatePermanentSpace={vi.fn()}
                onOpenSpace={vi.fn()}
                onCopyLink={vi.fn()}
                onDeleteSpace={vi.fn()}
                onRenameSpace={vi.fn()}
                onTogglePermanent={vi.fn()}
                onTogglePublic={handleTogglePublic}
                onClose={vi.fn()}
                surfaceMode="sheet"
            />
        )

        expect(screen.getByText('live')).toBeInTheDocument()
        expect(screen.getByText(/\/gallery$/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View Live' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy Live Link' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Make Private' }))

        expect(handleTogglePublic).toHaveBeenCalledWith('gallery', false)
    })

    it('offers a make-public toggle on a private owned space', () => {
        const handleTogglePublic = vi.fn()

        render(
            <SpacesPanel
                spaces={[{
                    id: 'gallery',
                    label: 'Gallery',
                    isPermanent: true,
                    isPublic: false,
                    isOwner: true,
                    lastActive: Date.now()
                }]}
                currentSpaceId="main"
                newSpaceName=""
                onSpaceNameChange={vi.fn()}
                openAfterCreateTarget="public"
                onOpenAfterCreateTargetChange={vi.fn()}
                canCreateSpace
                ttlHours={24}
                isCreatingSpace={false}
                onCreateSpace={vi.fn()}
                onCreatePermanentSpace={vi.fn()}
                onOpenSpace={vi.fn()}
                onCopyLink={vi.fn()}
                onDeleteSpace={vi.fn()}
                onRenameSpace={vi.fn()}
                onTogglePermanent={vi.fn()}
                onTogglePublic={handleTogglePublic}
                onClose={vi.fn()}
                surfaceMode="sheet"
            />
        )

        expect(screen.queryByText('live')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Make Public' }))

        expect(handleTogglePublic).toHaveBeenCalledWith('gallery', true)
    })

    it('hides owner-only actions on spaces the user does not own', () => {
        render(
            <SpacesPanel
                spaces={[{
                    id: 'showroom',
                    label: 'Showroom',
                    isPermanent: true,
                    isPublic: true,
                    isOwner: false,
                    lastActive: Date.now()
                }]}
                currentSpaceId="main"
                newSpaceName=""
                onSpaceNameChange={vi.fn()}
                openAfterCreateTarget="public"
                onOpenAfterCreateTargetChange={vi.fn()}
                canCreateSpace
                ttlHours={24}
                isCreatingSpace={false}
                onCreateSpace={vi.fn()}
                onCreatePermanentSpace={vi.fn()}
                onOpenSpace={vi.fn()}
                onCopyLink={vi.fn()}
                onDeleteSpace={vi.fn()}
                onRenameSpace={vi.fn()}
                onTogglePermanent={vi.fn()}
                onTogglePublic={vi.fn()}
                onClose={vi.fn()}
                surfaceMode="sheet"
            />
        )

        expect(screen.getByRole('button', { name: 'View Live' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy Live Link' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Make Temp' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Make Private' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })
})
