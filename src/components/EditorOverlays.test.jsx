import React from 'react'
import { render, screen } from '@testing-library/react'
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
                    { key: 'xr-debug', label: 'XR Debug', onClick: vi.fn() }
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
        expect(screen.getByRole('button', { name: 'XR Debug' })).toBeTruthy()
        expect(screen.getByText('Alice')).toBeTruthy()
    })
})
