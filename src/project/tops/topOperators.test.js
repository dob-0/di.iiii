import { describe, expect, it } from 'vitest'
import { TOP_OPERATORS, TOP_TYPE_IDS, buildTopNodeTypes, measurePixels, resolveTopParams, runsHere } from './topOperators.js'
import { createTopEngine, orderNetwork } from './topEngine.js'
import { toTopNetwork } from './useTopNetwork.js'
import { cardHeight } from '../../raw/utils/cardGeometry.js'

describe('picture operators', () => {
    it('evaluates every input before its reader', () => {
        const order = orderNetwork(
            [{ id: 'out' }, { id: 'level' }, { id: 'cam' }],
            [{ from: 'cam', to: 'level' }, { from: 'level', to: 'out' }]
        )
        expect(order).toEqual(['cam', 'level', 'out'])
    })

    it('treats a drawn loop as feedback, not an error — every operator still runs once', () => {
        const order = orderNetwork(
            [{ id: 'a' }, { id: 'b' }],
            [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
        )
        expect([...order].sort()).toEqual(['a', 'b'])
    })

    it('clamps parameters to their range and fills the rest from defaults', () => {
        expect(resolveTopParams('top.feedback', { trail: 7 })).toEqual({ trail: 0.99, mode: 0 })
        expect(resolveTopParams('top.blend', { mode: '3' }).mode).toBe(3)
        expect(resolveTopParams('top.level', { invert: true }).invert).toBe(1)
    })

    it('measures a picture: brightness, how much is lit, and where', () => {
        // 4x2, bottom-up rows; only the top-right pixel lit.
        const pixels = new Uint8Array(4 * 2 * 4)
        pixels.set([255, 255, 255, 255], (1 * 4 + 3) * 4)
        const numbers = measurePixels(pixels, 4, 2, 0.5)
        expect(numbers.amount).toBeCloseTo(1 / 8)
        expect(numbers.x).toBeCloseTo(3.5 / 4)
        expect(numbers.y).toBeCloseTo(0.5 / 2)
    })

    it('becomes node types with a Picture output, settings instead of sockets, and no window', () => {
        const types = buildTopNodeTypes()
        expect(Object.keys(types)).toEqual(TOP_TYPE_IDS)
        for (const [id, type] of Object.entries(types)) {
            expect(type.render, id).toBe('hidden')
            expect(type.outputs[0], id).toEqual({ id: 'out', type: 'texture', label: 'Picture' })
            expect(type.inputs.every((port) => port.type === 'texture'), id).toBe(true)
            expect(type.configInputs.map((field) => field.id), id).toEqual(['machine', ...(TOP_OPERATORS[id].pickDevice ? ['device'] : []), ...(TOP_OPERATORS[id].pickAsset ? ['asset'] : []), ...TOP_OPERATORS[id].params.map((p) => p.name)])
        }
        expect(types['top.analyze'].outputs.map((port) => port.id)).toEqual(['out', 'brightness', 'amount', 'x', 'y'])
    })

    it('reads only picture wires out of a document', () => {
        const network = toTopNetwork({
            nodes: [
                { id: 'cam', typeId: 'top.camera', values: {} },
                { id: 'lvl', typeId: 'top.level', values: { gain: 3 } },
                { id: 'lfo', typeId: 'signal.lfo', values: {} }
            ],
            edges: [
                { fromNodeId: 'cam', fromPort: 'out', toNodeId: 'lvl', toPort: 'a' },
                { fromNodeId: 'lfo', fromPort: 'sine', toNodeId: 'lvl', toPort: 'gain' }
            ]
        })
        expect(network.nodes.map((node) => node.id)).toEqual(['cam', 'lvl'])
        expect(network.wires).toEqual([{ from: 'cam', to: 'lvl', port: 'a' }])
    })

    it('gives a picture card room for its picture without moving a single port', () => {
        const level = { typeId: 'top.level', values: {} }
        const plain = { typeId: 'math.clamp', values: {} }
        expect(cardHeight(level)).toBeGreaterThan(cardHeight({ ...level, typeId: 'math.round' }))
        expect(cardHeight(plain)).toBe(cardHeight({ ...plain }))
    })

    it('runs an operator here only when it belongs to anywhere or to this machine', () => {
        expect(runsHere({ machine: '' }, 'aylmo-id')).toBe(true)
        expect(runsHere({}, null)).toBe(true)
        expect(runsHere({ machine: 'aylmo-id' }, 'aylmo-id')).toBe(true)
        expect(runsHere({ machine: 'asuz-id' }, 'aylmo-id')).toBe(false)
        // Before this page knows which machine it is on, a pinned operator waits
        // rather than opening the wrong camera.
        expect(runsHere({ machine: 'asuz-id' }, null)).toBe(false)
    })

    it('has a Clip In fed from a video like Camera In, its file picked from the project', () => {
        const clip = TOP_OPERATORS['top.clip']
        expect(clip).toMatchObject({ label: 'Clip In', family: 'in', inputs: [], source: 'clip' })
        expect(clip.fragment).toContain('uniform sampler2D source')
        const type = buildTopNodeTypes()['top.clip']
        expect(type.defaultValues).toEqual({ machine: '', asset: '', trigger: 0, speed: 1, mode: '0', in: 0, out: 1, playing: true })
        expect(type.configInputs.find((field) => field.id === 'asset')).toMatchObject({ type: 'asset', path: ['asset'], assetKind: 'video' })
        expect(type.configInputs.find((field) => field.id === 'mode').options.map((o) => o.label)).toEqual(['Loop', 'Bounce', 'Once'])
        expect(resolveTopParams('top.clip', { speed: 9, out: 0.4 })).toMatchObject({ speed: 4, out: 0.4, playing: 1 })
    })
})

// Just enough WebGL to count uploads: every call succeeds, handles are objects.
const fakeGl = () => {
    const uploads = []
    const gl = new Proxy({ uploads }, {
        get(target, name) {
            if (name in target) return target[name]
            if (name === 'getShaderParameter' || name === 'getProgramParameter') return () => true
            if (name === 'getExtension') return () => null
            if (name === 'texImage2D') return (...args) => { if (args.length === 6) uploads.push(args[5]) }
            if (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name)) return name
            return () => ({})
        }
    })
    return gl
}

describe('the engine feeds every source operator its video', () => {
    for (const type of ['top.camera', 'top.clip']) {
        it(`uploads the video of a ${type} when its time moves`, () => {
            const gl = fakeGl()
            const engine = createTopEngine({ canvas: { width: 4, height: 4, getContext: () => gl }, width: 4, height: 4 })
            engine.setNetwork({ nodes: [{ id: 'src', type, values: {} }], wires: [] })
            const video = { readyState: 4, currentTime: 1 }
            engine.setVideo('src', video)
            engine.frame(0)
            expect(gl.uploads.filter((item) => item === video)).toHaveLength(1)
            engine.frame(16)
            expect(gl.uploads.filter((item) => item === video)).toHaveLength(1)
            video.currentTime = 1.1
            engine.frame(32)
            expect(gl.uploads.filter((item) => item === video)).toHaveLength(2)
        })
    }
})
