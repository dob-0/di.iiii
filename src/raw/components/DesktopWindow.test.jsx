import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DesktopWindow from './DesktopWindow.jsx'

const windowState = { x: 10, y: 10, width: 300, height: 200, zIndex: 1, minimized: false, pinned: false }

describe('DesktopWindow', () => {
    // A window in the world is placed through the canvas viewport: origin +
    // pan + frame * zoom, and scaled with the zoom — so it travels with a pan
    // and shrinks with the cards. Its frame is graph units, never clamped to
    // the screen: y=2000 is simply off-screen until you pan there.
    it('places a world window through the viewport and scales it with the zoom', () => {
        const far = { x: 200, y: 2000, width: 400, height: 300, zIndex: 1, minimized: false, pinned: false }
        const viewport = { panX: 100, panY: 50, zoom: 0.5, originLeft: 0, originTop: 64 }
        const { container } = render(
            <DesktopWindow windowState={far} title="Scene" space="world" viewport={viewport}>content</DesktopWindow>
        )
        const el = container.querySelector('.raw-window')
        expect(el.classList.contains('is-world')).toBe(true)
        expect(el.style.transform).toBe('translate(200px, 1114px) scale(0.5)')
        expect(el.style.width).toBe('400px')
    })

    // Pointer deltas are screen pixels; a world window's frame is graph units,
    // so a 40px drag at zoom 0.5 moves the window 80 units.
    it('drags a world window in graph units, dividing the pointer delta by the zoom', () => {
        const onPatch = vi.fn()
        const viewport = { panX: 0, panY: 0, zoom: 0.5, originLeft: 0, originTop: 0 }
        const { container } = render(
            <DesktopWindow windowState={windowState} title="Scene" space="world" viewport={viewport} onPatch={onPatch}>content</DesktopWindow>
        )
        const header = container.querySelector('.raw-window-header')
        fireEvent.pointerDown(header, { clientX: 100, clientY: 100 })
        fireEvent.pointerMove(window, { clientX: 140, clientY: 120 })
        fireEvent.pointerUp(window)
        expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ x: 90, y: 50 }))
    })

    it('keeps a screen window on the plain translate, unscaled', () => {
        const { container } = render(
            <DesktopWindow windowState={windowState} title="Gear" space="screen" viewport={{ panX: 500, panY: 500, zoom: 2 }}>content</DesktopWindow>
        )
        const el = container.querySelector('.raw-window')
        expect(el.classList.contains('is-world')).toBe(false)
        expect(el.style.transform).toMatch(/^translate\([-\d.]+px, [-\d.]+px\)$/)
    })

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
