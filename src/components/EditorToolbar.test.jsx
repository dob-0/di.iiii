import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditorToolbar from './EditorToolbar.jsx'

describe('EditorToolbar', () => {
    it('shows compact primary actions and routes panel and overflow actions through menus', () => {
        const toggleView = vi.fn()
        const toggleWorld = vi.fn()
        const hideUi = vi.fn()

        render(
            <EditorToolbar
                toolbarModel={{
                    spaceButton: { key: 'space-label', label: 'Local Scene' },
                    fileButtons: [
                        { key: 'save', label: 'Export Project', onClick: vi.fn() },
                        { key: 'load', label: 'Import Project', onClick: vi.fn() }
                    ],
                    historyButtons: [
                        { key: 'undo', label: 'Undo', onClick: vi.fn() },
                        { key: 'redo', label: 'Redo', onClick: vi.fn() }
                    ],
                    interactionModeButton: { key: 'interaction-mode', label: 'Mode: Edit', onClick: vi.fn() },
                    presentationButtons: [
                        { key: 'presentation-scene', label: '3D View', onClick: vi.fn(), isActive: true },
                        { key: 'presentation-fixed-camera', label: '2D Camera', onClick: vi.fn() },
                        { key: 'presentation-code', label: 'Code View', onClick: vi.fn() }
                    ],
                    overflowSections: [
                        {
                            key: 'display',
                            label: 'Display',
                            items: [
                                { key: 'hide-ui', label: 'Hide UI', onClick: hideUi }
                            ]
                        }
                    ]
                }}
                panelEntries={[
                    { key: 'view', label: 'View', isVisible: true, onToggle: toggleView },
                    { key: 'world', label: 'World', isVisible: false, onToggle: toggleWorld }
                ]}
            />
        )

        expect(screen.getByRole('button', { name: 'Local Scene' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Export Project' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Import Project' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Mode: Edit' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Panels (1)' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Panels (1)' }))
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'View' }))
        expect(toggleView).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Hide UI' }))
        expect(hideUi).toHaveBeenCalledTimes(1)
    })
})
