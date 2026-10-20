import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NodePalette from './NodePalette.jsx'

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
})

// Two pairs of cards do neighbouring jobs and the palette offers both:
// Webcam and Camera In, Video and Clip In (node audit 2026-10-02 §2). Each
// row now says how it differs and names the other, in words the product
// already uses, so a person does not have to place both to find out.
const open = () => render(
    <NodePalette open surface="graph" placement={{ clientX: 100, clientY: 100 }} onClose={() => {}} onCreate={() => {}} />
)

const rowFor = (container, label) => [...container.querySelectorAll('.raw-node-palette-item')]
    .find((row) => row.querySelector('strong')?.textContent === label)

const noteOf = (container, label) => rowFor(container, label)?.querySelector('.raw-node-palette-item-note')?.textContent || ''

describe('NodePalette: neighbours name each other', () => {
    it.each([
        ['Webcam', 'Camera In', /this browser/i],
        ['Camera In', 'Webcam', /any machine/i],
        ['Video', 'Clip In', /standing in the scene/i],
        ['Clip In', 'Video', /picture operators/i],
    ])('%s says how it differs and points to %s', (label, other, differs) => {
        const { container } = open()
        expect(rowFor(container, label), `${label} row`).toBeTruthy()
        expect(rowFor(container, other), `${other} row`).toBeTruthy()
        const note = noteOf(container, label)
        expect(note).toMatch(differs)
        expect(note).toContain(other)
    })

    // A note that names the other card is no use if typing its job does not
    // find it: "camera" listed Camera In and never Webcam (2026-10-02).
    it.each([
        ['camera', ['Webcam', 'Camera In']],
        ['video', ['Video', 'Clip In']],
    ])('typing "%s" lists both neighbours', (query, labels) => {
        const { container } = open()
        fireEvent.change(screen.getByPlaceholderText(/type a node or panel name/i), { target: { value: query } })
        for (const label of labels) expect(rowFor(container, label), label).toBeTruthy()
    })

    it('adds no note to a row without a neighbour', () => {
        const { container } = open()
        expect(noteOf(container, 'Cube')).toBe('')
        expect(rowFor(container, 'Cube').classList.contains('has-note')).toBe(false)
    })
})
