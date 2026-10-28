import { describe, expect, it, vi } from 'vitest'
import {
    BRIDGE_STATUS,
    NO_BRIDGE_TEXT,
    deskUniverseOf,
    dmxChannelOf,
    dmxInStateText,
    firstValue,
    levelOf,
    oscApiBase,
    oscArgsOf,
    readDeskInputLevels,
    readOscIn,
    sendOsc,
} from './oscBridgeClient.js'
import { DESK_STATUS } from './dmxRigClient.js'

const jsonRes = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => body,
})
const htmlRes = () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => { throw new Error('html') } })

describe('oscApiBase', () => {
    it('sits beside the app at /osc/api and moves with a base path', () => {
        expect(oscApiBase('http://diiii.localhost', '')).toBe('http://diiii.localhost/osc/api')
        expect(oscApiBase('http://diiii.localhost', '/sub')).toBe('http://diiii.localhost/sub/osc/api')
    })
})

describe('readOscIn', () => {
    it('reads messages, seq and bind from the bridge', async () => {
        const fetchImpl = vi.fn(async () => jsonRes({ ok: true, seq: 4, bind: '127.0.0.1', missed: 0, messages: [{ seq: 4, address: '/a', args: [{ type: 'f', value: 1 }] }] }))
        const r = await readOscIn('http://x/osc/api', { port: 8000, pattern: '/a', since: 3 }, { fetchImpl })
        expect(r).toMatchObject({ status: BRIDGE_STATUS.ANSWERING, seq: 4, bind: '127.0.0.1' })
        expect(r.messages[0].address).toBe('/a')
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ port: 8000, pattern: '/a', since: 3 })
    })
    it('a 404 and an index.html answer both mean no local bridge', async () => {
        expect((await readOscIn('b', { port: 8000 }, { fetchImpl: async () => jsonRes({}, 404) })).status).toBe(BRIDGE_STATUS.ABSENT)
        expect((await readOscIn('b', { port: 8000 }, { fetchImpl: async () => htmlRes() })).status).toBe(BRIDGE_STATUS.ABSENT)
    })
    it('a port the bridge could not open is refused with its reason', async () => {
        const r = await readOscIn('b', { port: 8000 }, { fetchImpl: async () => jsonRes({ ok: false, error: 'port 8000 is already taken by another program on this machine' }) })
        expect(r).toMatchObject({ status: BRIDGE_STATUS.REFUSED, error: expect.stringMatching(/already taken/) })
    })
    it('a refused connection is unreachable', async () => {
        expect((await readOscIn('b', { port: 8000 }, { fetchImpl: async () => { throw new TypeError('fetch failed') } })).status).toBe(BRIDGE_STATUS.UNREACHABLE)
    })
})

describe('sendOsc', () => {
    it('reports where it went, or the bridge\'s reason', async () => {
        expect(await sendOsc('b', { host: '127.0.0.1', port: 9000, address: '/x', args: [1] }, { fetchImpl: async () => jsonRes({ ok: true, to: '127.0.0.1:9000' }) }))
            .toEqual({ ok: true, status: BRIDGE_STATUS.ANSWERING, to: '127.0.0.1:9000' })
        expect(await sendOsc('b', { host: '8.8.8.8', port: 9000, address: '/x' }, { fetchImpl: async () => jsonRes({ ok: false, error: '8.8.8.8 is not on this machine or a private network' }, 400) }))
            .toMatchObject({ ok: false, status: BRIDGE_STATUS.REFUSED, error: expect.stringMatching(/private network/) })
    })
})

describe('values and arguments', () => {
    it('turns a graph value into OSC arguments', () => {
        expect(oscArgsOf(undefined)).toEqual([])
        expect(oscArgsOf(null)).toEqual([])
        expect(oscArgsOf(0.5)).toEqual([0.5])
        expect(oscArgsOf([1, 2, 3])).toEqual([1, 2, 3])
        expect(oscArgsOf('go')).toEqual(['go'])
        expect(oscArgsOf(true)).toEqual([true])
        expect(oscArgsOf(NaN)).toEqual([null])
        expect(oscArgsOf({ a: 1 })).toEqual(['{"a":1}'])
    })
    it('takes the first argument of a message as the value', () => {
        expect(firstValue({ args: [{ type: 'i', value: 3 }, { type: 's', value: 'x' }] })).toBe(3)
        expect(firstValue({ args: [] })).toBe(null)
        expect(firstValue({ args: [{ type: 'T', value: true }] })).toBe(true)
    })
})

describe('DMX In helpers', () => {
    it('counts universes from 1 for people and from 0 for the desk', () => {
        expect(deskUniverseOf(1)).toBe(0)
        expect(deskUniverseOf(3)).toBe(2)
        expect(deskUniverseOf(0)).toBe(0)
        expect(dmxChannelOf(0)).toBe(1)
        expect(dmxChannelOf(600)).toBe(512)
    })
    it('reads a channel as 0..1', () => {
        const levels = new Array(512).fill(0); levels[0] = 255; levels[9] = 51
        expect(levelOf(levels, 1)).toBe(1)
        expect(levelOf(levels, 10)).toBeCloseTo(0.2, 6)
        expect(levelOf(null, 1)).toBe(null)
    })
    it('reads the desk\'s levels route and refuses an answer that is not one', async () => {
        const fetchImpl = vi.fn(async () => jsonRes({ universe: 0, state: 'live', levels: [10], ageMs: 5 }))
        expect(await readDeskInputLevels('http://x/light/api', 0, { fetchImpl })).toMatchObject({ status: DESK_STATUS.ANSWERING, state: 'live', levels: [10] })
        expect(fetchImpl.mock.calls[0][0]).toBe('http://x/light/api/input/levels?universe=0')
        expect((await readDeskInputLevels('b', 0, { fetchImpl: async () => jsonRes({ fixtures: 3 }) })).status).toBe(DESK_STATUS.UNREACHABLE)
        expect((await readDeskInputLevels('b', 0, { fetchImpl: async () => jsonRes({}, 404) })).status).toBe(DESK_STATUS.ABSENT)
    })
    it('says each input state in words', () => {
        expect(dmxInStateText({ state: 'off', universe: 1, channel: 1 })).toMatch(/input is off/)
        expect(dmxInStateText({ state: 'not-listened', universe: 2, channel: 1 })).toMatch(/does not listen to universe 2/)
        expect(dmxInStateText({ state: 'live', universe: 1, channel: 5, value: 0.5 })).toBe('universe 1, channel 5: 128 (50%)')
        expect(dmxInStateText({ state: 'lost', universe: 1, channel: 5, held: 0.25 })).toMatch(/holding the last value, 25%/)
        expect(dmxInStateText({ state: 'lost', universe: 1, channel: 5, held: null })).toMatch(/nothing to hold/)
    })
    it('names the missing bridge plainly', () => {
        expect(NO_BRIDGE_TEXT).toMatch(/No local bridge/)
    })
})
