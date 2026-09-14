// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkNodeScriptText, createNodeScriptHost, plainOutputs } from './nodeScriptsHost.js'

const hostWithLog = () => {
    const log = []
    const host = createNodeScriptHost((message) => log.push(message), { clock: () => 0 })
    return { host, log }
}

const run = (host, items, batch = 1) => host.handle({ type: 'run', batch, items })
const resultsOf = (log) => log.filter((message) => message.type === 'result')

describe('node script worker host', () => {
    it('announces each script before it runs and after, then the batch', () => {
        const { host, log } = hostWithLog()
        run(host, [
            { nodeId: 'a', text: 'function compute(){ return { out: 1 } }', inputs: {}, time: 0, values: {} },
            { nodeId: 'b', text: 'function compute(){ return { out: 2 } }', inputs: {}, time: 0, values: {} }
        ], 7)
        expect(log.map((message) => `${message.type}:${message.nodeId || ''}`)).toEqual([
            'start:a', 'result:a', 'start:b', 'result:b', 'done:'
        ])
        expect(log.every((message) => message.batch === 7)).toBe(true)
    })

    it('hands a script its inputs, time, values and a memory that persists across frames', () => {
        const { host, log } = hostWithLog()
        const text = `function compute({ inputs, time, values, memory }) {
            memory.count = (memory.count || 0) + 1
            return { out: inputs.value * values.gain + time, count: memory.count }
        }`
        for (let frame = 0; frame < 3; frame += 1) {
            run(host, [{ nodeId: 'n', text, inputs: { value: 2 }, time: frame, values: { gain: 10 } }], frame)
        }
        expect(resultsOf(log).map((message) => message.outputs)).toEqual([
            { out: 20, count: 1 }, { out: 21, count: 2 }, { out: 22, count: 3 }
        ])
    })

    it('starts memory over when the text changes', () => {
        const { host, log } = hostWithLog()
        const counter = (step) => `function compute({ memory }) { memory.n = (memory.n || 0) + ${step}; return { out: memory.n } }`
        run(host, [{ nodeId: 'n', text: counter(1) }])
        run(host, [{ nodeId: 'n', text: counter(1) }])
        run(host, [{ nodeId: 'n', text: counter(5) }])
        expect(resultsOf(log).map((message) => message.outputs.out)).toEqual([1, 2, 5])
    })

    it('reports a throw as the message and keeps the batch going', () => {
        const { host, log } = hostWithLog()
        run(host, [
            { nodeId: 'bad', text: 'function compute(){ throw new Error("nope") }' },
            { nodeId: 'good', text: 'function compute(){ return { out: 3 } }' }
        ])
        const [bad, good] = resultsOf(log)
        expect(bad).toMatchObject({ nodeId: 'bad', outputs: null, error: 'nope' })
        expect(good).toMatchObject({ nodeId: 'good', outputs: { out: 3 }, error: null })
    })

    it('reports a compile error and a script with no compute()', () => {
        const { host, log } = hostWithLog()
        run(host, [
            { nodeId: 'syntax', text: 'function compute( {' },
            { nodeId: 'empty', text: 'const x = 1' }
        ])
        const [syntax, empty] = resultsOf(log)
        expect(syntax.error).toBeTruthy()
        expect(empty.error).toMatch(/no compute\(\)/)
    })

    it('inputs and values are frozen — a script cannot write into the next frame through them', () => {
        const { host, log } = hostWithLog()
        run(host, [{ nodeId: 'n', text: 'function compute({ inputs }) { inputs.value = 9; return { out: 1 } }', inputs: { value: 1 } }])
        expect(resultsOf(log)[0].error).toMatch(/read only|read-only|Cannot assign/i)
    })

    it('sends back only values that clone: numbers, booleans, strings, null, numeric vectors', () => {
        expect(plainOutputs({ a: 1, b: true, c: 'x', d: null, e: [1, 2, 3], f: () => 1, g: { x: 1 }, h: NaN, i: Infinity })).toEqual({
            a: 1, b: true, c: 'x', d: null, e: [1, 2, 3]
        })
        expect(plainOutputs(null)).toEqual({})
        expect(plainOutputs([1, 2])).toEqual({})
    })

    it('checks syntax without running a line of the script', () => {
        const { host, log } = hostWithLog()
        // Would loop forever if it ran; a check only parses.
        host.handle({ type: 'check', id: 4, text: 'while (true) {}\nfunction compute(){ return {} }' })
        expect(log).toEqual([{ type: 'checked', id: 4, error: null }])
        expect(checkNodeScriptText('function compute( {')).toBeTruthy()
        expect(checkNodeScriptText('return 1')).toMatch(/compute/)
        expect(checkNodeScriptText('')).toBe(null)
    })

    it('forgets a node: compiled code and memory go', () => {
        const { host, log } = hostWithLog()
        const text = 'function compute({ memory }) { memory.n = (memory.n || 0) + 1; return { out: memory.n } }'
        run(host, [{ nodeId: 'n', text }])
        run(host, [{ nodeId: 'n', text }])
        host.handle({ type: 'forget', nodeIds: ['n'] })
        expect(host.has('n')).toBe(false)
        run(host, [{ nodeId: 'n', text }])
        expect(resultsOf(log).map((message) => message.outputs.out)).toEqual([1, 2, 1])
    })
})
