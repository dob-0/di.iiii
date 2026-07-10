import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioHelpDialog from './StudioHelpDialog.jsx'

describe('StudioHelpDialog', () => {
    it('renders nothing while closed', () => {
        const { container } = render(<StudioHelpDialog open={false} onClose={vi.fn()} />)
        expect(container.firstChild).toBeNull()
    })

    it('opens on visual basics with all four guide sections', () => {
        render(<StudioHelpDialog open onClose={vi.fn()} />)
        expect(screen.getByRole('dialog', { name: 'Studio help' })).toBeInTheDocument()
        for (const label of ['Move', 'Build', 'Edit', 'Share']) {
            expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
        }
        expect(screen.getByText('Look around')).toBeInTheDocument()
    })

    it('switches guide sections', () => {
        render(<StudioHelpDialog open onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Share' }))
        expect(screen.getByText('Show it to the world')).toBeInTheDocument()
        expect(screen.getByText('Make the space public')).toBeInTheDocument()
    })

    // The old HotkeyHelp table lives on as the Shortcuts tab — the full
    // reference must stay reachable, just not be the whole help experience.
    it('keeps the complete shortcut reference behind the Shortcuts tab', () => {
        render(<StudioHelpDialog open onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }))
        expect(screen.getByText('Move (grab) mode')).toBeInTheDocument()
        expect(screen.getByText('Toggle Navigate ↔ Edit')).toBeInTheDocument()
        expect(screen.getByText('Quick insert')).toBeInTheDocument()
    })

    it('closes from the close button and the scrim', () => {
        const onClose = vi.fn()
        render(<StudioHelpDialog open onClose={onClose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close help' }))
        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
