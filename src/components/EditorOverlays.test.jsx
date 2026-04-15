import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditorOverlays from './EditorOverlays.jsx'

describe('EditorOverlays', () => {
    it('keeps hidden UI clean while preserving compact XR controls and cursor labels', () => {
        render(
            <EditorOverlays
                isUiVisible={false}
                isLoading={false}
                isFileDragActive={false}
                hiddenUiButtons={[
                    { key: 'show-ui', label: 'Show UI', onClick: vi.fn(), variant: 'success' },
                    { key: 'switch-3d-view', label: '3D View', onClick: vi.fn() },
                    { key: 'enter-vr', label: 'Enter VR', onClick: vi.fn() },
                    { key: 'enter-ar', label: 'Enter AR', onClick: vi.fn() }
                ]}
                remoteCursorMarkers={[
                    { key: 'cursor-1', label: 'Alice', x: 0.2, y: 0.4 }
                ]}
                shouldShowStatusPanel={true}
                statusPanelClassName="status-panel status-panel-compact"
                statusDotClass="status-dot active"
                statusSummary="1 active task"
                statusItems={[
                    { key: 'upload', label: 'Upload', detail: '2/4', percent: 50 }
                ]}
            />
        )

        expect(screen.queryByTestId('hidden-ui-quick-menu')).toBeNull()
        expect(screen.getByTestId('hidden-ui-xr-controls')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Enter VR' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Enter AR' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Show UI' })).toBeNull()
        expect(screen.queryByRole('button', { name: '3D View' })).toBeNull()
        expect(screen.queryByText('Activity')).toBeNull()
        expect(screen.queryByText('Upload')).toBeNull()
        expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('renders the docked activity panel expanded by default', () => {
        render(
            <EditorOverlays
                isUiVisible={true}
                isLoading={false}
                isFileDragActive={false}
                hiddenUiButtons={[]}
                remoteCursorMarkers={[]}
                shouldShowStatusPanel={true}
                statusPanelClassName="status-panel status-panel-docked"
                statusDotClass="status-dot active"
                statusSummary="2 active tasks"
                statusItems={[
                    { key: 'upload', label: 'Upload', detail: '2/4', percent: 50 }
                ]}
            />
        )

        expect(screen.getByText('Upload')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
    })
})
