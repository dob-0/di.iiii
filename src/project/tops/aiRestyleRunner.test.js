import { describe, expect, it, vi } from 'vitest'
import { flipRows, startAiRestyleNode } from './aiRestyleRunner.js'
import { TOP_OPERATORS, resolveTopParams, buildTopNodeTypes } from './topOperators.js'

// The engine and the live-AI client are stand-ins the test can see into; what
// is checked is the join: what the runner asks the engine for, what it hands
// the client, and when the operator's picture changes over to the model's.
const fakeEngine = (pixels = null) => ({
    width: 640,
    height: 360,
    readInput: vi.fn(() => pixels),
    setImage: vi.fn()
})

const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ putImageData: vi.fn(), drawImage: vi.fn() }) })

const run = (engine, params = { prompt: 'gold leaf', strength: 0.7 }) => {
    const started = {}
    const client = { setParams: vi.fn(), stop: vi.fn() }
    const node = startAiRestyleNode({
        engine,
        nodeId: 'ai1',
        params,
        start: (options) => { Object.assign(started, options); return client },
        createCanvas: fakeCanvas,
        makeImageData: (data, width, height) => ({ data, width, height })
    })
    return { node, started, client }
}

describe('startAiRestyleNode', () => {
    it("hands the client the operator's params and a source at the engine's size", () => {
        const { started } = run(fakeEngine())
        expect(started.params).toEqual({ prompt: 'gold leaf', strength: 0.7 })
        expect(started.source.size()).toEqual({ width: 640, height: 360 })
        // Answers are drawn ~512 wide in the network's own shape.
        expect([started.canvas.width, started.canvas.height]).toEqual([512, 288])
    })

    it('reads the input only when asked, and says "not yet" when nothing is wired in', () => {
        const engine = fakeEngine(null)
        const { started } = run(engine)
        const context = { putImageData: vi.fn() }
        expect(started.source.draw(context, 512, 288)).toBe(false)
        expect(engine.readInput).toHaveBeenCalledWith('ai1', 512, 288)
        expect(context.putImageData).not.toHaveBeenCalled()
    })

    it('flips the GL read-back upright before it is sent', () => {
        // 1x2 picture: bottom row red, top row blue, as GL stores it.
        const engine = fakeEngine(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]))
        const { started } = run(engine)
        const context = { putImageData: vi.fn() }
        expect(started.source.draw(context, 1, 2)).toBe(true)
        const sent = context.putImageData.mock.calls[0][0].data
        expect([...sent]).toEqual([0, 0, 255, 255, 255, 0, 0, 255])
    })

    it('keeps the input showing until the first answer, then feeds every new one', () => {
        const engine = fakeEngine()
        const { started } = run(engine)
        expect(engine.setImage).not.toHaveBeenCalled()
        started.onFrame()
        expect(engine.setImage).toHaveBeenCalledTimes(1)
        const picture = engine.setImage.mock.calls[0][1]
        expect(picture.version).toBe(1)
        started.onFrame()
        started.onFrame()
        // Same picture object, newer version — the engine uploads only on a change.
        expect(engine.setImage).toHaveBeenCalledTimes(1)
        expect(picture.version).toBe(3)
    })

    it('changes prompt and strength in place, and lets go of the picture on stop', () => {
        const engine = fakeEngine()
        const { node, client } = run(engine)
        node.setParams({ prompt: 'deep blue' })
        expect(client.setParams).toHaveBeenCalledWith({ prompt: 'deep blue' })
        node.stop()
        expect(client.stop).toHaveBeenCalled()
        expect(engine.setImage).toHaveBeenLastCalledWith('ai1', null)
    })
})

describe('flipRows', () => {
    it('reverses row order and nothing else', () => {
        const pixels = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4])
        expect([...flipRows(pixels, 2, 2)]).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 1, 1, 1, 1, 2, 2, 2, 2])
    })
})

describe('the AI Restyle operator', () => {
    it('is a picture operator with one input, fed from outside the GPU chain', () => {
        const operator = TOP_OPERATORS['top.aiRestyle']
        expect(operator.source).toBe('ai')
        expect(operator.inputs).toEqual(['a'])
        expect(buildTopNodeTypes()['top.aiRestyle']).toBeTruthy()
    })

    it('bounds its prompt and strength', () => {
        const params = resolveTopParams('top.aiRestyle', { prompt: `  ${'x'.repeat(500)}  `, strength: 9 })
        expect(params.prompt).toHaveLength(200)
        expect(params.strength).toBe(1)
        expect(resolveTopParams('top.aiRestyle', {})).toEqual({ prompt: '', strength: 0.5 })
    })

    it('passes its input through until a picture arrives (the shader reads sourceReady)', () => {
        const fragment = TOP_OPERATORS['top.aiRestyle'].fragment
        expect(fragment).toMatch(/sourceReady > 0\.5/)
        expect(fragment).toMatch(/texture2D\(a, uv\)/)
    })
})
