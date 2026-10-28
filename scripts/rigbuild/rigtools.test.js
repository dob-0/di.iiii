import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOpen, axisValues, stepWrites, planOf, runLoop, bufferOf, main as loopMain } from './laser-axis-loop.mjs'
import { windowOf, makeChangeLogger, main as logMain } from './wire-log.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { editDmxBody, noStreamSource } = require('./browser-lamp-lit.cjs')

const ARGS = { desk: 'http://x/light/api', read: 'http://x/light/api/dmx', universe: '1', first: '10', 'dimmer-ch': '0', 'colour-ch': '4', 'x-ch': '5', 'y-ch': '6', 'x-colour': '25', 'y-colour': '59' }

describe('laser-axis-loop plan', () => {
    it('requires every target argument: no default address, universe or channel', () => {
        for (const k of Object.keys(ARGS)) { const a = { ...ARGS }; delete a[k]; expect(() => planOf(a)).toThrow(`--${k}`) }
    })
    it('rejects values outside 0-255, equal channel offsets and bad --open', () => {
        expect(() => planOf({ ...ARGS, max: '300' })).toThrow()
        expect(() => planOf({ ...ARGS, 'x-ch': '6' })).toThrow('must differ')
        expect(() => parseOpen('1=300')).toThrow()
        expect(parseOpen('1=2, 3=4')).toEqual([[1, 2], [3, 4]])
    })
    it('sweeps min→max→min and writes colour, swept and held channels', () => {
        expect(axisValues(100, 4)).toEqual([0, 25, 50, 75, 100, 75, 50, 25, 0])
        expect(stepWrites({ first: 10, colourCh: 4, sweepCh: 5, holdCh: 6, colour: 25, value: 7, hold: 64 })).toEqual([[14, 25], [15, 7], [16, 64]])
    })
    it('reads the node-style single-key buffer', () => {
        expect(bufferOf({ dmx: { 0: [1] } }, 5)).toEqual([1])
        expect(() => bufferOf({ dmx: { 0: [1], 1: [2] } }, 5)).toThrow()
    })
})

describe('laser-axis-loop run (fake desk, nothing real)', () => {
    const fakeDesk = (failAt = null) => {
        const buf = Array.from({ length: 40 }, (_, i) => i + 1)   // the bytes "found"
        const original = buf.slice()
        let posts = 0
        return {
            buf, original,
            read: async () => buf.slice(),
            post: async (chs) => { posts++; if (failAt && posts === failAt) throw new Error('boom'); for (const [c, v] of chs) buf[c - 1] = v },
        }
    }
    const run = (d, over = {}) => {
        let t = 0
        return runLoop(planOf({ ...ARGS, seconds: '3', steps: '2', 'step-ms': '100', open: '1=250,2=0', 'other-dimmer': '30', ...over }), { read: d.read, post: d.post, sleep: async (ms) => { t += ms }, now: () => t })
    }
    it('puts every touched channel back to the bytes found', async () => {
        const d = fakeDesk()
        const r = await run(d)
        expect(r.cycles).toBeGreaterThan(0)
        expect(r.restored).toBe(true)
        expect(d.buf).toEqual(d.original)
    })
    it('restores when a write fails mid-run', async () => {
        const d = fakeDesk(5)
        await expect(run(d)).rejects.toThrow('boom')
        expect(d.buf).toEqual(d.original)
    })
    it('restores when aborted', async () => {
        const d = fakeDesk()
        let n = 0
        const r = await runLoop(planOf({ ...ARGS, seconds: '60', steps: '2' }), { read: d.read, post: d.post, sleep: async () => {}, now: () => 0, isAborted: () => ++n > 7 })
        expect(r.restored).toBe(true)
        expect(d.buf).toEqual(d.original)
    })
    it('main without --send is a dry run: no fetch at all', async () => {
        const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network used') })
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})
        const code = await loopMain(Object.entries(ARGS).flatMap(([k, v]) => [`--${k}`, v]))
        expect(code).toBe(0)
        expect(f).not.toHaveBeenCalled()
        expect(log.mock.calls.join('\n')).toContain('dry run')
        f.mockRestore(); log.mockRestore()
    })
})

describe('wire-log (read-only)', () => {
    it('windows a buffer and logs only changes', () => {
        const body = { dmx: { 1: [0, 1, 2, 3, 4] } }
        expect(windowOf(body, 1, 2, 3)).toEqual([1, 2, 3])
        expect(windowOf(body, 1, 4, 3)).toBeNull()
        expect(windowOf(body, 0, 1, 1)).toBeNull()
        const log = makeChangeLogger(() => new Date('2026-01-01T00:00:00Z'))
        expect(log([1, 2])).toBe('2026-01-01T00:00:00.000Z 1,2')
        expect(log([1, 2])).toBeNull()
        expect(log([1, 3])).toContain('1,3')
    })
    it('only GETs the desk /dmx and prints changes', async () => {
        const calls = []
        let now = 0
        const bodies = [[5, 6], [5, 6], [7, 6]]
        const out = []
        await logMain(['--desk', 'http://x/api/', '--universe', '0', '--first', '1', '--count', '2', '--seconds', '1', '--interval-ms', '300'], {
            fetchImpl: async (u, o) => { calls.push([u, o?.method || 'GET']); return { json: async () => ({ dmx: { 0: bodies[Math.min(calls.length - 1, 2)] } }) } },
            out: (l) => out.push(l), sleep: async (ms) => { now += ms }, now: () => new Date(1e12 + now),
        })
        expect(calls.every(([u, m]) => u === 'http://x/api/dmx' && m === 'GET')).toBe(true)
        expect(out.map((l) => l.split(' ')[1])).toEqual(['5,6', '7,6'])
    })
})

describe('browser-lamp-lit pure parts', () => {
    it('edits one channel of one universe in an answer, leaves anything else alone', () => {
        const t = JSON.stringify({ dmx: { 1: [0, 0, 0], 0: [9, 9] } })
        const r = editDmxBody(t, { universe: 1, channel: 2, value: 255 })
        expect(r.edited).toBe(true)
        expect(JSON.parse(r.text).dmx).toEqual({ 1: [0, 255, 0], 0: [9, 9] })
        expect(editDmxBody(t, { universe: 1, channel: 9, value: 1 }).edited).toBe(false)
        expect(editDmxBody('not json', { universe: 1, channel: 1, value: 1 })).toEqual({ text: 'not json', edited: false })
    })
    it('the injected script is valid JS and only touches the dmx stream', () => {
        expect(() => new Function(noStreamSource())).not.toThrow()
        expect(noStreamSource()).toContain('/light/api/dmx/stream')
    })
    it('refuses to start without a CDP url or flags (exit 2, no network)', () => {
        const r = spawnSync('node', [path.join(here, 'browser-lamp-lit.cjs'), '--desk', 'http://x'], { env: { ...process.env, DI_TEST_CDP: '' }, encoding: 'utf8' })
        expect(r.status).toBe(2)
        expect(r.stderr).toContain('required')
    })
})

describe('wire_match.py', () => {
    it('passes its own unit tests (pure parts)', () => {
        const r = spawnSync('python3', ['-B', path.join(here, 'wire_match_test.py')], { encoding: 'utf8' })
        expect(r.stderr).toContain('OK')
        expect(r.status).toBe(0)
    })
})
