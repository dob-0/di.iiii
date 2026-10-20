import React, { useEffect, useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DirectorPanel from './DirectorPanel.jsx'
import useEditHistory from './useEditHistory.js'

const SEQUENCES = [
    { id: 'one', title: 'One', startSec: 0, endSec: 8 },
    { id: 'two', title: 'Two', startSec: 8, endSec: 20 }
]

const PIECE = {
    id: 'test-piece',
    baseline: SEQUENCES,
    assetLibrary: [],
    assetFolder: '',
    AssetClip: () => null,
    resolvePlacement: () => ({}),
    palette: { worldSwatches: [], lightSwatches: [], lightKinds: [], lightIntensities: {}, warn: () => null }
}

const makeClock = () => ({
    playheadSec: 5,
    isPlaying: false,
    rate: 1,
    toggle: vi.fn(),
    seek: vi.fn(),
    restart: vi.fn(),
    setRate: vi.fn()
})

const press = (target, init) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    act(() => { target.dispatchEvent(event) })
    return event
}

afterEach(cleanup)

describe('DirectorPanel keys are scoped to focus inside the panel', () => {
    const setup = () => {
        const clock = makeClock()
        const onChange = vi.fn()
        render(
            <div>
                <button data-testid="outside">outside</button>
                <DirectorPanel piece={PIECE} sequences={SEQUENCES} onChange={onChange} clock={clock} selectedId="one" onSelect={() => {}} onPlace={() => {}} />
            </div>
        )
        return { clock, onChange, panel: screen.getByLabelText('Director panel'), outside: screen.getByTestId('outside') }
    }

    it('does nothing for Space, arrows, Home and B while focus is outside', () => {
        const { clock, onChange, outside } = setup()
        outside.focus()
        for (const init of [{ code: 'Space', key: ' ' }, { key: 'ArrowLeft' }, { key: 'ArrowRight', shiftKey: true }, { key: 'Home' }, { key: 'b' }]) {
            expect(press(outside, init).defaultPrevented).toBe(false)
        }
        expect(clock.toggle).not.toHaveBeenCalled()
        expect(clock.seek).not.toHaveBeenCalled()
        expect(clock.restart).not.toHaveBeenCalled()
        expect(onChange).not.toHaveBeenCalled()
    })

    it('does nothing when nothing is focused (body)', () => {
        const { clock } = setup()
        expect(press(document.body, { code: 'Space', key: ' ' }).defaultPrevented).toBe(false)
        expect(clock.toggle).not.toHaveBeenCalled()
    })

    it('handles the transport keys and prevents default while focus is inside', () => {
        const { clock, panel } = setup()
        panel.focus()
        expect(document.activeElement).toBe(panel)
        expect(press(panel, { code: 'Space', key: ' ' }).defaultPrevented).toBe(true)
        expect(clock.toggle).toHaveBeenCalledTimes(1)
        press(panel, { key: 'ArrowLeft' })
        expect(clock.seek).toHaveBeenLastCalledWith(4.9)
        press(panel, { key: 'ArrowRight', shiftKey: true })
        expect(clock.seek).toHaveBeenLastCalledWith(6)
        press(panel, { key: 'Home' })
        expect(clock.restart).toHaveBeenCalledTimes(1)
    })

    it('B is claimed only with focus inside', () => {
        const { onChange, panel, outside } = setup()
        outside.focus()
        press(outside, { key: 'b' })
        expect(onChange).not.toHaveBeenCalled()
        panel.focus()
        expect(press(panel, { key: 'b' }).defaultPrevented).toBe(true)
    })

    it('keeps the text-field guard when an input inside the panel has focus', () => {
        const { clock, panel } = setup()
        const input = document.createElement('input')
        panel.appendChild(input)
        input.focus()
        expect(press(input, { code: 'Space', key: ' ' }).defaultPrevented).toBe(false)
        expect(clock.toggle).not.toHaveBeenCalled()
    })
})

describe('Director undo is scoped and tells the graph it handled the key', () => {
    // Stands in for RawEditor's bubble-phase handler, which skips handled keys.
    function GraphUndo({ onUndo }) {
        useEffect(() => {
            const handler = (event) => {
                if (!(event.ctrlKey && event.key === 'z')) return
                if (event.defaultPrevented) return
                onUndo()
            }
            window.addEventListener('keydown', handler)
            return () => window.removeEventListener('keydown', handler)
        }, [onUndo])
        return null
    }

    function Harness({ graphUndo }) {
        const scopeRef = useRef(null)
        const history = useEditHistory(['a'], { enabled: true, scopeRef })
        return (
            <div>
                <button data-testid="outside">outside</button>
                <div ref={scopeRef} tabIndex={-1} data-testid="scope">
                    <button data-testid="set" onClick={() => history.set(['b'])}>set</button>
                    <output data-testid="present">{history.present.join(',')}</output>
                </div>
                <GraphUndo onUndo={graphUndo} />
            </div>
        )
    }

    it('Ctrl+Z with focus inside undoes only the Director', () => {
        const graphUndo = vi.fn()
        render(<Harness graphUndo={graphUndo} />)
        fireEvent.click(screen.getByTestId('set'))
        expect(screen.getByTestId('present').textContent).toBe('b')
        screen.getByTestId('scope').focus()
        const event = press(screen.getByTestId('scope'), { key: 'z', ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
        expect(screen.getByTestId('present').textContent).toBe('a')
        expect(graphUndo).not.toHaveBeenCalled()
    })

    it('Ctrl+Z with focus outside leaves the Director alone and reaches the graph', () => {
        const graphUndo = vi.fn()
        render(<Harness graphUndo={graphUndo} />)
        fireEvent.click(screen.getByTestId('set'))
        screen.getByTestId('outside').focus()
        const event = press(screen.getByTestId('outside'), { key: 'z', ctrlKey: true })
        expect(event.defaultPrevented).toBe(false)
        expect(screen.getByTestId('present').textContent).toBe('b')
        expect(graphUndo).toHaveBeenCalledTimes(1)
    })
})
