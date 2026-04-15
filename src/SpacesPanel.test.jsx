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
})
