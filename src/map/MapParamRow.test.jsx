import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { ParamRow } from './MapDeskDock.jsx'

// Emily, 2026-11-11, picked "Thin slider + number box": the line moves the
// value, the box always shows it and takes typing. These pin what she was
// shown on the style page: type + Enter sets it, Esc cancels, ↑/↓ in the box
// step, double-click on the line is the default, and the choice stays a
// labelled radiogroup (the Mapping window's tests find it that way).

const NUMBER = { kind: 'number', label: 'Swirl', min: -3, max: 3, step: 0.01, default: 1 }

function Harness({ spec, start, onChange }) {
    const [value, setValue] = useState(start)
    return <ParamRow spec={spec} value={value} onChange={(next) => { onChange?.(next); setValue(next) }} />
}

describe('ParamRow (thin slider + number box)', () => {
    it('shows the value in a box, and typing + Enter sets it, clamped to the range', () => {
        const onChange = vi.fn()
        const { getByLabelText } = render(<Harness spec={NUMBER} start={1} onChange={onChange} />)
        const box = getByLabelText('Swirl value')
        expect(box.value).toBe('1.00')
        fireEvent.focus(box)
        fireEvent.change(box, { target: { value: '2,5' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        fireEvent.blur(box)
        expect(onChange).toHaveBeenLastCalledWith(2.5)
        expect(box.value).toBe('2.50')
        fireEvent.focus(box)
        fireEvent.change(box, { target: { value: '9' } })
        fireEvent.blur(box)
        expect(onChange).toHaveBeenLastCalledWith(3)
    })

    it('Esc puts the typed text back without changing the value', () => {
        const onChange = vi.fn()
        const { getByLabelText } = render(<Harness spec={NUMBER} start={1} onChange={onChange} />)
        const box = getByLabelText('Swirl value')
        fireEvent.focus(box)
        fireEvent.change(box, { target: { value: '-2' } })
        fireEvent.keyDown(box, { key: 'Escape' })
        fireEvent.blur(box)
        expect(onChange).not.toHaveBeenCalled()
        expect(box.value).toBe('1.00')
    })

    it('↑/↓ in the box step it (shift ×10)', () => {
        const onChange = vi.fn()
        const { getByLabelText } = render(<Harness spec={NUMBER} start={1} onChange={onChange} />)
        const box = getByLabelText('Swirl value')
        fireEvent.focus(box)
        fireEvent.keyDown(box, { key: 'ArrowUp' })
        expect(onChange).toHaveBeenLastCalledWith(1.01)
        fireEvent.keyDown(box, { key: 'ArrowDown', shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(0.91)
    })

    it('the line is a slider; arrows step it and a double-click is the default', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<Harness spec={NUMBER} start={-2} onChange={onChange} />)
        const line = getByRole('slider', { name: 'Swirl' })
        fireEvent.keyDown(line, { key: 'ArrowRight', shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(-1.9)
        fireEvent.doubleClick(line)
        expect(onChange).toHaveBeenLastCalledWith(1)
    })

    it('a choice is a labelled radiogroup of tabs; on/off is a switch', () => {
        const onChange = vi.fn()
        const choice = { kind: 'choice', label: 'Cubes', default: 'story', options: [['story', 'Story'], ['together', 'Together']] }
        const first = render(<Harness spec={choice} start="story" onChange={onChange} />)
        fireEvent.click(first.getByRole('radio', { name: 'Together' }))
        expect(onChange).toHaveBeenLastCalledWith('together')
        expect(first.getByRole('radiogroup', { name: 'Cubes' })).toBeTruthy()
        first.unmount()
        const second = render(<Harness spec={{ kind: 'toggle', label: 'Invert', default: false }} start={false} onChange={onChange} />)
        fireEvent.click(second.getByRole('switch', { name: 'Invert' }))
        expect(onChange).toHaveBeenLastCalledWith(true)
    })
})
