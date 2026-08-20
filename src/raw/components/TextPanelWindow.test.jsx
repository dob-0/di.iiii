import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TextPanelWindow from './TextPanelWindow.jsx'

// The Text panel is how a note gets written on a desk — a workshop board that
// says "Our room is about ______" is an instruction to type, and for as long
// as this panel rendered a <p> nobody could obey it. These guards are about
// the two ways it can go wrong: no writing surface at all, and a writing
// surface whose keystrokes go nowhere.
const node = { id: 'n-note', typeId: 'view.text', label: 'Board', values: { content: 'Day 1' } }

describe('TextPanelWindow', () => {
    it('gives a writing surface carrying the current text when it can be edited', () => {
        const { container } = render(<TextPanelWindow node={node} onChange={() => {}} />)
        const box = container.querySelector('textarea')
        expect(box).not.toBeNull()
        expect(box.value).toBe('Day 1')
    })

    it('reports what was typed', () => {
        const onChange = vi.fn()
        const { container } = render(<TextPanelWindow node={node} onChange={onChange} />)
        fireEvent.change(container.querySelector('textarea'), { target: { value: 'Day 2' } })
        expect(onChange).toHaveBeenCalledWith('Day 2')
    })

    // A wire wins on every evaluation, so an editable box here would swallow
    // the typing and redraw the upstream value — refusing is the honest move.
    it('refuses to be typed into while a wire feeds it, and says so', () => {
        const { container } = render(<TextPanelWindow node={node} onChange={() => {}} driven />)
        expect(container.querySelector('textarea')).toBeNull()
        expect(container.textContent).toMatch(/Wired/)
    })

    // Studio embeds this component read-only and passes no handler.
    it('stays a plain reading surface with no handler', () => {
        const { container } = render(<TextPanelWindow node={node} />)
        expect(container.querySelector('textarea')).toBeNull()
        expect(container.textContent).toMatch(/Day 1/)
    })

    it('resolves the wired value it was handed, not the authored one', () => {
        const { container } = render(
            <TextPanelWindow node={node} values={{ content: 'from upstream' }} onChange={() => {}} />
        )
        expect(container.querySelector('textarea').value).toBe('from upstream')
    })
})
