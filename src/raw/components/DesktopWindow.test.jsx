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
        // jsdom is 1024x768, a WIDE viewport, so the bottom reserve is the
        // desktop one (40): the floor for a 56px bar is 768 - 56 - 52 = 660,
        // so an authored y of 640 stays put — while the 600px panel it would
        // open to would have been yanked to 116. The gap between those two
        // numbers IS the bug, and it is what this asserts.
        const top = Number.parseFloat(container.querySelector('.raw-window').style.transform.split(',')[1])
        expect(top).toBe(640)
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

        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
        expect(onEnter).toHaveBeenCalledTimes(1)
    })

    it('omits the Enter button when onEnter is not provided', () => {
        render(
            <DesktopWindow windowState={windowState} title="World">
                content
            </DesktopWindow>
        )

        expect(screen.queryByRole('button', { name: 'Enter' })).not.toBeInTheDocument()
    })
})

describe('DesktopWindow on the canvas (space="graph")', () => {
    const canvasState = { x: 100, y: 100, width: 300, height: 200, zIndex: 1, minimized: false, pinned: false }
    const setup = (props = {}) => {
        const onPatch = vi.fn()
        const utils = render(
            <DesktopWindow windowState={canvasState} title="Note" space="graph" onPatch={onPatch} {...props}>content</DesktopWindow>
        )
        return { ...utils, onPatch }
    }

    it('resizes from the WEST edge: the left edge follows the pointer and the right edge stays put', () => {
        const { container, onPatch } = setup()
        const west = container.querySelector('.raw-window-handle.w')
        fireEvent.pointerDown(west, { clientX: 100, clientY: 150, pointerId: 1, button: 0 })
        fireEvent.pointerMove(window, { clientX: 40, clientY: 150, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })
        expect(onPatch).toHaveBeenCalledWith({ x: 40, y: 100, width: 360, height: 200 })
    })

    it('divides pointer deltas by the canvas zoom — a window in graph units moves in graph units', () => {
        const { container, onPatch } = setup({ canvasZoom: 0.5 })
        const header = container.querySelector('.raw-window-header')
        fireEvent.pointerDown(header, { clientX: 200, clientY: 200, pointerId: 2, button: 0 })
        fireEvent.pointerMove(window, { clientX: 250, clientY: 300, pointerId: 2 })
        fireEvent.pointerUp(window, { pointerId: 2 })
        expect(onPatch).toHaveBeenCalledWith({ x: 200, y: 300, width: 300, height: 200 })
    })

    it('a south-east resize writes only the size, so a window following its card keeps following', () => {
        const { container, onPatch } = setup()
        const grip = container.querySelector('.raw-window-resizer')
        fireEvent.pointerDown(grip, { clientX: 400, clientY: 300, pointerId: 3, button: 0 })
        fireEvent.pointerMove(window, { clientX: 480, clientY: 340, pointerId: 3 })
        fireEvent.pointerUp(window, { pointerId: 3 })
        expect(onPatch).toHaveBeenCalledWith({ width: 380, height: 240 })
    })

    it('captures the pointer on the pressed element, so a drag that leaves the frame still finishes', () => {
        const { container } = setup()
        const header = container.querySelector('.raw-window-header')
        header.setPointerCapture = vi.fn()
        fireEvent.pointerDown(header, { clientX: 1, clientY: 1, pointerId: 7, button: 0 })
        expect(header.setPointerCapture).toHaveBeenCalledWith(7)
        fireEvent.pointerUp(window, { pointerId: 7 })
    })

    it('never shrinks below the size floor from any edge', () => {
        const { container, onPatch } = setup()
        const north = container.querySelector('.raw-window-handle.n')
        fireEvent.pointerDown(north, { clientX: 200, clientY: 100, pointerId: 4, button: 0 })
        fireEvent.pointerMove(window, { clientX: 200, clientY: 900, pointerId: 4 })
        fireEvent.pointerUp(window, { pointerId: 4 })
        const patch = onPatch.mock.calls[0][0]
        expect(patch.height).toBe(120)
        // the bottom edge (y + height = 300) did not move
        expect(patch.y + patch.height).toBe(300)
    })

    it('does not clamp to the viewport — the canvas has no edges', () => {
        const { container } = setup({ windowState: { ...canvasState, x: -5000, y: 9000 } })
        expect(container.querySelector('.raw-window').style.transform).toBe('translate(-5000px, 9000px)')
        expect(container.querySelector('.raw-window').classList.contains('is-graph')).toBe(true)
    })

    it('double-clicking the title bar asks to be framed', () => {
        const onFrame = vi.fn()
        const { container } = setup({ onFrame })
        fireEvent.doubleClick(container.querySelector('.raw-window-header h3'))
        expect(onFrame).toHaveBeenCalledTimes(1)
    })

    it('arrow keys on the grip resize, arrow keys on the title bar move', () => {
        const { container, onPatch } = setup()
        fireEvent.keyDown(container.querySelector('.raw-window-resizer'), { key: 'ArrowRight' })
        expect(onPatch).toHaveBeenLastCalledWith({ width: 316, height: 200 })
        fireEvent.keyDown(container.querySelector('.raw-window-header'), { key: 'ArrowDown', shiftKey: true })
        expect(onPatch).toHaveBeenLastCalledWith({ x: 100, y: 101, width: 316, height: 200 })
    })
})
