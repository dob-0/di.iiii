import { describe, expect, it } from 'vitest'
import { createEdge, createNode, getNodeType } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeInput } from './nodeGraphRuntime.js'
import { isLiveFedOutput, readNode, resolveInputRow } from './nodeReading.js'

const docOf = (nodes, edges = []) => ({ nodes, edges })
const ctxOf = (document, options) => createNodeGraphContext(document, { now: 0, ...options })

describe('resolveInputRow', () => {
    // THE assertion this whole module lives or dies by. Every other test here
    // could pass while the sheet quietly showed a number the room is not using;
    // this one compares against the runtime itself, port by port, so the sheet
    // and the room cannot disagree without a red test.
    it('reports the value the runtime actually resolves, for every port', () => {
        const colour = createNode('value.color', { values: { value: '#ff0000' } })
        const cube = createNode('geom.cube', { values: { size: [2, 2, 2] } })
        const empty = createNode('geom.sphere')
        const document = docOf([colour, cube, empty], [createEdge(colour.id, 'out', cube.id, 'color')])
        const context = ctxOf(document)

        for (const node of [colour, cube, empty]) {
            const reading = readNode(node, { allNodes: document.nodes, context, document })
            for (const row of reading.takes) {
                expect(row.value, `${node.typeId}.${row.port.id}`)
                    .toEqual(evaluateNodeInput(node, row.port.id, context))
            }
        }
    })

    it('says a value came down a wire only when it did', () => {
        const colour = createNode('value.color', { values: { value: '#ff0000' } })
        const cube = createNode('geom.cube', { values: { color: '#00ff00' } })
        const document = docOf([colour, cube], [createEdge(colour.id, 'out', cube.id, 'color')])
        const context = ctxOf(document)
        const row = resolveInputRow(cube, { id: 'color', type: 'color', default: '#5fa8ff' }, context)
        expect(row.origin).toBe('wire')
        expect(row.value).toBe('#ff0000')
        expect(row.fromNode?.id).toBe(colour.id)
    })

    // THE false-pass trap. The obvious implementation is `if (edge) return
    // 'wired from …'`, and the obvious fixture — a wire that carries something —
    // cannot tell the two apart, so it passes over the one case that matters.
    // Here the wire is connected to a port the source card no longer has, which
    // is what a document outliving a port rename looks like: the runtime gets
    // undefined back and quietly falls through to the node's own value, so the
    // wire is alive on screen and is not where the number came from.
    //
    // Watched red: replacing resolveInputRow's two branches with the obvious
    // `origin: 'wire'` whenever an edge exists fails this and the orphan-edge
    // test below, and nothing else in the suite notices.
    it('does not call a value wired when the wire carries nothing', () => {
        const colour = createNode('value.color', { values: { value: '#ff0000' } })
        const cube = createNode('geom.cube', { values: { color: '#00ff00' } })
        const document = docOf([colour, cube], [createEdge(colour.id, 'a-port-that-was-removed', cube.id, 'color')])
        const context = ctxOf(document)
        const row = resolveInputRow(cube, { id: 'color', type: 'color', default: '#5fa8ff' }, context)
        expect(row.origin).toBe('wire-empty')
        expect(row.value).toBe('#00ff00')
        expect(row.value).toEqual(evaluateNodeInput(cube, 'color', context))
        // …and the source card is still named, because the wire IS there. The
        // row says where it comes from and that nothing is arriving — two facts,
        // not one.
        expect(row.fromNode?.id).toBe(colour.id)
    })

    // The other half of the same distinction, and the reason `wire-empty` keys
    // on undefined rather than on emptiness: null is a value a wire really
    // carries. A camera with no frame yet hands its consumer null, the consumer
    // uses it, and the sheet must show a live wire delivering nothing — not a
    // dead wire, and not the consumer's own default.
    it('keeps a wire that is carrying null on the wire', () => {
        const webcam = createNode('source.webcam')
        const plane = createNode('geom.plane')
        const document = docOf([webcam, plane], [createEdge(webcam.id, 'frame', plane.id, 'texture')])
        const context = ctxOf(document)
        const row = resolveInputRow(plane, { id: 'texture', type: 'texture', default: null }, context)
        expect(row.origin).toBe('wire')
        expect(row.value).toBeNull()
        expect(row.value).toEqual(evaluateNodeInput(plane, 'texture', context))
    })

    it('does not name a card that is gone', () => {
        const cube = createNode('geom.cube')
        const document = docOf([cube], [createEdge('a-node-that-left', 'out', cube.id, 'color')])
        const context = ctxOf(document)
        const row = resolveInputRow(cube, { id: 'color', type: 'color', default: '#5fa8ff' }, context)
        expect(row.origin).toBe('wire-empty')
        expect(row.fromNode).toBeNull()
    })

    it('tells a typed value from a default', () => {
        const cube = createNode('geom.cube', { values: { color: '#123456' } })
        const context = ctxOf(docOf([cube]))
        expect(resolveInputRow(cube, { id: 'color', type: 'color', default: '#5fa8ff' }, context).origin)
            .toBe('typed')
        // A port the node has no stored value for. createNode seeds defaults, so
        // this is built by hand rather than trusting the factory to leave a gap.
        const bare = { ...cube, values: {} }
        expect(resolveInputRow(bare, { id: 'color', type: 'color', default: '#5fa8ff' }, context).origin)
            .toBe('default')
    })
})

describe('doorways', () => {
    const buildContainerWithDoors = () => {
        const container = createNode('universe.space')
        const inDoor = createNode('port.in', {
            parentId: container.id,
            values: { label: 'Camera', portType: 'vec3', fallback: [0, 1.6, 4] }
        })
        const outDoor = createNode('port.out', {
            parentId: container.id,
            values: { label: 'Beat', portType: 'number' }
        })
        return { container, inDoor, outDoor }
    }

    it('names the door a promoted socket stands for', () => {
        const { container, inDoor, outDoor } = buildContainerWithDoors()
        const document = docOf([container, inDoor, outDoor])
        const reading = readNode(container, { allNodes: document.nodes, context: ctxOf(document), document })

        const socket = reading.takes.find((row) => row.port.id === inDoor.id)
        expect(socket).toBeTruthy()
        expect(socket.isDoor).toBe(true)
        expect(socket.doorLabel).toBe('Camera')

        const out = reading.gives.find((row) => row.port.id === outDoor.id)
        expect(out.isDoor).toBe(true)
        expect(out.doorLabel).toBe('Beat')
        expect(out.source).toBe('door')
    })

    // The sheet must agree with the runtime even where the runtime is wrong.
    // getNodeInputDefault reads getNodeInputs(node) with NO scope list, so a
    // door's declared fallback is invisible to it: an unwired door resolves to
    // undefined, not to [0, 1.6, 4]. Showing the fallback here would be a nicer
    // sheet describing a room that does not exist.
    it('shows an unwired door as empty, which is what the runtime hands out', () => {
        const { container, inDoor, outDoor } = buildContainerWithDoors()
        const document = docOf([container, inDoor, outDoor])
        const context = ctxOf(document)
        const reading = readNode(container, { allNodes: document.nodes, context, document })
        const socket = reading.takes.find((row) => row.port.id === inDoor.id)
        expect(socket.origin).toBe('door-empty')
        expect(socket.value).toEqual(evaluateNodeInput(container, inDoor.id, context))
        expect(socket.value).toBeUndefined()
    })

    // A container's OWN settings come from a case in the switch; anything else
    // it gives comes from a door. Both at once is the normal state, and a
    // summary that reported only one of them would be false about the other.
    it('separates a container settings from what its doors give', () => {
        const room = createNode('universe.world', { values: { title: 'Room' } })
        const outDoor = createNode('port.out', { parentId: room.id, values: { label: 'Beat', portType: 'number' } })
        const document = docOf([room, outDoor])
        const reading = readNode(room, { allNodes: document.nodes, context: ctxOf(document), document })
        expect(reading.worksItOut.kind).toBe('mixed')
        // Read from the registry, not spelled out: node labels are being
        // renamed in a parallel pass and this test is about which ANSWER comes
        // from where, not about what the ports are called this week.
        expect(reading.worksItOut.byCode)
            .toEqual(getNodeType('universe.world').outputs.map((port) => port.label))
        expect(reading.worksItOut.byDoor).toEqual(['Beat'])
    })

    // The scoped card list is a different scope from where the doors live. This
    // is the wiring mistake that produces a silently door-less container with
    // every other test still green.
    it('finds no sockets when handed the scoped list instead of the document', () => {
        const { container, inDoor, outDoor } = buildContainerWithDoors()
        const document = docOf([container, inDoor, outDoor])
        const scopedOnly = readNode(container, { allNodes: [container], context: ctxOf(document), document })
        expect(scopedOnly.takes.some((row) => row.isDoor)).toBe(false)
        expect(scopedOnly.gives.some((row) => row.isDoor)).toBe(false)
        // …and with the whole document it does. Both halves asserted, so the
        // test cannot pass by the reading being empty for some other reason.
        const full = readNode(container, { allNodes: document.nodes, context: ctxOf(document), document })
        expect(full.takes.some((row) => row.port.id === inDoor.id)).toBe(true)
        expect(full.gives.some((row) => row.port.id === outDoor.id)).toBe(true)
    })
})

describe('isLiveFedOutput', () => {
    it('finds every port a panel writes into, including the ones that coalesce to 0 and ""', () => {
        const webcam = createNode('source.webcam')
        const midi = createNode('device.midi.in')
        const keeper = createNode('agent.keeper')
        const document = docOf([webcam, midi, keeper])
        expect(isLiveFedOutput(webcam, 'frame', document)).toBe(true)
        expect(isLiveFedOutput(midi, 'note', document)).toBe(true)
        expect(isLiveFedOutput(midi, 'velocity', document)).toBe(true)
        expect(isLiveFedOutput(keeper, 'reply', document)).toBe(true)
        expect(isLiveFedOutput(keeper, 'busy', document)).toBe(true)
    })

    it('does not call an ordinary computed port live', () => {
        const cube = createNode('geom.cube')
        const colour = createNode('value.color')
        const document = docOf([cube, colour])
        expect(isLiveFedOutput(cube, 'bounds', document)).toBe(false)
        expect(isLiveFedOutput(colour, 'out', document)).toBe(false)
    })

    it('reports a closed window as unplugged rather than broken', () => {
        const webcam = createNode('source.webcam', { values: { frame: { visible: false } } })
        webcam.values.frame = { visible: false }
        const document = docOf([webcam])
        const reading = readNode(webcam, { allNodes: document.nodes, context: ctxOf(document), document })
        const frame = reading.gives.find((row) => row.port.id === 'frame')
        expect(frame.source).toBe('live')
        expect(frame.windowClosed).toBe(true)
    })
})

describe('readNode', () => {
    it('says a cube has no inside, and names what does', () => {
        const cube = createNode('geom.cube')
        const document = docOf([cube])
        const reading = readNode(cube, { allNodes: document.nodes, context: ctxOf(document), document })
        expect(reading.inside.kind).toBe('code')
        expect(reading.putsOnScreen.kind).toBe('room')
        expect(reading.kicker).toBe('make')
        expect(reading.inside.containerLabels).toContain('Studio')
        expect(reading.inside.containerLabels.length).toBeGreaterThan(2)
    })

    it('counts what is inside a container', () => {
        const room = createNode('universe.world')
        const document = docOf([room])
        const reading = readNode(room, { allNodes: document.nodes, context: ctxOf(document), document, childCount: 12 })
        expect(reading.inside).toMatchObject({ kind: 'container', count: 12 })
    })

    it('survives a node whose type is not in the registry', () => {
        const ghost = { id: 'x', typeId: 'not.a.real.type', label: 'Ghost', values: {} }
        const document = docOf([ghost])
        const reading = readNode(ghost, { allNodes: document.nodes, context: ctxOf(document), document })
        expect(reading.known).toBe(false)
        expect(reading.takes).toEqual([])
        expect(reading.gives).toEqual([])
        expect(reading.worksItOut.kind).toBe('none')
    })

    it('marks a type that is registered but not built', () => {
        const unbuilt = createNode('stream.monitor')
        const document = docOf([unbuilt].filter(Boolean))
        if (!unbuilt) return
        const reading = readNode(unbuilt, { allNodes: document.nodes, context: ctxOf(document), document })
        expect(reading.known).toBe(true)
        expect(reading.implemented).toBe(false)
    })
})
