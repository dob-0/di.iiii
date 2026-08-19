import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NodeAnatomyPanel from './NodeAnatomyPanel.jsx'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { readNode } from '../../project/graph/nodeReading.js'

// NOTHING here is mocked. The panel is fed by readNode, which asks the real
// registry and the real runtime — and the last time a surface in this lane was
// tested against a stubbed mechanism, the stub kept every test green over the
// semantics that were broken. A fixture document costs three lines; a stub
// costs the only thing these tests are for.
const sheetFor = (node, nodes, edges = [], extra = {}) => {
    const document = { nodes, edges }
    const reading = readNode(node, {
        allNodes: nodes,
        context: createNodeGraphContext(document, { now: 0 }),
        document,
        ...extra
    })
    const { container } = render(<NodeAnatomyPanel reading={reading} />)
    return { container, text: container.textContent, reading }
}

describe('NodeAnatomyPanel', () => {
    // The shape IS the argument: a Cube, a container, a camera and a text panel
    // all answer the same four questions, and the only structural difference is
    // whether the fourth answer has anything in it. If the headings ever stop
    // being the same four in the same order, the thing the sheet teaches is gone.
    it('asks the same four questions, in the same order, of every kind of node', () => {
        const cases = [
            createNode('geom.cube'),
            createNode('universe.space'),
            createNode('source.webcam'),
            createNode('view.text'),
            createNode('math.add')
        ]
        for (const node of cases) {
            const { container } = sheetFor(node, [node])
            const headings = [...container.querySelectorAll('.raw-anatomy-slot h4')]
                .map((el) => el.firstChild.textContent.trim())
            expect(headings, node.typeId).toEqual([
                'What it takes and gives',
                'What works it out',
                'What puts it on screen',
                'What is inside it'
            ])
        }
    })

    it('tells a cube it is made of code, and names what is not', () => {
        const cube = createNode('geom.cube')
        const { text } = sheetFor(cube, [cube])
        expect(text).toContain('made of code, not of other nodes')
        expect(text).toContain('Studio')
        // The raw container set also holds two types nobody can place. Naming
        // them sends a reader looking for nodes that are not in the palette.
        expect(text).not.toContain('Node 0')
    })

    it('says where a value came from, and does not say wire when nothing is coming through', () => {
        const colour = createNode('value.color', { label: 'A colour', values: { value: '#ff5599' } })
        const cube = createNode('geom.cube', { values: { color: '#00ff00' } })
        const live = sheetFor(cube, [colour, cube], [createEdge(colour.id, 'out', cube.id, 'color')])
        expect(live.text).toContain('wired from A colour')
        expect(live.text).toContain('#ff5599')

        const dead = sheetFor(cube, [colour, cube], [createEdge(colour.id, 'a-removed-port', cube.id, 'color')])
        expect(dead.text).toContain('nothing is coming through, so this is its own value')
        expect(dead.text).toContain('#00ff00')
    })

    // An empty port is a fact. Rendered as a blank cell it reads as a bug; as
    // "0" it reads as a value that is not there.
    it('writes an empty port as a word, never as blank and never as zero', () => {
        const box = createNode('universe.space')
        const door = createNode('port.out', { parentId: box.id, values: { label: 'Beat', portType: 'number' } })
        const { container, text } = sheetFor(box, [box, door])
        expect(text).toContain('nothing coming out')
        expect(text).toContain('this socket is the door “Beat” standing inside it')
        const empties = [...container.querySelectorAll('.raw-anatomy-value.is-empty')]
        expect(empties.length).toBeGreaterThan(0)
        for (const el of empties) expect(el.textContent.trim()).toBe('nothing')
    })

    it('separates what a container works out itself from what its doors bring', () => {
        const room = createNode('universe.world', { label: 'Room' })
        const door = createNode('port.out', { parentId: room.id, values: { label: 'Beat', portType: 'number' } })
        const { text } = sheetFor(room, [room, door], [], { childCount: 3 })
        expect(text).toContain('worked out by code')
        expect(text).toContain('Beat comes from an Out door standing inside it')
        expect(text).toContain('It holds 3 nodes. You are standing in them.')
    })

    it('says an empty container is empty rather than saying it has no inside', () => {
        const box = createNode('universe.space')
        const { text } = sheetFor(box, [box], [], { childCount: 0 })
        expect(text).toContain('It can hold nodes. There are none in it yet')
        expect(text).not.toContain('made of code')
    })

    it('says a live port depends on its window, and says when that window is shut', () => {
        const open = createNode('source.webcam')
        expect(sheetFor(open, [open]).text).toContain('put here by its own window')

        const shut = createNode('source.webcam')
        shut.values = { ...shut.values, frame: { visible: false } }
        expect(sheetFor(shut, [shut]).text).toContain('nothing coming out — its window is closed')
    })

    it('warns on a type that is registered but not built', () => {
        const unbuilt = createNode('stream.monitor')
        const { container, text } = sheetFor(unbuilt, [unbuilt])
        expect(container.querySelector('.raw-anatomy-banner')).toBeTruthy()
        expect(text).toContain('not built yet')
    })

    it('renders nothing dangerous when there is nothing to read', () => {
        const { container } = render(<NodeAnatomyPanel reading={null} />)
        expect(container.textContent).toContain('Nothing to read.')
    })

    // The sheet reads. An editor that grew a control here would be a surface
    // people stop trusting to be read-only.
    it('offers no way to change anything', () => {
        const cube = createNode('geom.cube')
        const { container } = sheetFor(cube, [cube])
        expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0)
        expect(container.querySelectorAll('button')).toHaveLength(0)
    })
})
