import { describe, expect, it, vi } from 'vitest'
import { createEdge, createNode, getNodeType } from '../nodeRegistry.js'
import {
    createNodeGraphContext,
    evaluateNodeInput,
    evaluateNodeInputs,
    evaluateNodeOutput
} from './nodeGraphRuntime.js'

describe('nodeGraphRuntime', () => {
    // Regression test for the 2026-07-17 perf audit: evaluateNodeInput did a
    // linear edges.find() scan per input port, O(E) per lookup. createNode
    // GraphContext now builds an edgesByTarget index once per pass so the
    // lookup is an O(1) Map get instead.
    it('createNodeGraphContext builds an edgesByTarget index, and evaluateNodeInput uses it', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const edge = createEdge('color-1', 'out', 'cube-1', 'color')
        const context = createNodeGraphContext({ nodes: [color, cube], edges: [edge] })

        expect(context.edgesByTarget).toBeInstanceOf(Map)
        expect(context.edgesByTarget.get('cube-1:color')).toBe(edge)

        const findSpy = vi.spyOn(context.edges, 'find')
        expect(evaluateNodeInput(cube, 'color', context)).toBe('#00ff00')
        expect(findSpy).not.toHaveBeenCalled()
    })

    it('falls back to a linear edge scan for a hand-built context with no edgesByTarget', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const edge = createEdge('color-1', 'out', 'cube-1', 'color')
        const handBuiltContext = {
            nodesById: new Map([['color-1', color], ['cube-1', cube]]),
            edges: [edge]
        }

        expect(evaluateNodeInput(cube, 'color', handBuiltContext)).toBe('#00ff00')
    })

    it('resolves source outputs into render-node inputs', () => {
        const color = createNode('value.color', { id: 'color-1', values: { value: '#00ff00' } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const context = createNodeGraphContext({
            nodes: [color, cube],
            edges: [createEdge('color-1', 'out', 'cube-1', 'color')]
        })

        expect(evaluateNodeInput(cube, 'color', context)).toBe('#00ff00')
    })

    it('computes geom.cube.bounds from its resolved size and carries it across a wire', () => {
        const size = createNode('value.vec3', { id: 'size-1', values: { value: [2, 3, 4] } })
        const cube = createNode('geom.cube', { id: 'cube-1' })
        const receiver = createNode('geom.cube', { id: 'cube-2' })
        const context = createNodeGraphContext({
            nodes: [size, cube, receiver],
            edges: [
                createEdge('size-1', 'out', 'cube-1', 'size'),
                createEdge('cube-1', 'bounds', 'cube-2', 'position')
            ]
        })

        expect(evaluateNodeOutput(cube, 'bounds', context)).toEqual([2, 3, 4])
        expect(evaluateNodeInput(receiver, 'position', context)).toEqual([2, 3, 4])
    })

    it('reads source.webcam.frame from the injected liveOutputs map, and returns null when uncaptured', () => {
        const webcam = createNode('source.webcam', { id: 'webcam-1' })
        const fakeTexture = { isTexture: true }
        const liveContext = createNodeGraphContext(
            { nodes: [webcam], edges: [] },
            { liveOutputs: new Map([['webcam-1:frame', fakeTexture]]) }
        )
        expect(evaluateNodeOutput(webcam, 'frame', liveContext)).toBe(fakeTexture)

        const emptyContext = createNodeGraphContext({ nodes: [webcam], edges: [] })
        expect(evaluateNodeOutput(webcam, 'frame', emptyContext)).toBeNull()
    })

    it('reads source.mic.volume/.frequency from the injected liveOutputs map, defaulting to silence when uncaptured', () => {
        const mic = createNode('source.mic', { id: 'mic-1' })
        const spectrum = new Uint8Array([1, 2, 3])
        const liveContext = createNodeGraphContext(
            { nodes: [mic], edges: [] },
            { liveOutputs: new Map([['mic-1:volume', 0.42], ['mic-1:frequency', spectrum]]) }
        )
        expect(evaluateNodeOutput(mic, 'volume', liveContext)).toBe(0.42)
        expect(evaluateNodeOutput(mic, 'frequency', liveContext)).toBe(spectrum)

        const emptyContext = createNodeGraphContext({ nodes: [mic], edges: [] })
        expect(evaluateNodeOutput(mic, 'volume', emptyContext)).toBe(0)
        expect(evaluateNodeOutput(mic, 'frequency', emptyContext)).toBeNull()
    })

    it('carries a live webcam texture across a wire into geom.plane.texture', () => {
        const webcam = createNode('source.webcam', { id: 'webcam-1' })
        const plane = createNode('geom.plane', { id: 'plane-1' })
        const fakeTexture = { isTexture: true }
        const context = createNodeGraphContext(
            { nodes: [webcam, plane], edges: [createEdge('webcam-1', 'frame', 'plane-1', 'texture')] },
            { liveOutputs: new Map([['webcam-1:frame', fakeTexture]]) }
        )
        expect(evaluateNodeInput(plane, 'texture', context)).toBe(fakeTexture)
    })

    it('evaluates math nodes through chained edges', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 2 } })
        const b = createNode('value.number', { id: 'b', values: { value: 3 } })
        const add = createNode('math.add', { id: 'add' })
        const context = createNodeGraphContext({
            nodes: [a, b, add],
            edges: [
                createEdge('a', 'out', 'add', 'a'),
                createEdge('b', 'out', 'add', 'b')
            ]
        })

        expect(evaluateNodeOutput(add, 'out', context)).toBe(5)
    })

    it('evaluates subtract/divide/mod/power operators', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 9 } })
        const b = createNode('value.number', { id: 'b', values: { value: 4 } })
        const subtract = createNode('math.subtract', { id: 'subtract' })
        const divide = createNode('math.divide', { id: 'divide' })
        const mod = createNode('math.mod', { id: 'mod' })
        const pow = createNode('math.pow', { id: 'pow' })
        const context = createNodeGraphContext({
            nodes: [a, b, subtract, divide, mod, pow],
            edges: [
                createEdge('a', 'out', 'subtract', 'a'),
                createEdge('b', 'out', 'subtract', 'b'),
                createEdge('a', 'out', 'divide', 'a'),
                createEdge('b', 'out', 'divide', 'b'),
                createEdge('a', 'out', 'mod', 'a'),
                createEdge('b', 'out', 'mod', 'b'),
                createEdge('a', 'out', 'pow', 'a'),
                createEdge('b', 'out', 'pow', 'b')
            ]
        })

        expect(evaluateNodeOutput(subtract, 'out', context)).toBe(5)
        expect(evaluateNodeOutput(divide, 'out', context)).toBe(2.25)
        expect(evaluateNodeOutput(mod, 'out', context)).toBe(1)
        expect(evaluateNodeOutput(pow, 'out', context)).toBe(6561)
    })

    it('evaluates multiply', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 6 } })
        const b = createNode('value.number', { id: 'b', values: { value: 7 } })
        const multiply = createNode('math.multiply', { id: 'multiply' })
        const context = createNodeGraphContext({
            nodes: [a, b, multiply],
            edges: [
                createEdge('a', 'out', 'multiply', 'a'),
                createEdge('b', 'out', 'multiply', 'b')
            ]
        })

        expect(evaluateNodeOutput(multiply, 'out', context)).toBe(42)
    })

    it('a value.boolean returns exactly what it stores', () => {
        // The only member of the computed core that had zero coverage —
        // it shares the value.* switch case, but sharing is what a regression
        // quietly breaks.
        const flag = createNode('value.boolean', { id: 'flag', values: { value: true } })
        const context = createNodeGraphContext({ nodes: [flag], edges: [] })
        expect(evaluateNodeOutput(flag, 'out', context)).toBe(true)
        flag.values.value = false
        const context2 = createNodeGraphContext({ nodes: [flag], edges: [] })
        expect(evaluateNodeOutput(flag, 'out', context2)).toBe(false)
    })

    it('mixes two hex colors per RGB channel instead of hard-switching at t=0.5', () => {
        const a = createNode('value.color', { id: 'ca', values: { value: '#000000' } })
        const b = createNode('value.color', { id: 'cb', values: { value: '#ff0080' } })
        const t = createNode('value.number', { id: 'ct', values: { value: 0.5 } })
        const mix = createNode('math.mix', { id: 'mix-color' })
        const context = createNodeGraphContext({
            nodes: [a, b, t, mix],
            edges: [
                createEdge('ca', 'out', 'mix-color', 'a'),
                createEdge('cb', 'out', 'mix-color', 'b'),
                createEdge('ct', 'out', 'mix-color', 't')
            ]
        })
        expect(evaluateNodeOutput(mix, 'out', context)).toBe('#800040')
    })

    it('mixes numbers and vec3s by t, and clamps a value into range', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 0 } })
        const b = createNode('value.number', { id: 'b', values: { value: 10 } })
        const t = createNode('value.number', { id: 't', values: { value: 0.25 } })
        const mixNum = createNode('math.mix', { id: 'mix-num' })
        const vecA = createNode('value.vec3', { id: 'vec-a', values: { value: [0, 0, 0] } })
        const vecB = createNode('value.vec3', { id: 'vec-b', values: { value: [4, 8, 12] } })
        const mixVec = createNode('math.mix', { id: 'mix-vec' })
        const clamp = createNode('math.clamp', { id: 'clamp', values: { min: 0, max: 5 } })
        const context = createNodeGraphContext({
            nodes: [a, b, t, mixNum, vecA, vecB, mixVec, clamp],
            edges: [
                createEdge('a', 'out', 'mix-num', 'a'),
                createEdge('b', 'out', 'mix-num', 'b'),
                createEdge('t', 'out', 'mix-num', 't'),
                createEdge('vec-a', 'out', 'mix-vec', 'a'),
                createEdge('vec-b', 'out', 'mix-vec', 'b'),
                createEdge('t', 'out', 'mix-vec', 't'),
                createEdge('b', 'out', 'clamp', 'in')
            ]
        })

        expect(evaluateNodeOutput(mixNum, 'out', context)).toBe(2.5)
        expect(evaluateNodeOutput(mixVec, 'out', context)).toEqual([1, 2, 3])
        expect(evaluateNodeOutput(clamp, 'out', context)).toBe(5)
    })

    it('returns zero for divide/mod by zero', () => {
        const a = createNode('value.number', { id: 'a', values: { value: 10 } })
        const zero = createNode('value.number', { id: 'zero', values: { value: 0 } })
        const divide = createNode('math.divide', { id: 'divide' })
        const mod = createNode('math.mod', { id: 'mod' })
        const context = createNodeGraphContext({
            nodes: [a, zero, divide, mod],
            edges: [
                createEdge('a', 'out', 'divide', 'a'),
                createEdge('zero', 'out', 'divide', 'b'),
                createEdge('a', 'out', 'mod', 'a'),
                createEdge('zero', 'out', 'mod', 'b')
            ]
        })

        expect(evaluateNodeOutput(divide, 'out', context)).toBe(0)
        expect(evaluateNodeOutput(mod, 'out', context)).toBe(0)
    })

    it('resolves full input sets for view nodes, including string content', () => {
        const text = createNode('value.string', { id: 'text-1', values: { value: 'Hello graph' } })
        const panel = createNode('view.text', { id: 'panel-1' })
        const context = createNodeGraphContext({
            nodes: [text, panel],
            edges: [createEdge('text-1', 'out', 'panel-1', 'content')]
        })

        expect(evaluateNodeInputs(panel, context).content).toBe('Hello graph')
    })

    // Regression test for audit finding #23: a shared upstream node (here,
    // `sin` feeding both `left` and `right`) was recomputed once per
    // consumer within a single evaluation pass instead of once per pass.
    // Spying on Math.sin (the only thing `math.sin` calls) makes the
    // recomputation directly observable without inspecting internals.
    it('memoizes a shared upstream node within one evaluation pass', () => {
        const sinSpy = vi.spyOn(Math, 'sin')
        const angle = createNode('value.number', { id: 'angle', values: { value: 1 } })
        const sin = createNode('math.sin', { id: 'sin' })
        const left = createNode('math.add', { id: 'left' })
        const right = createNode('math.add', { id: 'right' })
        const context = createNodeGraphContext({
            nodes: [angle, sin, left, right],
            edges: [
                createEdge('angle', 'out', 'sin', 'in'),
                createEdge('sin', 'out', 'left', 'a'),
                createEdge('sin', 'out', 'right', 'a')
            ]
        })

        const leftOut = evaluateNodeOutput(left, 'out', context)
        const rightOut = evaluateNodeOutput(right, 'out', context)

        expect(leftOut).toBe(rightOut)
        expect(sinSpy).toHaveBeenCalledTimes(1)

        sinSpy.mockRestore()
    })
})

describe('time node', () => {
    const timeNode = { id: 't1', typeId: 'time', values: {} }

    it('outputs elapsed seconds from the injected clock', () => {
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] }, { now: 2500 })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx)).toBe(2.5)
    })

    it('is a stopped clock, not undefined, when no clock is injected', () => {
        // Regression: `time` used to have no case at all and fell through to
        // `default`, returning undefined and poisoning every downstream math node.
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx)).toBe(0)
        expect(evaluateNodeOutput(timeNode, 'sin', ctx)).toBe(0)
        expect(evaluateNodeOutput(timeNode, 'beat', ctx)).toBe(0)
    })

    it('sin/cos trace a full cycle per beat at the given bpm', () => {
        // 60 bpm = 1 beat/sec, so t=0.25s is a quarter turn.
        const node = { ...timeNode, values: { bpm: 60 } }
        const at = (ms) => createNodeGraphContext({ nodes: [node], edges: [] }, { now: ms })
        expect(evaluateNodeOutput(node, 'sin', at(0))).toBeCloseTo(0, 6)
        expect(evaluateNodeOutput(node, 'cos', at(0))).toBeCloseTo(1, 6)
        expect(evaluateNodeOutput(node, 'sin', at(250))).toBeCloseTo(1, 6)
        expect(evaluateNodeOutput(node, 'sin', at(1000))).toBeCloseTo(0, 6)
    })

    it('beat counts up once per beat and never goes backwards', () => {
        const node = { ...timeNode, values: { bpm: 120 } }  // 2 beats/sec
        const beatAt = (ms) => evaluateNodeOutput(
            node, 'beat', createNodeGraphContext({ nodes: [node], edges: [] }, { now: ms })
        )
        expect(beatAt(0)).toBe(0)
        expect(beatAt(499)).toBe(0)
        expect(beatAt(500)).toBe(1)
        expect(beatAt(2000)).toBe(4)
    })

    it('clamps a zero or negative bpm instead of freezing or running backwards', () => {
        for (const bpm of [0, -120]) {
            const node = { ...timeNode, values: { bpm } }
            const ctx = createNodeGraphContext({ nodes: [node], edges: [] }, { now: 60000 })
            const beat = evaluateNodeOutput(node, 'beat', ctx)
            expect(Number.isFinite(beat)).toBe(true)
            expect(beat).toBeGreaterThanOrEqual(0)
        }
    })

    it('holds one value for the whole pass so two readers cannot disagree', () => {
        const ctx = createNodeGraphContext({ nodes: [timeNode], edges: [] }, { now: 1234 })
        expect(evaluateNodeOutput(timeNode, 'elapsed', ctx))
            .toBe(evaluateNodeOutput(timeNode, 'elapsed', ctx))
    })

    it('drives a downstream math node — the point of having a clock', () => {
        const time = { id: 't', typeId: 'time', values: { bpm: 60 } }
        const add = { id: 'a', typeId: 'math.add', values: { b: 10 } }
        const edge = { fromNodeId: 't', fromPort: 'elapsed', toNodeId: 'a', toPort: 'a' }
        const ctx = createNodeGraphContext({ nodes: [time, add], edges: [edge] }, { now: 3000 })
        expect(evaluateNodeOutput(add, 'out', ctx)).toBe(13)
    })
})

// Every container declared ZERO outputs before this, so nearestOutputPort had
// an empty list to iterate and a press-and-pull on a World card silently
// DRAGGED THE CARD. That is "can't connect" at the data layer, not a UX bug.
describe('container outputs', () => {
    const CONTAINERS = [
        ['universe.world', ['title', 'bgColor']],
        ['universe.desk.3d', ['position', 'rotation', 'scale']],
        ['studio', ['title']]
    ]

    // The load-bearing one. A test that only asks "did something come out"
    // passes against computeNodeOutput's fallthrough, which returns the node's
    // own stored value and silently ignores every wire into the matching input —
    // a port that draws, persists, survives a reload and lies.
    it.each(CONTAINERS)('%s carries a WIRED value out, not the stored one', (typeId, ports) => {
        for (const portId of ports) {
            const type = getNodeType(typeId)
            const portType = type.outputs.find((port) => port.id === portId).type
            const [sourceType, wired, stored] = portType === 'vec3'
                ? ['value.vec3', [7, 8, 9], [1, 1, 1]]
                : portType === 'color'
                    ? ['value.color', '#abcdef', '#000000']
                    : ['value.string', 'wired through', 'stored locally']
            const source = createNode(sourceType, { id: 'src', values: { value: wired } })
            const container = createNode(typeId, { id: 'box', values: { [portId]: stored } })
            const ctx = createNodeGraphContext({
                nodes: [source, container],
                edges: [createEdge('src', 'out', 'box', portId)]
            })
            expect(evaluateNodeOutput(container, portId, ctx), `${typeId}.${portId}`).toEqual(wired)
        }
    })

    it.each(CONTAINERS)('%s declares no output the runtime cannot compute', (typeId) => {
        const container = createNode(typeId, { id: 'box' })
        const ctx = createNodeGraphContext({ nodes: [container], edges: [] })
        const outputs = getNodeType(typeId).outputs
        expect(outputs.length).toBeGreaterThan(0)
        for (const port of outputs) {
            expect(
                evaluateNodeOutput(container, port.id, ctx),
                `${typeId}.${port.id} draws a wire and carries nothing`
            ).not.toBeUndefined()
        }
    })

    // A CONTAINER OUTPUTS ITS OWN SETTINGS, NEVER ITS CONTENTS. Assuming wires
    // pass through a container is the most common container mistake in every
    // node tool surveyed, so nothing about a child may leak across the boundary.
    it('leaks nothing about what is inside it', () => {
        const container = createNode('universe.desk.3d', { id: 'box', values: { position: [1, 2, 3] } })
        const child = createNode('geom.cube', { id: 'kid', parentId: 'box', values: { color: '#ff0000' } })
        const ctx = createNodeGraphContext({ nodes: [container, child], edges: [] })
        for (const port of getNodeType('universe.desk.3d').outputs) {
            expect(evaluateNodeOutput(container, port.id, ctx)).not.toBe('#ff0000')
        }
        // …and the container has no port that could name a child at all.
        const ids = getNodeType('universe.desk.3d').outputs.map((port) => port.id)
        expect(ids).not.toContain('children')
        expect(ids).not.toContain('contents')
    })

    // universe.space keeps zero outputs deliberately: showChrome has no input
    // anywhere it could drive to a visible result, so a port would be the exact
    // dead wire this whole rule exists to prevent.
    it('gives universe.space no outputs, on purpose', () => {
        expect(getNodeType('universe.space').outputs).toEqual([])
    })

    // arePortsCompatible has always allowed color -> vec3 and the input dot
    // lights up compatible, but asVec3 returned the fallback for a non-array, so
    // the wire drew and quietly produced [0,0,0]. Nothing reached it until a
    // container gained a colour OUTPUT.
    it('turns a wired colour into a real vector instead of silently zeroing it', () => {
        const sky = createNode('value.color', { id: 'sky', values: { value: '#ff8000' } })
        const desk = createNode('universe.desk.3d', { id: 'desk' })
        const ctx = createNodeGraphContext({
            nodes: [sky, desk],
            edges: [createEdge('sky', 'out', 'desk', 'position')]
        })
        const position = evaluateNodeOutput(desk, 'position', ctx)
        expect(position[0]).toBeCloseTo(1, 2)
        expect(position[1]).toBeCloseTo(128 / 255, 2)
        expect(position[2]).toBeCloseTo(0, 5)
    })
})
