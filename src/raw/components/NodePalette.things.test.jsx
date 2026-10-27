import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NodePalette from './NodePalette.jsx'
import { LIGHTS, PRIMITIVES } from '../../project/entityPalette.js'

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
})

// Unit 7 of the layers decision: the Nodes palette makes the same things
// Studio's Add makes, beside — never instead of — the shape nodes.

const placement = { clientX: 100, clientY: 100 }
const open = (props = {}) => render(
    <NodePalette open placement={placement} onClose={() => {}} onCreate={() => {}} {...props} />
)
const input = () => screen.getByPlaceholderText(/type a node or panel name/i)
const headers = (container) => [...container.querySelectorAll('.raw-node-palette-group')].map((el) => el.firstChild.textContent)

describe('NodePalette — things', () => {
    it('lists nothing new for a caller that cannot make things', () => {
        const { container } = open()
        expect(headers(container)).not.toContain('things')
    })

    it('browsing puts "things" right after "make", holding every thing Studio’s Add offers', () => {
        const { container } = open({ onCreateThing: vi.fn() })
        const list = headers(container)
        expect(list[0]).toBe('make')
        expect(list[1]).toBe('things')
        const group = [...container.querySelectorAll('.raw-node-palette-group')].find((el) => el.firstChild.textContent === 'things')
        expect(group.querySelector('.raw-node-palette-group-count').textContent).toBe(String(PRIMITIVES.length + LIGHTS.length))
    })

    it('keeps the Cube and Sphere nodes in the palette', () => {
        open({ onCreateThing: vi.fn() })
        fireEvent.change(input(), { target: { value: 'sphere' } })
        expect(screen.getByText('geom.sphere')).toBeInTheDocument()
        fireEvent.change(input(), { target: { value: 'cube' } })
        expect(screen.getByText('geom.cube')).toBeInTheDocument()
    })

    it('typing "box" and Enter makes a box thing', () => {
        const onCreateThing = vi.fn()
        const onCreate = vi.fn()
        open({ onCreateThing, onCreate })
        fireEvent.change(input(), { target: { value: 'box' } })
        fireEvent.keyDown(input(), { key: 'Enter' })
        expect(onCreate).not.toHaveBeenCalled()
        expect(onCreateThing).toHaveBeenCalledWith({ type: 'box', placement })
    })

    // A name that is both keeps placing the node it always placed — type-to-
    // place must not change under anyone — and the thing is the next row.
    it('a name that is both still places the node first; the thing is the row below', () => {
        const { container } = open({ onCreateThing: vi.fn(), onCreate: vi.fn() })
        fireEvent.change(input(), { target: { value: 'sphere' } })
        const rows = [...container.querySelectorAll('.raw-node-palette-item')].map((row) => row.textContent)
        expect(rows[0]).toMatch(/^Sphere.*geom\.sphere/)
        expect(rows[1]).toMatch(/^Sphere.*a thing/)
    })

    it('"lamp" finds the point light first', () => {
        const onCreateThing = vi.fn()
        open({ onCreateThing })
        fireEvent.change(input(), { target: { value: 'lamp' } })
        fireEvent.keyDown(input(), { key: 'Enter' })
        expect(onCreateThing).toHaveBeenCalledWith({ type: 'pointLight', placement })
    })

    it('a tap on a thing row makes it', () => {
        const onCreateThing = vi.fn()
        open({ onCreateThing })
        fireEvent.change(input(), { target: { value: 'torus' } })
        const row = [...document.querySelectorAll('.raw-node-palette-item')].find((el) => /a thing/.test(el.textContent))
        fireEvent.click(row)
        expect(onCreateThing).toHaveBeenCalledWith({ type: 'torus', placement })
    })
})
