import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { usePanelDrag } from './usePanelDrag.js'

function attachPanelRef(result, rect) {
    result.current.panelRef.current = {
        getBoundingClientRect: () => rect,
        style: {}
    }
}

describe('usePanelDrag', () => {
    const rect = { width: 200, height: 100 }

    beforeEach(() => {
        window.innerWidth = 1000
        window.innerHeight = 800
    })

    afterEach(() => {
        act(() => {
            window.dispatchEvent(new Event('pointerup'))
        })
    })

    it('snaps to the screen edge mid-drag when snapEdges is enabled', () => {
        const { result, rerender } = renderHook(
            ({ snapEdges }) => usePanelDrag({ x: 100, y: 100 }, { snapEdges }),
            { initialProps: { snapEdges: true } }
        )
        attachPanelRef(result, rect)

        act(() => {
            result.current.dragProps.onPointerDown({ clientX: 100, clientY: 100, preventDefault: () => {} })
        })
        rerender({ snapEdges: true })
        attachPanelRef(result, rect)

        act(() => {
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 100 }))
        })

        // dragged to x=15, within the 20px snap threshold of the left edge (padding=8)
        expect(result.current.dragStyle.transform).toBe('translate(8px, 100px)')
    })

    it('does not snap when snapEdges is disabled, even near the edge', () => {
        const { result, rerender } = renderHook(
            ({ snapEdges }) => usePanelDrag({ x: 100, y: 100 }, { snapEdges }),
            { initialProps: { snapEdges: false } }
        )
        attachPanelRef(result, rect)

        act(() => {
            result.current.dragProps.onPointerDown({ clientX: 100, clientY: 100, preventDefault: () => {} })
        })
        rerender({ snapEdges: false })
        attachPanelRef(result, rect)

        act(() => {
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 100 }))
        })

        expect(result.current.dragStyle.transform).toBe('translate(15px, 100px)')
    })

    it('picks up a live snapEdges toggle that happens after the drag already started', () => {
        const { result, rerender } = renderHook(
            ({ snapEdges }) => usePanelDrag({ x: 100, y: 100 }, { snapEdges }),
            { initialProps: { snapEdges: false } }
        )
        attachPanelRef(result, rect)

        act(() => {
            result.current.dragProps.onPointerDown({ clientX: 100, clientY: 100, preventDefault: () => {} })
        })

        // toggle Snap on mid-drag, the way clicking the control-cluster button would
        rerender({ snapEdges: true })
        attachPanelRef(result, rect)

        act(() => {
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 100 }))
        })

        expect(result.current.dragStyle.transform).toBe('translate(8px, 100px)')
    })
})
