import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SliderPanelWindow from './SliderPanelWindow.jsx'

const node = { id: 'fader-1', typeId: 'view.slider', label: 'Level', values: { value: 0.25 } }
const track = () => {
    const element = screen.getByRole('slider', { name: 'Level' })
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 200, right: 80, bottom: 200 })
    return element
}

describe('SliderPanelWindow', () => {
    it('the finger is live while held; the level lands as one op on release', () => {
        const onLive = vi.fn()
        const onCommit = vi.fn()
        render(<SliderPanelWindow node={node} onLive={onLive} onCommit={onCommit} />)
        const element = track()
        expect(element.getAttribute('aria-valuenow')).toBe('0.25')
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 40, clientY: 50 })
        expect(onLive).toHaveBeenLastCalledWith('fader-1', 0.75, true)
        fireEvent.pointerMove(element, { pointerId: 1, clientX: 40, clientY: 100 })
        expect(onLive).toHaveBeenLastCalledWith('fader-1', 0.5, true)
        expect(screen.getByText('0.50')).toBeTruthy()
        expect(onCommit).not.toHaveBeenCalled()
        fireEvent.pointerUp(element, { pointerId: 1 })
        fireEvent.lostPointerCapture(element, { pointerId: 1 })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('fader-1', 0.5)
        expect(onLive).toHaveBeenLastCalledWith('fader-1', null, false)
    })

    it('a move with no finger down does nothing', () => {
        const onLive = vi.fn()
        render(<SliderPanelWindow node={node} onLive={onLive} onCommit={() => {}} />)
        fireEvent.pointerMove(track(), { clientX: 40, clientY: 10 })
        expect(onLive).not.toHaveBeenCalled()
    })

    it('arrow keys step a hundredth of the range', () => {
        const onCommit = vi.fn()
        render(<SliderPanelWindow node={node} values={{ ...node.values, min: 0, max: 10, value: 5 }} onCommit={onCommit} />)
        fireEvent.keyDown(track(), { key: 'ArrowUp' })
        expect(onCommit).toHaveBeenCalledWith('fader-1', 5.1)
    })

    it('horizontal reads left to right', () => {
        const onLive = vi.fn()
        render(<SliderPanelWindow node={node} values={{ ...node.values, direction: 'horizontal' }} onLive={onLive} onCommit={() => {}} />)
        const element = track()
        expect(element.getAttribute('aria-orientation')).toBe('horizontal')
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 20, clientY: 199 })
        expect(onLive).toHaveBeenLastCalledWith('fader-1', 0.25, true)
    })

    it('without a writer the slider says it is disabled and ignores a finger', () => {
        const onLive = vi.fn()
        render(<SliderPanelWindow node={node} onLive={onLive} />)
        const element = track()
        expect(element.getAttribute('aria-disabled')).toBe('true')
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 40, clientY: 50 })
        expect(onLive).not.toHaveBeenCalled()
    })
})
