import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LaserOutPanelWindow from './LaserOutPanelWindow.jsx'

const ORIGIN = 'http://localhost:5173'
const node = { id: 'laser-1', typeId: 'device.laser.out', values: {} }
const frameOf = (x) => ({ kind: 'laser', points: [[x, 0, 1, 0, 0], [x, 0.5, 1, 0, 0], [0, 0, 0, 0, 0], [-x, 0.5, 0, 1, 0]] })

const json = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
})

// The laser server is faked at the fetch boundary: state answers, posts are recorded.
const fakeServer = ({ state = { armed: true, sim: false, cubes: [{ id: 'a', connected: true }, { id: 'b', connected: false }] }, stateResponse } = {}) => {
    const posts = []
    const fetchImpl = vi.fn(async (url, options) => {
        if (String(url).endsWith('/laser/api/state')) return stateResponse ? stateResponse() : json(state)
        posts.push({ url: String(url), body: JSON.parse(options.body) })
        return json({ ok: true })
    })
    return { fetchImpl, posts }
}
const frames = (posts) => posts.filter((p) => p.url.endsWith('/laser/api/frame'))
const blackouts = (posts) => posts.filter((p) => p.url.endsWith('/laser/api/blackout'))
const alives = (posts) => posts.filter((p) => p.url.endsWith('/laser/api/alive'))

const panel = (props) => <LaserOutPanelWindow node={node} pageOrigin={ORIGIN} {...props} />

describe('LaserOutPanelWindow', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
    afterEach(() => { vi.useRealTimers() })

    it('sends a frame to all cubes once, and not again while it stays the same', async () => {
        const { fetchImpl, posts } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: frameOf(0.5) } }))
        expect(frames(posts)).toHaveLength(1)
        expect(frames(posts)[0].url).toBe(`${ORIGIN}/laser/api/frame`)
        expect(frames(posts)[0].body.cube).toBe('all')
        expect(frames(posts)[0].body.points).toHaveLength(4)
        // A new object with the same points: nothing to say.
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.5) } }))
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(frames(posts)).toHaveLength(1)
        // A different shape goes out, and so does a different cube.
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.25), cube: 'cube-2' } }))
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(frames(posts).length).toBeGreaterThan(1)
        expect(frames(posts).at(-1).body.cube).toBe('cube-2')
    })

    it('throttles to one frame per 40 ms, the latest winning', async () => {
        const { fetchImpl, posts } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: frameOf(0.1) } }))
        for (const x of [0.2, 0.3, 0.4]) view.rerender(panel({ fetchImpl, values: { frame: frameOf(x) } }))
        expect(frames(posts)).toHaveLength(1)
        await act(async () => { await vi.advanceTimersByTimeAsync(60) })
        expect(frames(posts)).toHaveLength(2)
        expect(frames(posts)[1].body.points[0][0]).toBe(0.4)
    })

    it('sends nothing for an empty frame', async () => {
        const { fetchImpl, posts } = fakeServer()
        render(panel({ fetchImpl, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(frames(posts)).toHaveLength(0)
    })

    it('blackout posts at once on the rising edge, once, and cancels the queued frame', async () => {
        const { fetchImpl, posts } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: frameOf(0.1), blackout: 0 } }))
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.2), blackout: 0 } }))
        const before = frames(posts).length
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.3), blackout: 1 } }))
        expect(blackouts(posts)).toHaveLength(1)
        expect(blackouts(posts)[0].body).toEqual({})
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.4), blackout: 1 } }))
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(blackouts(posts)).toHaveLength(1)
        expect(frames(posts)).toHaveLength(before)
    })

    it('keeps a held frame alive every 50 ms — for its cube, without the points — and stops on blackout', async () => {
        const { fetchImpl, posts } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: frameOf(0.5), cube: 'cube-3' } }))
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(alives(posts)).toHaveLength(4)
        expect(alives(posts)[0].body).toEqual({ cube: 'cube-3' })
        expect(frames(posts)).toHaveLength(1)
        view.rerender(panel({ fetchImpl, values: { frame: frameOf(0.5), cube: 'cube-3', blackout: 1 } }))
        const held = alives(posts).length
        await act(async () => { await vi.advanceTimersByTimeAsync(500) })
        expect(alives(posts)).toHaveLength(held)
        view.unmount()
    })

    it('keeps nothing alive with no frame', async () => {
        const { fetchImpl, posts } = fakeServer()
        render(panel({ fetchImpl, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(500) })
        expect(alives(posts)).toHaveLength(0)
    })

    it('shows each cube: what it is doing, its info, a stop and a cold cube in plain words', async () => {
        const info = { modelName: 'LaserCube 2W', modelNumber: 3, firmware: '1.7', dacRate: 30000, maxDacRate: 35000, rxBufferFree: 5800, rxBufferSize: 6000, temperature: 31, connectionType: 'Ethernet', ip: '10.0.0.51', serial: 'deadbeef0042', outputEnabled: true }
        const state = {
            armed: true,
            sim: false,
            guard: { frameTimeoutMs: 200, stillHoldMs: 200, validated: false },
            cubes: [
                { id: 'cube-1', name: 'Cube 1', ip: '10.0.0.51', connected: true, armed: true, info, stop: null },
                { id: 'cube-2', name: 'Cube 2', ip: '10.0.0.52', connected: true, armed: true, info: { ...info, ip: '10.0.0.52', temperature: 4 }, stop: { reason: 'no-frame', text: 'stopped: no frame for 200 ms' } },
                { id: 'cube-3', name: 'Cube 3', ip: '10.0.0.53', connected: false, armed: false, info: null, stop: { reason: 'no-info', text: 'not armed: the cube never answered the info question' } },
            ],
        }
        const { fetchImpl } = fakeServer({ state })
        const view = render(panel({ fetchImpl, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        const items = [...view.container.querySelectorAll('.raw-laser-panel-cubes li')].map((li) => li.textContent)
        expect(items[0]).toContain('Cube 1 (cube-1): armed')
        expect(items[0]).toContain('LaserCube 2W model 3 · firmware 1.7 · 30\u202f000 of 35\u202f000 points/s · buffer 5\u202f800 free of 6\u202f000 · 31 °C · Ethernet · 10.0.0.51 · serial deadbeef0042 · output on')
        expect(items[1]).toContain('stopped: no frame for 200 ms')
        expect(items[1]).toContain("4 °C — under the maker's 10 °C floor")
        expect(items[2]).toContain('not armed: the cube never answered the info question')
        expect(items[2]).toContain('at 10.0.0.53')
        expect(view.container.querySelectorAll('.raw-laser-panel-cube-warn')).toHaveLength(2)
        expect(view.getByText(/not yet tested on a real cube/)).toBeTruthy()
    })

    it('shows DISARMED, the cube count and the status string from the server state', async () => {
        const { fetchImpl } = fakeServer({ state: { armed: false, sim: true, cubes: [{ id: 'a', connected: true }, { id: 'b', connected: false }] } })
        const onStatus = vi.fn()
        const view = render(panel({ fetchImpl, onStatus, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(view.getByText('DISARMED')).toBeTruthy()
        expect(view.getByText(/Lasers off — disarmed on the server/)).toBeTruthy()
        expect(view.getByText(/2 cubes, 1 connected, simulated/)).toBeTruthy()
        expect(onStatus).toHaveBeenLastCalledWith('laser-1', 'Disarmed — lasers off: 2 cubes, 1 connected, simulated')
    })

    it('shows ARMED when the server is armed, and polls every 3 seconds', async () => {
        const { fetchImpl } = fakeServer()
        const view = render(panel({ fetchImpl, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(view.getByText('ARMED')).toBeTruthy()
        const polls = () => fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/state')).length
        const first = polls()
        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        expect(polls()).toBe(first + 1)
    })

    it('reads a missing server, a non-JSON answer and a 403 plainly', async () => {
        const absent = vi.fn()
        render(panel({ fetchImpl: fakeServer({ stateResponse: () => ({ ok: false, status: 404 }) }).fetchImpl, onStatus: absent, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(absent).toHaveBeenLastCalledWith('laser-1', expect.stringContaining('local di.iiii'))

        const html = vi.fn()
        render(panel({ fetchImpl: fakeServer({ stateResponse: () => ({ ok: true, status: 200, headers: { get: () => 'text/html' } }) }).fetchImpl, onStatus: html, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(html).toHaveBeenLastCalledWith('laser-1', expect.stringContaining('local di.iiii'))

        const forbidden = vi.fn()
        render(panel({ fetchImpl: fakeServer({ stateResponse: () => ({ ok: false, status: 403 }) }).fetchImpl, onStatus: forbidden, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(forbidden).toHaveBeenLastCalledWith('laser-1', expect.stringContaining('its own machine only'))

        const down = vi.fn()
        render(panel({ fetchImpl: vi.fn(async () => { throw new TypeError('unreachable') }), onStatus: down, values: {} }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(down).toHaveBeenLastCalledWith('laser-1', 'No answer from the laser server')
    })

    it('clears its status when it unmounts', async () => {
        const { fetchImpl } = fakeServer()
        const onStatus = vi.fn()
        const view = render(panel({ fetchImpl, onStatus, values: {} }))
        view.unmount()
        expect(onStatus).toHaveBeenLastCalledWith('laser-1', null)
    })
})

describe('LaserOutPanelWindow preview', () => {
    const calls = []
    let getContext
    beforeEach(() => {
        calls.length = 0
        const ctx = {
            fillRect: () => calls.push(['clear']),
            beginPath: () => {},
            stroke: () => calls.push(['stroke', ctx.strokeStyle]),
            moveTo: (x, y) => calls.push(['move', x, y]),
            lineTo: (x, y) => calls.push(['line', x, y]),
        }
        getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    })
    afterEach(() => getContext.mockRestore())

    it('renders a canvas and draws lit segments in their colour, skipping blank moves', async () => {
        const { fetchImpl } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: frameOf(0.5) } }))
        expect(view.container.querySelector('canvas')).toBeTruthy()
        await waitFor(() => expect(calls.length).toBeGreaterThan(0))
        // The keep-in zone's edge is drawn first (a dashed line across the middle), then the shape.
        // Four points: lit, lit, blank, lit. Only the first pair is a line.
        const strokes = calls.filter((c) => c[0] === 'stroke')
        expect(strokes[0][1]).toMatch(/^rgba\(255, 90, 90/)
        expect(strokes.slice(1)).toEqual([['stroke', 'rgb(255, 0, 0)']])
        // x 0.5 of -1..1 on 240px is 180; y 0 is the middle, 120.
        expect(calls).toContainEqual(['move', 180, 120])
    })
})
