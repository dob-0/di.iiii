import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ListPanelWindow from './ListPanelWindow.jsx'

// The node stores one flat `items` array; the grouping is rendered from each
// row's `group` string. These guards are about the four things a list has to
// survive: adding, editing, deleting, and moving a row somewhere else —
// including the two moves that are easy to get wrong, reorder-within-group
// and rename-the-group-without-orphaning-its-rows.
const nodeWith = (items, groups = ['Core', 'Would be good']) => ({
    id: 'n-list', typeId: 'view.list', label: 'Gear', values: { groups, items }
})

const rows = [
    { id: 'a', text: 'Laptops', group: 'Core' },
    { id: 'b', text: 'Displays', group: 'Core' },
    { id: 'c', text: 'Speaker', group: 'Would be good' }
]

const lastPatch = (fn) => fn.mock.calls[fn.mock.calls.length - 1][0]

describe('ListPanelWindow', () => {
    it('shows every row under its own group', () => {
        render(<ListPanelWindow node={nodeWith(rows)} onChange={() => {}} />)
        expect(screen.getByDisplayValue('Laptops')).toBeTruthy()
        expect(screen.getByDisplayValue('Speaker')).toBeTruthy()
        expect(screen.getByLabelText('Item 1 in Would be good')).toBeTruthy()
    })

    it('adds a row to the group whose button was pressed', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.click(screen.getByText('+ Add to Would be good'))
        const added = lastPatch(onChange).items.at(-1)
        expect(added.group).toBe('Would be good')
        expect(added.text).toBe('')
    })

    it('edits a row', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.change(screen.getByDisplayValue('Laptops'), { target: { value: '6-8 laptops' } })
        expect(lastPatch(onChange).items.find((i) => i.id === 'a').text).toBe('6-8 laptops')
    })

    it('deletes a row and leaves the others alone', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.click(screen.getAllByLabelText('Delete')[0])
        const items = lastPatch(onChange).items
        expect(items.map((i) => i.id)).toEqual(['b', 'c'])
    })

    it('moves a row to another group', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Group of Displays'), { target: { value: 'Would be good' } })
        expect(lastPatch(onChange).items.find((i) => i.id === 'b').group).toBe('Would be good')
    })

    // The bug this stops: swapping in the flat array moves a row past a
    // neighbour that belongs to a different group, so on screen nothing
    // happens — the row does not visibly move, because the render is grouped.
    it('reorders within the group, not within the flat array', () => {
        const onChange = vi.fn()
        const interleaved = [
            { id: 'a', text: 'Laptops', group: 'Core' },
            { id: 'c', text: 'Speaker', group: 'Would be good' },
            { id: 'b', text: 'Displays', group: 'Core' }
        ]
        render(<ListPanelWindow node={nodeWith(interleaved)} onChange={onChange} />)
        fireEvent.click(screen.getAllByLabelText('Move up')[1])
        const core = lastPatch(onChange).items.filter((i) => i.group === 'Core').map((i) => i.text)
        expect(core).toEqual(['Displays', 'Laptops'])
    })

    // Rows carry the group by NAME, so a rename that does not move them
    // empties the group and strands every row in a heading nobody can see.
    it('carries the rows along when a group is renamed', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Group 1 name'), { target: { value: 'Must have' } })
        const patch = lastPatch(onChange)
        expect(patch.groups[0]).toBe('Must have')
        expect(patch.items.filter((i) => i.group === 'Must have').map((i) => i.id)).toEqual(['a', 'b'])
    })

    // Deleting a heading must not delete somebody's work.
    it('keeps the rows when their group is removed', () => {
        const onChange = vi.fn()
        render(<ListPanelWindow node={nodeWith(rows)} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Remove group Would be good'))
        const patch = lastPatch(onChange)
        expect(patch.groups).toEqual(['Core'])
        expect(patch.items.find((i) => i.id === 'c').group).toBe('Core')
    })

    it('is a plain reading surface with no handler', () => {
        const { container } = render(<ListPanelWindow node={nodeWith(rows)} />)
        expect(container.querySelector('input')).toBeNull()
        expect(container.querySelector('button')).toBeNull()
        expect(container.textContent).toMatch(/Laptops/)
    })
})
