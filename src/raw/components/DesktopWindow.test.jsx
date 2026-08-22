import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DesktopWindow from './DesktopWindow.jsx'

const windowState = { x: 10, y: 10, width: 300, height: 200, zIndex: 1, minimized: false, pinned: false }

describe('DesktopWindow', () => {
    // Regression, and a lesson about where a guard has to sit: clampWindowFrame
    // already placed a minimized window by its bar, and a unit test over that
    // function passed — while every window on screen was still misplaced,
    // because DesktopWindow rebuilt the frame from x/y/width/height alone and
    // the `minimized` the clamp reads never arrived. Measured before the fix:
    // a collapsed bar authored at y=640 with a stored height of 600 rendered
    // at y≈94 on a 1440x810 desk, on top of the window above it.
    it('places a minimized window by its bar, not by the panel it would open to', () => {
        const collapsed = { x: 656, y: 640, width: 520, height: 600, zIndex: 9, minimized: true, pinned: false }
        const { container } = render(
            <DesktopWindow windowState={collapsed} title="Gear">content</DesktopWindow>
        )
        // jsdom is 1024x768. The bottom reserve puts the floor for a 56px bar
        // at 580 and for the 600px panel at 36 — the gap between those two
        // numbers IS the bug, and it is what this asserts.
        const top = Number.parseFloat(container.querySelector('.raw-window').style.transform.split(',')[1])
        expect(top).toBe(580)
    })

    it('still pulls an OPEN window back inside the viewport', () => {
        const open = { x: 656, y: 640, width: 520, height: 600, zIndex: 9, minimized: false, pinned: false }
        const { container } = render(
            <DesktopWindow windowState={open} title="Gear">content</DesktopWindow>
        )
        const transform = container.querySelector('.raw-window').style.transform
        const top = Number.parseFloat(transform.split(',')[1])
        expect(top).toBeLessThan(640)
    })

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

        const header = screen.getByText('Test window').closest('.raw-window-header')
        fireEvent.pointerDown(header, { clientX: 50, clientY: 50 })
        fireEvent.pointerMove(window, { clientX: 90, clientY: 70 })
        fireEvent.pointerUp(window)

        expect(onPatch).toHaveBeenCalled()
        const patch = onPatch.mock.calls[0][0]
        expect(patch.x).not.toBe(windowState.x)
        expect(patch.y).not.toBe(windowState.y)
    })

    // Regression: panel-2d node types (universe.world, view.text, etc.) never
    // rendered as an enterable graph card, so there was no way to reach
    // scopeEnterNode for them — nodes created "inside" a World always landed
    // as siblings at the surrounding scope instead of real children. The
    // window itself is now the entry point.
    it('renders an Enter button when onEnter is provided and calls it on click', () => {
        const onEnter = vi.fn()
        render(
            <DesktopWindow windowState={windowState} title="World" onEnter={onEnter}>
                content
            </DesktopWindow>
        )

        fireEvent.click(screen.getByText('Enter ›'))
        expect(onEnter).toHaveBeenCalledTimes(1)
    })

    it('omits the Enter button when onEnter is not provided', () => {
        render(
            <DesktopWindow windowState={windowState} title="World">
                content
            </DesktopWindow>
        )

        expect(screen.queryByText('Enter ›')).not.toBeInTheDocument()
    })
})
