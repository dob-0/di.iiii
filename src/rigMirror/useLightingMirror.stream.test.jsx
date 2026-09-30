import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DMX_POLL_MS, createLightingMirror, streamStats } from './useLightingMirror.js'

// THE STREAM (RIG_BUILD.md §19.5): the mirror listens to the desk's pushed frames where
// the browser has EventSource, falls back to the 10 Hz poll when a stream never opens,
// and survives a reconnect. A fake EventSource stands in for the browser's.

const json = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body })
const PATCH = {
    fixtures: [{ id: 'fx_a', index: 1, name: 'Head', profile: 'ptd', universe: 0, address: 1 }],
    profiles: { ptd: { channels: ['pan', 'tilt', 'dimmer'] } },
    roleKinds: { emitter: ['r', 'g', 'b'] }
}

class FakeES {
    static all = []
    constructor(url) { this.url = url; this.readyState = 0; this.listeners = {}; FakeES.all.push(this) }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
    emit(type, data) { for (const fn of this.listeners[type] || []) fn(data === undefined ? {} : { data: JSON.stringify(data) }) }
    open() { this.readyState = 1; this.emit('open') }
    close() { this.readyState = 2; this.closed = true }
}

const fetchImpl = vi.fn(async (url) => {
    const u = String(url)
    if (u.endsWith('/light/api/summary')) return json({ master: 255 })
    if (u.endsWith('/light/api/state')) return json(PATCH)
    if (u.endsWith('/light/api/dmx')) return json({ dmx: { 0: [10, 20, 30] }, master: 255, blackout: false })
    return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}) }
})

const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('the lighting mirror — the pushed stream', () => {
    beforeEach(() => { vi.useFakeTimers(); FakeES.all = []; fetchImpl.mockClear() })
    afterEach(() => { vi.useRealTimers() })

    it('streams instead of polling, applies key + delta frames, and hands each fixture its own slots', async () => {
        const mirror = createLightingMirror({ fetchImpl, EventSourceImpl: FakeES, doc: null })
        await mirror.probe()
        const release = mirror.watch()
        await settle(0)
        expect(FakeES.all).toHaveLength(1)
        expect(FakeES.all[0].url).toMatch(/\/light\/api\/dmx\/stream$/)
        const es = FakeES.all[0]
        es.open()
        const key = new Array(512).fill(0); key[0] = 128; key[1] = 64; key[2] = 255
        es.emit('frame', { s: 1, t: 1000, k: 1, d: [[0, 0, key]], m: { master: 255, blackout: false, looks: [{ lookId: 'rig-a', level: 1, priority: 0, fadeMs: 2000, firedAt: 400, from: 'rig-b' }], cues: null } })
        await settle(20)
        let s = mirror.getSnapshot()
        expect(s.fixtures[0].values).toEqual([128, 64, 255])
        expect(s.looks).toEqual(['rig-a'])
        expect(s.lookFade).toMatchObject({ lookId: 'rig-a', from: 'rig-b', fadeMs: 2000 })
        es.emit('frame', { s: 2, t: 1025, k: 0, d: [[0, 1, [99]]] })
        await settle(20)
        s = mirror.getSnapshot()
        expect(s.fixtures[0].values).toEqual([128, 99, 255])
        expect(s.looks).toEqual(['rig-a'], 'a delta without meta keeps the looks')
        // no poll of api/dmx while streaming
        await settle(DMX_POLL_MS * 5)
        expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/light/api/dmx'))).toHaveLength(0)
        expect(streamStats.last.s).toBe(2)
        release()
        expect(es.closed).toBe(true)
        mirror.dispose()
    })

    it('coalesces a burst of desk frames into one publish per screen frame', async () => {
        const mirror = createLightingMirror({ fetchImpl, EventSourceImpl: FakeES, doc: null })
        await mirror.probe()
        const release = mirror.watch()
        await settle(0)
        const es = FakeES.all[0]
        es.open()
        const seen = vi.fn()
        mirror.subscribe(seen)
        es.emit('frame', { s: 1, t: 1, k: 1, d: [[0, 0, new Array(512).fill(0)]], m: { master: 255, blackout: false, looks: [], cues: null } })
        for (let i = 1; i <= 5; i++) es.emit('frame', { s: 1 + i, t: 1 + i, k: 0, d: [[0, 2, [i * 10]]] })
        await settle(20)
        expect(mirror.getSnapshot().fixtures[0].values[2]).toBe(50)
        expect(seen.mock.calls.length).toBeLessThanOrEqual(2)
        release(); mirror.dispose()
    })

    it('a stream that never opens falls back to the 10 Hz poll', async () => {
        const mirror = createLightingMirror({ fetchImpl, EventSourceImpl: FakeES, doc: null })
        await mirror.probe()
        const release = mirror.watch()
        await settle(0)
        FakeES.all[0].emit('error')
        await settle(DMX_POLL_MS * 3 + 5)
        expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/light/api/dmx')).length).toBeGreaterThanOrEqual(3)
        expect(mirror.getSnapshot().fixtures[0].values).toEqual([10, 20, 30])
        release(); mirror.dispose()
    })

    it('a dropped stream that the browser re-opens carries on (key frame again); five errors in a row = the desk is gone', async () => {
        const mirror = createLightingMirror({ fetchImpl, EventSourceImpl: FakeES, doc: null })
        await mirror.probe()
        const release = mirror.watch()
        await settle(0)
        const es = FakeES.all[0]
        es.open()
        es.emit('error') // the browser reconnects by itself (readyState 0)
        es.open()
        const key = new Array(512).fill(0); key[0] = 7
        es.emit('frame', { s: 1, t: 5, k: 1, d: [[0, 0, key]], m: { master: 255, blackout: false, looks: [], cues: null } })
        await settle(20)
        expect(mirror.getSnapshot().present).toBe(true)
        expect(mirror.getSnapshot().fixtures[0].values[0]).toBe(7)
        for (let i = 0; i < 5; i++) es.emit('error')
        await settle(0)
        expect(es.closed).toBe(true)
        expect(mirror.getSnapshot().present).toBe(false)
        release(); mirror.dispose()
    })
})
