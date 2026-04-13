import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditorOverlays from './EditorOverlays.jsx'

describe('EditorOverlays', () => {
    it('shows the hidden-ui quick menu and remote cursor labels when the UI is hidden', () => {
        render(
            <EditorOverlays
                isUiVisible={false}
                isLoading={false}
                isFileDragActive={false}
                hiddenUiButtons={[
                    { key: 'show-ui', label: 'Show UI', onClick: vi.fn(), variant: 'success' },
                    { key: 'switch-3d-view', label: '3D View', onClick: vi.fn() }
                ]}
                remoteCursorMarkers={[
                    { key: 'cursor-1', label: 'Alice', x: 0.2, y: 0.4 }
                ]}
                shouldShowStatusPanel={false}
                statusPanelClassName=""
                statusDotClass=""
                statusSummary=""
                statusItems={[]}
            />
        )

        expect(screen.getByTestId('hidden-ui-quick-menu')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Show UI' })).toBeTruthy()
        expect(screen.getByRole('button', { name: '3D View' })).toBeTruthy()
        expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('renders the activity panel collapsed until the user expands it', () => {
        render(
            <EditorOverlays
                isUiVisible={true}
                isLoading={false}
                isFileDragActive={false}
                hiddenUiButtons={[]}
                remoteCursorMarkers={[]}
                shouldShowStatusPanel={true}
                statusPanelClassName="status-panel"
                statusDotClass="status-dot active"
                statusSummary="2 active tasks"
                statusItems={[
                    { key: 'upload', label: 'Upload', detail: '2/4', percent: 50 }
                ]}
            />
        )

        expect(screen.queryByText('Upload')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Show' }))
        expect(screen.getByText('Upload')).toBeTruthy()
    })
})
