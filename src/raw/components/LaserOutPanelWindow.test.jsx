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
