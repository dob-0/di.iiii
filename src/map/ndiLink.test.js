import { afterEach, describe, expect, it, vi } from 'vitest'
import { NDI_NOT_HERE, fetchNdiScan, ndiApiUrl, ndiScanLine, ndiStreamUrl, ndiTrouble, presentNdiSources, probeNdi, watchNdiScan } from './ndiLink.js'

// The one wire to the NDI® receiver on this machine. Nothing here needs a
// runtime — CI has none and neither does aylmo — so every answer is a fake
// `fetch`, which is also the only way to state the hosted case at all.

const answer = (body, { ok = true, json = true, status = 200 } = {}) => ({
    ok,
    status,
    headers: { get: (key) => (key.toLowerCase() === 'content-type' && json ? 'application/json; charset=utf-8' : 'text/html') },
    json: async () => body
})

const route = (byPath) => vi.fn(async (url) => {
    for (const [fragment, response] of Object.entries(byPath)) {
        if (url.includes(fragment)) return response
    }
    throw new Error(`nothing mocked for ${url}`)
})

describe('where the receiver is', () => {
    it('addresses this page’s own server, never a named host', () => {
        // The receiver is on the machine that DRAWS. Reaching across to
        // another one would make the wall depend on a rig that is usually
        // absent — and would be a connect-anywhere relay besides.
        expect(ndiApiUrl('api/summary')).toBe('http://localhost:3000/ndi/api/summary')
        expect(ndiStreamUrl({ name: 'AYLMO (td_out_windows)', maxWidth: 1280 }))
            .toBe('http://localhost:3000/ndi/in.mjpg?name=AYLMO+%28td_out_windows%29&w=1280')
    })

    it('leaves the width off when it is not a width', () => {
        // The route answers 400 to anything outside 16–4096, and a 400 would
        // reach the surface as "no picture" with nothing to say about why.
        expect(ndiStreamUrl({ name: 'td', maxWidth: 0 })).not.toContain('w=')
        expect(ndiStreamUrl({ name: 'td', maxWidth: 9000 })).not.toContain('w=')
        expect(ndiStreamUrl({ name: 'td', maxWidth: 4 })).not.toContain('w=')
    })
})

describe('is there a receiver here at all', () => {
    it('believes a 200 only when it is really JSON', async () => {
        // THE TRAP THIS EXISTS FOR: a hosted tier serves the app's own
        // index.html for every address it does not know. The lighting desk
        // grew a Light link to a desk that was not there, exactly this way.
        const call = route({ 'api/summary': answer('<!doctype html>', { json: false }) })
        expect(await probeNdi({ fetchImpl: call })).toEqual({ here: false, available: false, reason: '', how: '' })
    })

    it('reads a 404 as "not here", not as an error to report', async () => {
        const call = route({ 'api/summary': answer(null, { ok: false, status: 404 }) })
        expect((await probeNdi({ fetchImpl: call })).here).toBe(false)
    })

    it('carries the server’s reason and its one line on fixing it', async () => {
        const call = route({
            'api/summary': answer({ available: false, reason: 'not-installed', how: 'install the NDI Runtime from ndi.video' })
        })
        expect(await probeNdi({ fetchImpl: call }))
            .toEqual({ here: true, available: false, reason: 'not-installed', how: 'install the NDI Runtime from ndi.video' })
    })

    it('never throws when there is no server to ask', async () => {
        const call = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        expect((await probeNdi({ fetchImpl: call })).here).toBe(false)
    })
})

describe('why there is no picture', () => {
    it('settles on a hosted di.iiii — asking again cannot change it', async () => {
        const call = route({ 'api/summary': answer(null, { ok: false, status: 404 }) })
        expect(await ndiTrouble({ name: 'td_out', fetchImpl: call }))
            .toEqual({ ready: false, settled: true, detail: NDI_NOT_HERE })
    })

    it('says the runtime is missing, in the server’s own words', async () => {
        const call = route({
            'api/summary': answer({ available: false, reason: 'no-koffi', how: 'run npm install in serverXR to get the FFI' })
        })
        expect(await ndiTrouble({ name: 'td_out', fetchImpl: call })).toEqual({
            ready: false,
            settled: false,
            detail: 'NDI is not installed on this machine — run npm install in serverXR to get the FFI'
        })
    })

    it('still says the runtime is missing when the server offers no how', async () => {
        const call = route({ 'api/summary': answer({ available: false, reason: 'load-failed' }) })
        expect((await ndiTrouble({ name: 'td', fetchImpl: call })).detail).toBe('NDI is not installed on this machine')
    })

    it('says the network has nothing by that name, and lets the picture be asked for anyway', async () => {
        const call = route({
            'api/summary': answer({ available: true, version: 'NDI 6.3.2.0' }),
            'api/sources': answer({ available: true, sources: [{ name: 'WIN (OBS)', address: '10.0.0.3:5961' }] })
        })
        // `ready` stays true: the runtime is here, so the <img> may keep
        // asking — a sender started after the page must not need a reload.
        expect(await ndiTrouble({ name: 'td_out', fetchImpl: call }))
            .toEqual({ ready: true, settled: false, detail: 'no NDI source called “td_out” on this network' })
    })

    it('matches a fragment the way the server does, so the desk and the wall agree', async () => {
        const call = route({
            'api/summary': answer({ available: true }),
            'api/sources': answer({ available: true, sources: [{ name: 'AYLMO (td_out_windows)', address: '10.0.0.2:5961' }] }),
            'api/stats': answer({ receivers: [] })
        })
        // "td_out" resolves — so the answer is about the receiver, not the name.
        expect((await ndiTrouble({ name: 'td_out', fetchImpl: call })).detail).toBe('looking for “td_out”…')
    })

    it('hands over the receiver’s own detail once a source resolved', async () => {
        // Step 1 made the receiver name the address it dialled and say whether
        // the session was ever opened — two different jobs at the rig. That
        // sentence goes to the surface verbatim.
        const detail = 'connected to "AYLMO (td_out_windows)" at 192.168.15.53:5961 but no picture in 8 s'
        const call = route({
            'api/summary': answer({ available: true }),
            'api/sources': answer({ available: true, sources: [{ name: 'AYLMO (td_out_windows)' }] }),
            'api/stats': answer({ receivers: [{ name: 'td_out', state: 'connecting', detail }] })
        })
        expect(await ndiTrouble({ name: 'td_out', fetchImpl: call })).toEqual({ ready: true, settled: false, detail })
    })
})

// The autoscan, as a page reads it (serverXR keeps the finder; the page only listens).
describe('the autoscan, from a page', () => {
    const RUNNING = {
        state: 'running', count: 1, reason: null, how: null,
        sources: [
            { name: 'AYLMO (td_out)', address: '10.0.0.2:5961', present: true, firstSeen: 1, lastSeen: 2, goneSince: null },
            { name: 'WIN (OBS)', address: '10.0.0.3:5962', present: false, firstSeen: 1, lastSeen: 1, goneSince: 2 }
        ]
    }

    // A stand-in EventSource: records every one opened, and can be made to speak.
    class FakeEventSource {
        static opened = []
        constructor(url) { this.url = url; this.readyState = 0; this.handlers = {}; this.closed = false; FakeEventSource.opened.push(this) }
        addEventListener(type, fn) { this.handlers[type] = fn }
        close() { this.closed = true; this.readyState = 2 }
        speak(scan) { this.handlers.scan?.({ data: JSON.stringify(scan) }) }
    }

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    afterEach(() => { vi.unstubAllGlobals(); FakeEventSource.opened = [] })

    it('fetchNdiScan: null where the server has no /ndi, the snapshot where it does', async () => {
        expect(await fetchNdiScan({ fetchImpl: route({ 'api/scan': answer('<!doctype html>', { json: false }) }) })).toBe(null)
        expect(await fetchNdiScan({ fetchImpl: route({ 'api/scan': answer(null, { ok: false, status: 404 }) }) })).toBe(null)
        expect(await fetchNdiScan({ fetchImpl: route({ 'api/scan': answer(RUNNING) }) })).toEqual(RUNNING)
    })

    it('presentNdiSources: only what is on the network now', () => {
        expect(presentNdiSources(RUNNING)).toEqual([{ name: 'AYLMO (td_out)', address: '10.0.0.2:5961' }])
        expect(presentNdiSources(null)).toEqual([])
    })

    // The honesty rule: a machine that cannot look never shows "0".
    it('ndiScanLine: a count only when the server is looking', () => {
        expect(ndiScanLine(RUNNING)).toBe('NDI on the network: 1')
        expect(ndiScanLine({ state: 'running', count: 0, sources: [] })).toBe('NDI on the network: 0')
        expect(ndiScanLine({ state: 'starting', count: null })).toBe('NDI on the network: looking…')
        const none = ndiScanLine({ state: 'no-runtime', count: null, how: 'di ndi get' })
        expect(none).toMatch(/unknown/)
        expect(none).toMatch(/di ndi get/)
        expect(none).not.toMatch(/: 0/)
        expect(ndiScanLine({ state: 'error', reason: 'load-failed', count: null })).toMatch(/unknown — load-failed/)
        expect(ndiScanLine(null)).toBe('')
        expect(ndiScanLine({ state: 'off' })).toBe('')
    })

    it('watchNdiScan on a hosted tier: one null, and no feed is ever opened', async () => {
        vi.stubGlobal('fetch', route({ 'api/scan': answer(null, { ok: false, status: 404 }) }))
        vi.stubGlobal('EventSource', FakeEventSource)
        const heard = []
        const stop = watchNdiScan((scan) => heard.push(scan))
        await flush(); await flush()
        expect(FakeEventSource.opened).toHaveLength(0)
        expect(heard.every((scan) => scan === null)).toBe(true)
        stop()
    })

    it('watchNdiScan on a local install: the snapshot, then every pushed change — one feed for many listeners', async () => {
        vi.stubGlobal('fetch', route({ 'api/scan': answer({ ...RUNNING, count: 0, sources: [] }) }))
        vi.stubGlobal('EventSource', FakeEventSource)
        const a = []
        const b = []
        const stopA = watchNdiScan((scan) => a.push(scan))
        const stopB = watchNdiScan((scan) => b.push(scan))
        await flush(); await flush()
        expect(FakeEventSource.opened).toHaveLength(1)
        expect(FakeEventSource.opened[0].url).toBe('http://localhost:3000/ndi/api/scan/events')
        FakeEventSource.opened[0].speak(RUNNING)
        expect(a.at(-1)).toEqual(RUNNING)
        expect(b.at(-1)).toEqual(RUNNING)
        stopA()
        expect(FakeEventSource.opened[0].closed).toBe(false)
        stopB()
        expect(FakeEventSource.opened[0].closed).toBe(true)
    })

    it('watchNdiScan in poll mode holds no connection open', async () => {
        vi.stubGlobal('fetch', route({ 'api/scan': answer(RUNNING) }))
        vi.stubGlobal('EventSource', FakeEventSource)
        const heard = []
        const stop = watchNdiScan((scan) => heard.push(scan), { mode: 'poll' })
        await flush(); await flush()
        expect(heard.at(-1)).toEqual(RUNNING)
        expect(FakeEventSource.opened).toHaveLength(0)
        stop()
    })
})
