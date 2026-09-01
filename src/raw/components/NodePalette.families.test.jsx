import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NodePalette from './NodePalette.jsx'
import { NODE_FAMILIES } from '../../project/nodeRegistry.js'

beforeEach(() => {
    // jsdom has no scrollIntoView; the palette calls it on arrow navigation
    Element.prototype.scrollIntoView = vi.fn()
})

// Browse mode (empty query) groups the palette by family — the flat 39-row
// dump in registry declaration order was where "raw feels messy" lived. Any
// typed character must dissolve the grouping back into the flat ranked list,
// and the keyboard highlight must never land on a header.

const placement = { clientX: 100, clientY: 100 }

const open = (props = {}) => render(
    <NodePalette open surface="graph" placement={placement} onClose={() => {}} onCreate={() => {}} {...props} />
)

const input = () => screen.getByPlaceholderText(/type a node or panel name/i)

describe('NodePalette family grouping', () => {
    it('shows one header per non-empty family, in declared order, on empty query', () => {
        const { container } = open()
        const headers = [...container.querySelectorAll('.raw-node-palette-group')]
            .map((el) => el.firstChild.textContent)
        expect(headers.length).toBeGreaterThan(3)
        const declaredOrder = NODE_FAMILIES.map((family) => family.label).filter((label) => headers.includes(label))
        expect(headers).toEqual(declaredOrder)
    })

    it('headers carry the placeable count for their family', () => {
        const { container } = open()
        const numbers = [...container.querySelectorAll('.raw-node-palette-group')]
            .find((el) => el.firstChild.textContent === 'numbers')
        // value.* (6) + time + the maths + the logic operators + Lag/Noise +
        // the TD-audit waves. Nine fewer than before the 2026-09-01 operator
        // merge: eight math types became Math's operation menu, and Gate and
        // Switch became Route's.
        expect(numbers.querySelector('.raw-node-palette-group-count').textContent).toBe('38')
    })

    it('any typed character dissolves the grouping into the flat list', () => {
        const { container } = open()
        fireEvent.change(input(), { target: { value: 'add' } })
        expect(container.querySelectorAll('.raw-node-palette-group').length).toBe(0)
        expect(screen.getByText('math.op')).toBeInTheDocument()
    })

    it('ArrowDown skips headers — the highlight only ever rests on a choice', () => {
        const { container } = open()
        const list = [...container.querySelectorAll('li')]
        // walk far enough to have crossed at least two headers
        for (let i = 0; i < 12; i += 1) fireEvent.keyDown(input(), { key: 'ArrowDown' })
        const active = container.querySelector('.raw-node-palette-item.is-active')
        expect(active).toBeTruthy()
        expect(list.some((li) => li.contains(active))).toBe(true)
    })

    it('Enter on open creates the first node even though a header row sits above it', () => {
        const onCreate = vi.fn()
        open({ onCreate })
        fireEvent.keyDown(input(), { key: 'Enter' })
        expect(onCreate).toHaveBeenCalled()
        expect(onCreate.mock.calls[0][0].definition.id).toBeTruthy()
    })

    it('tags dev-local-only nodes honestly', () => {
        open()
        fireEvent.change(input(), { target: { value: 'work.agent' } })
        expect(screen.getByText('local dev')).toBeInTheDocument()
    })
})

describe('NodePalette first contact (plan PR 1.8)', () => {
    it('browsing leads with make — the first family a first-timer sees holds the scene atoms', () => {
        const { container } = open()
        const firstHeader = container.querySelector('.raw-node-palette-group')?.firstChild?.textContent
        expect(firstHeader).toBe('make')
    })

    it('commands sit after the node families when browsing, not before', () => {
        const { container } = open({ commands: [{ id: 'help', label: 'Help', hint: '', run: () => {} }] })
        const rows = [...container.querySelectorAll('.raw-node-palette li')].map((el) => el.textContent)
        const helpIndex = rows.findIndex((text) => text.startsWith('Help'))
        const cubeIndex = rows.findIndex((text) => text.startsWith('Cube'))
        expect(cubeIndex).toBeGreaterThanOrEqual(0)
        expect(helpIndex).toBeGreaterThan(cubeIndex)
    })

    it('the working Monitor carries no shell tag', () => {
        const { container } = open()
        const monitorRow = [...container.querySelectorAll('.raw-node-palette li')]
            .find((el) => el.textContent.startsWith('Monitor'))
        expect(monitorRow).toBeTruthy()
        expect(monitorRow.textContent).not.toMatch(/shell/i)
    })
})
