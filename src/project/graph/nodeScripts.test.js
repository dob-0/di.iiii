import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createNodeGraphContext, evaluateNodeInput, evaluateNodeOutput } from './nodeGraphRuntime.js'
import { createNodeScriptHost } from './nodeScriptsHost.js'
import {
    SCRIPTS_BLOCKED_MESSAGE,
    SCRIPT_EXAMPLE_COMPUTE,
    buildScriptResults,
    clearNodeScriptStatus,
    coerceScriptOutputs,
    collectScriptItems,
    createNodeScriptRunner,
    nodeScriptText,
    readNodeScriptStatus,
    useNodeScripts
} from './nodeScripts.js'
import { guardFrame, compileTopScript } from '../tops/topScripts.js'

// A Worker stand-in that runs the REAL host in-process. `deliver()` hands the
// host's queued messages to the runner, the way a worker's postMessage would
// arrive on a later turn. `hang` makes the host stop answering after a given
// node's 'start' — what an infinite loop looks like from the page.
const fakeWorkerFactory = ({ hangOn = null } = {}) => {
    const made = []
    const create = () => {
        const outbox = []
        const worker = {
            onmessage: null,
            terminated: false,
            hangOn,
            postMessage(message) {
                if (worker.terminated) return
                const host = worker.host
                if (message.type === 'run' && worker.hangOn) {
                    const items = []
                    for (const item of message.items) {
                        if (item.nodeId === worker.hangOn) {
                            // Everything before it answers; then it starts
                            // and never returns: no result, no done.
                            host.handle({ type: 'run', batch: message.batch, items })
                            outbox.splice(outbox.findIndex((m) => m.type === 'done'), 1)
                            outbox.push({ type: 'start', batch: message.batch, nodeId: item.nodeId })
                            worker.hung = true
                            return
                        }
                        items.push(item)
                    }
                }
                host.handle(message)
            },
            terminate() { worker.terminated = true },
            deliver() {
                while (outbox.length) {
                    const message = outbox.shift()
                    worker.onmessage?.({ data: message })
                }
            }
        }
        worker.host = createNodeScriptHost((message) => outbox.push(message), { clock: () => 0 })
        outbox.push({ type: 'ready' })
        made.push(worker)
        return worker
    }
    return { create, made }
}

const numberNode = (id, script, value = 1) => ({ id, typeId: 'value.number', values: { value, __script: script } })

afterEach(() => clearNodeScriptStatus())

describe('the hook in computeNodeOutput', () => {
    const doc = {
        nodes: [
            { id: 'a', typeId: 'value.number', values: { value: 2 } },
            { id: 'c', typeId: 'geom.cube', values: {} }
        ],
        edges: []
    }

    it('a returned port overrides the built-in; a port not returned keeps it', () => {
        const scriptResults = new Map([['c', { bounds: [4, 4, 4] }]])
        const context = createNodeGraphContext(doc, { scriptResults })
        expect(evaluateNodeOutput(doc.nodes[1], 'bounds', context)).toEqual([4, 4, 4])
        expect(evaluateNodeOutput(doc.nodes[1], 'geometry', context)).toMatchObject({ kind: 'box', size: [1, 1, 1] })
    })

    it('no scriptResults is exactly the old runtime', () => {
        const context = createNodeGraphContext(doc)
        expect(context.scriptResults).toBe(null)
        expect(evaluateNodeOutput(doc.nodes[0], 'out', context)).toBe(2)
    })

    it('a scripted output travels down a wire', () => {
        const wired = {
            nodes: [
                { id: 'n', typeId: 'value.number', values: { value: 1 } },
                { id: 'c', typeId: 'geom.cube', values: {} }
            ],
            edges: [{ id: 'e', fromNodeId: 'n', fromPort: 'out', toNodeId: 'c', toPort: 'opacity' }]
        }
        const context = createNodeGraphContext(wired, { scriptResults: new Map([['n', { out: 0.25 }]]) })
        expect(evaluateNodeInput(wired.nodes[1], 'opacity', context)).toBe(0.25)
    })
})

describe('what goes to the worker', () => {
    it('only scripted, non-picture nodes; only declared inputs, resolved; pictures and shapes as null', () => {
        const doc = {
            nodes: [
                { id: 'src', typeId: 'value.number', values: { value: 3 } },
                { id: 'm', typeId: 'math.op', values: { operation: 'add', a: 1, b: 0, __script: 'function compute(){ return {} }', __shader: 'x' } },
                { id: 'cube', typeId: 'geom.cube', values: { __script: 'function compute(){ return {} }' } },
                { id: 'top', typeId: 'top.level', values: { __script: 'function frame(){ return {} }' } },
                { id: 'plain', typeId: 'value.number', values: { value: 1 } }
            ],
            edges: [{ id: 'e', fromNodeId: 'src', fromPort: 'out', toNodeId: 'm', toPort: 'b' }]
        }
        const items = collectScriptItems(doc, { now: 2500 })
        expect(items.map((item) => item.nodeId)).toEqual(['m', 'cube'])
        expect(items[0]).toMatchObject({ time: 2.5, inputs: { a: 1, b: 3 }, values: { operation: 'add', a: 1, b: 0 } })
        expect(items[0].values.__script).toBeUndefined()
        expect(items[1].inputs.color).toBe('#5fa8ff')
        expect(nodeScriptText(doc.nodes[3])).toBe('')
    })
})

describe('what comes back', () => {
    it('keeps only real output ports, each fitted to its type', () => {
        const cube = { id: 'c', typeId: 'geom.cube', values: {} }
        expect(coerceScriptOutputs(cube, { bounds: [1, 2, 3, 4], geometry: { kind: 'box' }, nonsense: 1 })).toEqual({ bounds: [1, 2, 3] })
        const number = { id: 'n', typeId: 'value.number', values: {} }
        expect(coerceScriptOutputs(number, { out: 'x' })).toEqual({})
        expect(coerceScriptOutputs(number, { out: true })).toEqual({ out: 1 })
    })

    it('drops an answer whose node was deleted or whose text changed', () => {
        const doc = { nodes: [numberNode('n', 'function compute(){ return { out: 5 } }')], edges: [] }
        const raw = new Map([
            ['n', { text: 'function compute(){ return { out: 5 } }', outputs: { out: 5 } }],
            ['gone', { text: 'x', outputs: { out: 1 } }]
        ])
        expect([...buildScriptResults(doc, raw)]).toEqual([['n', { out: 5 }]])
        const edited = { nodes: [numberNode('n', 'function compute(){ return { out: 6 } }')], edges: [] }
        expect(buildScriptResults(edited, raw).size).toBe(0)
    })
})

describe('the runner', () => {
    const item = (nodeId, text, extra = {}) => ({ nodeId, text, inputs: {}, time: 0, values: {}, ...extra })

    it('runs a batch in the worker and keeps the last answer', () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        const seen = vi.fn()
        runner.subscribe(seen)
        expect(runner.tick([item('n', 'function compute(){ return { out: 7 } }')])).toBe(true)
        made[0].deliver()
        expect(runner.results.get('n').outputs).toEqual({ out: 7 })
        expect(seen).toHaveBeenCalledTimes(1)
        expect(readNodeScriptStatus('n')).toMatchObject({ error: null, stopped: null })
    })

    it('sends one batch at a time — a slow worker skips frames, never queues them', () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        const text = 'function compute(){ return { out: 1 } }'
        expect(runner.tick([item('n', text)])).toBe(true)
        expect(runner.tick([item('n', text)])).toBe(false)
        const factory = vi.fn(() => [item('n', text)])
        runner.tick(factory)
        expect(factory).not.toHaveBeenCalled()
        made[0].deliver()
        expect(runner.tick(factory)).toBe(true)
    })

    it('an infinite loop: past the budget the worker is killed, the one running is stopped, the rest go on', () => {
        let now = 0
        const { create, made } = fakeWorkerFactory({ hangOn: 'loop' })
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => now, budgetMs: 250 })
        const good = item('good', 'function compute(){ return { out: 1 } }')
        const loop = item('loop', 'function compute(){ while (true) {} }')
        runner.tick([good, loop])
        made[0].deliver()
        expect(made[0].hung).toBe(true)
        expect(runner.pending.running).toBe('loop')
        // 'good' answered before 'loop' started; nothing has come back since.
        expect(runner.results.get('good').outputs).toEqual({ out: 1 })
        now = 100
        expect(runner.tick([good, loop])).toBe(false)
        now = 400
        // Over budget: kill, restart, and run without the offender.
        expect(runner.tick([good, loop])).toBe(true)
        expect(made[0].terminated).toBe(true)
        expect(made).toHaveLength(2)
        expect(readNodeScriptStatus('loop').stopped).toMatch(/took too long/)
        expect(readNodeScriptStatus('good').stopped).toBeFalsy()
        made[1].hangOn = null
        made[1].deliver()
        expect(runner.results.get('good').outputs).toEqual({ out: 1 })
        expect(runner.results.has('loop')).toBe(false)
        // Stopped until the text changes...
        runner.tick([good, loop])
        made[1].deliver()
        runner.tick([good, loop])
        expect(runner.pending.order).toEqual(['good'])
        made[1].deliver()
        // ...and an edited script gets another go.
        const fixed = item('loop', 'function compute(){ return { out: 2 } }')
        runner.tick([good, fixed])
        expect(runner.pending.order).toEqual(['good', 'loop'])
        made[1].deliver()
        expect(runner.results.get('loop').outputs).toEqual({ out: 2 })
        expect(readNodeScriptStatus('loop').stopped).toBe(null)
    })

    it('the budget counts from when the worker is ready, not from a slow module load', () => {
        let now = 0
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => now })
        runner.tick([item('n', 'function compute(){ return { out: 1 } }')])
        now = 5000
        // not ready yet: never killed for being slow to load
        expect(runner.busy()).toBe(true)
        made[0].deliver()
        expect(made[0].terminated).toBe(false)
        expect(runner.results.get('n').outputs).toEqual({ out: 1 })
    })

    it('a throw reports the message and falls back to built-in until the text changes', () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        const bad = item('n', 'function compute(){ throw new Error("boom") }')
        runner.tick([bad])
        made[0].deliver()
        expect(readNodeScriptStatus('n').error).toBe('boom')
        expect(runner.results.has('n')).toBe(false)
        expect(runner.tick([bad])).toBe(false)
        expect(runner.tick([item('n', 'function compute(){ return { out: 1 } }')])).toBe(true)
        made[0].deliver()
        expect(readNodeScriptStatus('n').error).toBe(null)
    })

    it('forget gives a stopped script another go with the same text', () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        const bad = item('n', 'function compute(){ throw new Error("boom") }')
        runner.tick([bad])
        made[0].deliver()
        expect(runner.tick([bad])).toBe(false)
        runner.forget('n')
        expect(runner.tick([bad])).toBe(true)
    })

    it('checks syntax in the worker', async () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        const good = runner.check(SCRIPT_EXAMPLE_COMPUTE)
        const bad = runner.check('function compute( {')
        made[0].deliver()
        expect(await good).toBe(null)
        expect(await bad).toBeTruthy()
    })

    it('the example compute runs', () => {
        const { create, made } = fakeWorkerFactory()
        const runner = createNodeScriptRunner({ createWorker: create, clock: () => 0 })
        runner.tick([item('n', SCRIPT_EXAMPLE_COMPUTE, { time: 0 })])
        made[0].deliver()
        expect(runner.results.get('n').outputs).toEqual({ out: 0.5 })
    })
})

describe('the gate', () => {
    it('a machine that does not run desk scripts runs none and says so', () => {
        const OriginalWorker = globalThis.Worker
        const spy = vi.fn()
        globalThis.Worker = spy
        try {
            const doc = { nodes: [numberNode('n', 'function compute(){ return { out: 9 } }')], edges: [] }
            const { result } = renderHook(() => useNodeScripts(doc, { scriptsAllowed: false }))
            expect(result.current).toBe(null)
            expect(spy).not.toHaveBeenCalled()
            expect(readNodeScriptStatus('n').blocked).toBe(SCRIPTS_BLOCKED_MESSAGE)
        } finally {
            globalThis.Worker = OriginalWorker
        }
    })
})

describe('picture operator frame() guard', () => {
    it('a frame() that runs past its budget throws once it returns', () => {
        let t = 0
        const slow = guardFrame(() => { t += 30; return { opacity: 1 } }, { budgetMs: 20, now: () => t })
        expect(() => slow()).toThrow(/took 30 ms/)
        const quick = guardFrame(() => ({ opacity: 1 }), { budgetMs: 20, now: () => t })
        expect(quick()).toEqual({ opacity: 1 })
    })

    it('compiled operator scripts carry the guard and keep open()', () => {
        const compiled = compileTopScript('function frame(){ return { a: 1 } }\nasync function open(){ return null }')
        expect(compiled.frame()).toEqual({ a: 1 })
        expect(typeof compiled.open).toBe('function')
    })
})
