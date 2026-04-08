import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditorToolbar from './EditorToolbar.jsx'

describe('EditorToolbar', () => {
    it('renders a compact workspace app bar with global actions and status', () => {
        const exportProject = vi.fn()
        const importProject = vi.fn()
        const switchMode = vi.fn()

        render(
            <EditorToolbar
                toolbarModel={{
                    identity: {
                        spaceButton: { key: 'space-label', label: 'Local Scene', onClick: vi.fn() }
                    },
                    primaryActions: [
                        { key: 'save', label: 'Export Project', onClick: exportProject },
                        { key: 'load', label: 'Import Project', onClick: importProject }
                    ],
                    historyActions: [
                        { key: 'undo', label: 'Undo', onClick: vi.fn() },
                        { key: 'redo', label: 'Redo', onClick: vi.fn() }
                    ],
                    modeButtons: {
                        interaction: { key: 'interaction-mode', label: 'Mode: Edit', onClick: switchMode },
                        presentation: [
                            { key: 'presentation-scene', label: '3D View', onClick: vi.fn(), isActive: true },
                            { key: 'presentation-fixed-camera', label: '2D Camera', onClick: vi.fn() },
                            { key: 'presentation-code', label: 'Code View', onClick: vi.fn() }
                        ]
                    },
                    drawerSections: [
                        {
                            key: 'display',
                            label: 'Display',
                            items: [
                                { key: 'hide-ui', label: 'Hide UI', onClick: vi.fn() }
                            ]
                        }
                    ]
                }}
                statusSummary="2 active tasks"
            />
        )

        expect(screen.getByRole('button', { name: 'Local Scene' })).toBeTruthy()
        expect(screen.getByText('2 active tasks')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Mode: Edit' })).toBeTruthy()
        expect(screen.getByRole('button', { name: '3D View' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Panels' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Hide UI' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Export Project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Import Project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Mode: Edit' }))

        expect(exportProject).toHaveBeenCalledTimes(1)
        expect(importProject).toHaveBeenCalledTimes(1)
        expect(switchMode).toHaveBeenCalledTimes(1)
    })
})
