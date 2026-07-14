import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DesktopWindow from './DesktopWindow.jsx'

const windowState = { x: 10, y: 10, width: 300, height: 200, zIndex: 1, minimized: false, pinned: false }

describe('DesktopWindow', () => {
    // Regression: the pointermove/pointerup-attaching effect used to depend on
    // a mutable ref (interactionRef) instead of the `dragMode` state, so it
    // never re-ran when a drag started — pointer listeners were never
    // attached and no window could ever be dragged or resized.
    it('calls onPatch with a moved position after a header drag', () => {
        const onPatch = vi.fn()
        render(
            <DesktopWindow windowState={windowState} title="Test window" onPatch={onPatch}>
                content
            </DesktopWindow>
        )

        const header = screen.getByText('Test window').closest('.beta-window-header')
        fireEvent.pointerDown(header, { clientX: 50, clientY: 50 })
        fireEvent.pointerMove(window, { clientX: 90, clientY: 70 })
        fireEvent.pointerUp(window)

        expect(onPatch).toHaveBeenCalled()
        const patch = onPatch.mock.calls[0][0]
        expect(patch.x).not.toBe(windowState.x)
        expect(patch.y).not.toBe(windowState.y)
    })
})
