import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import EditorOverlays from './EditorOverlays.jsx'
import { useUiState } from '../hooks/useUiState.js'
import { renderHook } from '@testing-library/react'

// A Studio space card embeds `/<space>?preview=1`. For a space with a published
// project that lands in PublicProjectViewer, which has always honoured the flag;
// for a space without one it lands in the generic <App />, which did not — so
// the card showed Enter VR / Enter AR / Mode chrome instead of the scene.
const withSearch = (search, fn) => {
    const original = window.location.search
    Object.defineProperty(window, 'location', {
        value: { ...window.location, search },
        writable: true,
        configurable: true
    })
    try {
        return fn()
    } finally {
        Object.defineProperty(window, 'location', {
            value: { ...window.location, search: original },
            writable: true,
            configurable: true
        })
    }
}

const buttons = [
    { key: 'enter-vr', label: 'Enter VR', onClick: vi.fn() },
    { key: 'enter-ar', label: 'Enter AR', onClick: vi.fn() },
    { key: 'interaction-mode', label: 'Mode: Navigate', onClick: vi.fn() },
    { key: 'exit-xr', label: 'Exit XR', onClick: vi.fn() }
]

const overlays = () => (
    <EditorOverlays
        isUiVisible={false}
        isLoading={false}
        isFileDragActive={false}
        hiddenUiButtons={buttons}
        remoteCursorMarkers={[]}
        shouldShowStatusPanel={false}
        statusPanelClassName=""
        statusDotClass=""
        statusSummary=""
        statusItems={[]}
    />
)

afterEach(() => {
    cleanup()
    window.localStorage.clear()
})

describe('a thumbnail carries no editor chrome', () => {
    it('drops Enter VR, Enter AR and the mode chip under ?preview=1', () => {
        withSearch('?preview=1', () => render(overlays()))
        expect(screen.queryByRole('button', { name: 'Enter VR' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Enter AR' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Mode: Navigate' })).toBeNull()
    })

    // Offering no way out of an immersive session is worse than a button in a
    // card, so this one stays.
    it('keeps Exit XR under ?preview=1', () => {
        withSearch('?preview=1', () => render(overlays()))
        expect(screen.getByRole('button', { name: 'Exit XR' })).toBeTruthy()
    })

    it('leaves a normal visit alone', () => {
        withSearch('', () => render(overlays()))
        expect(screen.getByRole('button', { name: 'Enter VR' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Mode: Navigate' })).toBeTruthy()
    })

    // The card iframe shares localStorage with the Studio owner looking at it.
    it('ignores the owner\'s stored ui-visible=true inside a preview', () => {
        window.localStorage.setItem('ui-visible:open', 'true')
        const { result } = withSearch('?preview=1', () => renderHook(() => useUiState({ spaceId: 'open' })))
        expect(result.current.isUiVisible).toBe(false)
    })

    it('still honours that stored value on a normal visit', () => {
        window.localStorage.setItem('ui-visible:open', 'true')
        const { result } = withSearch('', () => renderHook(() => useUiState({ spaceId: 'open' })))
        expect(result.current.isUiVisible).toBe(true)
    })
})
