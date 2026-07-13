import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebglContextLostOverlay, useWebglContextGuard } from './WebglContextGuard.jsx'

// Regression guard: a lost WebGL context used to leave the viewport a dead
// black canvas with no recovery path — three logs "Context Lost." and nothing
// listens. The guard must surface an overlay and remount the canvas.
function Harness() {
    const { canvasKey, contextLost, bindContextGuard, restoreContext } = useWebglContextGuard()
    return (
        <div>
            <canvas key={canvasKey} data-testid="canvas" data-key={canvasKey} ref={(el) => el && bindContextGuard({ domElement: el })} />
            {contextLost && <WebglContextLostOverlay onRestore={restoreContext} />}
        </div>
    )
}

describe('useWebglContextGuard', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('shows the overlay on context loss and auto-remounts the canvas once', () => {
        render(<Harness />)
        fireEvent(screen.getByTestId('canvas'), new Event('webglcontextlost'))
        expect(screen.getByRole('alert')).toBeInTheDocument()

        act(() => vi.advanceTimersByTime(2000))
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByTestId('canvas').dataset.key).toBe('1')
    })

    it('clears the overlay without remounting when the browser restores the context', () => {
        render(<Harness />)
        const canvas = screen.getByTestId('canvas')
        fireEvent(canvas, new Event('webglcontextlost'))
        fireEvent(canvas, new Event('webglcontextrestored'))
        expect(screen.queryByRole('alert')).toBeNull()

        act(() => vi.advanceTimersByTime(5000))
        expect(screen.getByTestId('canvas').dataset.key).toBe('0')
    })

    it('waits for the manual restore button on repeated losses', () => {
        render(<Harness />)
        fireEvent(screen.getByTestId('canvas'), new Event('webglcontextlost'))
        act(() => vi.advanceTimersByTime(2000))

        fireEvent(screen.getByTestId('canvas'), new Event('webglcontextlost'))
        act(() => vi.advanceTimersByTime(5000))
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByTestId('canvas').dataset.key).toBe('1')

        fireEvent.click(screen.getByRole('button', { name: 'Restore 3D view' }))
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByTestId('canvas').dataset.key).toBe('2')
    })
})
