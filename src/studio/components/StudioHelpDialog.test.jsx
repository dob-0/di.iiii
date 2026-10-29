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
        expect(screen.getByText('Move: with a selection the drag starts at once (Blender grab); without, picks the gizmo mode')).toBeInTheDocument()
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

    // Brief 2026-10-13 item 4: the picking and deselect rules the owner asked for are on the table.
    it('lists click-a-beam, the locked click, the lock keys and both deselects', () => {
        render(<StudioHelpDialog open onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }))
        const row = (key) => screen.getAllByText(key, { selector: 'code' })
        expect(screen.getByText('Select its lamp; a lamp body in front of a beam wins')).toBeInTheDocument()
        expect(screen.getByText('Not picked: the click goes through; with only locked things under the pointer, the selection clears')).toBeInTheDocument()
        expect(screen.getByText('Deselect all')).toBeInTheDocument()
        expect(screen.getByText('Deselect')).toBeInTheDocument()
        expect(screen.getByText('Unlock all (our own keys, Blender has no lock key)')).toBeInTheDocument()
        for (const key of ['Click a beam', 'Click a locked object', 'L', 'Alt+L', 'Alt+A']) expect(row(key).length).toBeGreaterThan(0)
    })

    // Nothing is lost (owner 2026-10-29): the Like Blender table stays beside the default one (editMouse.js).
    it('shows the mouse of View and Pull to move, and of Edit with Like Blender', () => {
        render(<StudioHelpDialog open onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }))
        expect(screen.getByText('Mouse · View, and Edit with Pull to move (like Sketchfab)')).toBeTruthy()
        expect(screen.getByText('Mouse · Edit with Like Blender (Scene, Move, Mouse in Edit)')).toBeTruthy()
        expect(screen.getByText('Shift+Middle drag')).toBeTruthy()
    })
})
