// @vitest-environment jsdom
// Auto fly ends on ANY input and hands the camera back; the toggle button is left to itself.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import useAutoFlyStop, { AUTO_FLY_STOP_EVENTS } from './useAutoFlyStop.js'

function Probe({ active, onStop }) {
    useAutoFlyStop(active, onStop)
    return <button data-autofly type="button">Auto fly</button>
}

describe('useAutoFlyStop', () => {
    it.each([['pointerdown'], ['wheel'], ['keydown'], ['touchstart']])('stops on %s', (type) => {
        const onStop = vi.fn()
        render(<Probe active onStop={onStop} />)
        fireEvent[type] ? fireEvent[type](document.body) : fireEvent(document.body, new Event(type, { bubbles: true }))
        expect(onStop).toHaveBeenCalledTimes(1)
    })

    it('covers pointer, wheel, key and touch', () => {
        expect([...AUTO_FLY_STOP_EVENTS].sort()).toEqual(['keydown', 'pointerdown', 'touchstart', 'wheel'])
    })

    it('stops on Esc', () => {
        const onStop = vi.fn()
        render(<Probe active onStop={onStop} />)
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(onStop).toHaveBeenCalled()
    })

    it('leaves the toggle button to itself and listens only while flying', () => {
        const onStop = vi.fn()
        const { getByRole, rerender } = render(<Probe active onStop={onStop} />)
        fireEvent.pointerDown(getByRole('button'))
        expect(onStop).not.toHaveBeenCalled()
        rerender(<Probe active={false} onStop={onStop} />)
        fireEvent.keyDown(document.body, { key: 'a' })
        expect(onStop).not.toHaveBeenCalled()
    })
})
