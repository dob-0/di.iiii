import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PadPanelWindow from './PadPanelWindow.jsx'

const node = { id: 'pad-1', typeId: 'view.pad', label: 'Pad', values: { x: 0, y: 0, spring: true } }
const area = () => {
    const element = screen.getByRole('application', { name: 'Pad' })
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 })
    return element
}

describe('PadPanelWindow', () => {
    it('springs back: live while held, centre on release with no op when already centred', () => {
        const onLive = vi.fn()
        const onCommit = vi.fn()
        render(<PadPanelWindow node={node} onLive={onLive} onCommit={onCommit} />)
        const element = area()
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 150, clientY: 50 })
        expect(onLive).toHaveBeenLastCalledWith('pad-1', { x: 0.5, y: 0.5 }, true)
        expect(screen.getByText('X 0.50 · Y 0.50')).toBeTruthy()
        fireEvent.pointerUp(element, { pointerId: 1 })
        expect(onLive).toHaveBeenLastCalledWith('pad-1', null, false)
        expect(onCommit).not.toHaveBeenCalled()
        expect(screen.getByText('X 0.00 · Y 0.00')).toBeTruthy()
    })

    it('stays: the release point lands as one op', () => {
        const onCommit = vi.fn()
        render(<PadPanelWindow node={node} values={{ ...node.values, spring: false }} onCommit={onCommit} />)
        const element = area()
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 0, clientY: 200 })
        fireEvent.pointerMove(element, { pointerId: 1, clientX: 50, clientY: 150 })
        fireEvent.pointerUp(element, { pointerId: 1 })
        fireEvent.lostPointerCapture(element, { pointerId: 1 })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('pad-1', { x: -0.5, y: -0.5 })
    })

    it('springs back to the centre from a kept point, as an op', () => {
        const onCommit = vi.fn()
        render(<PadPanelWindow node={node} values={{ ...node.values, x: 0.4, y: 0.2 }} onCommit={onCommit} />)
        const element = area()
        fireEvent.pointerDown(element, { pointerId: 1, clientX: 10, clientY: 10 })
        fireEvent.pointerCancel(element, { pointerId: 1 })
        expect(onCommit).toHaveBeenCalledWith('pad-1', { x: 0, y: 0 })
    })

    it('without a writer the pad ignores a finger', () => {
        const onLive = vi.fn()
        render(<PadPanelWindow node={node} onLive={onLive} />)
        fireEvent.pointerDown(area(), { pointerId: 1, clientX: 10, clientY: 10 })
        expect(onLive).not.toHaveBeenCalled()
    })
})
