import { act, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LaserOutPanelWindow, { cubeCap } from './LaserOutPanelWindow.jsx'

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
        // Flattened to the default budget (1000 points, owner 2026-10-14), a blank point at each path's entry.
        // An old Laser shape frame with no budget set plays its own points (review of #934, finding 5).
        expect(frames(posts)[0].body.points).toHaveLength(5) // its 4 + the blank entry point
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
        // Two paths after flattening: a red line (resampled to the budget) and a green dot, drawn as a
        // dot, not a stroke. The blank move between them is not drawn.
        const strokes = calls.filter((c) => c[0] === 'stroke')
        expect(strokes[0][1]).toMatch(/^rgba\(255, 90, 90/)
        expect(new Set(strokes.slice(1).map((c) => c[1]))).toEqual(new Set(['rgb(255, 0, 0)']))
        // x 0.5 of -1..1 on 240px is 180; y 0 is the middle, 120.
        expect(calls).toContainEqual(['move', 180, 120])
    })
})

describe('LaserOutPanelWindow: the point budget (frame v2)', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
    afterEach(() => { vi.useRealTimers() })
    const v2 = { kind: 'laser', v: 2, order: 'free', paths: [{ p: [0, 0.2, 1, 0, 0, 0.5, 0.2, 1, 0, 0], closed: false }, { p: [0, 0.6, 0, 1, 0, 0.4, 0.6, 0, 1, 0], closed: false }], ms: 1.25 }

    it('sends v2 paths flattened to the wired budget, and shows the value in effect', async () => {
        const { fetchImpl, posts } = fakeServer()
        const view = render(panel({ fetchImpl, values: { frame: v2, budget: 300 } }))
        expect(frames(posts)[0].body.points).toHaveLength(300)
        expect(view.container.textContent).toContain('300 points · 2 paths · traced in 1.25 ms')
    })
    it('auto sizes the budget from the drawn length', async () => {
        const { fetchImpl, posts } = fakeServer()
        render(panel({ fetchImpl, values: { frame: v2, budget: 0 } }))
        expect(frames(posts)[0].body.points).toHaveLength(2 + Math.ceil(0.9 / 0.01))
    })
    it('clamps to what the server says the cube takes, and shows the scan rate', async () => {
        const state = { armed: false, sim: true, cubes: [{ id: 'a', connected: true, path: { budget: 400, framesPerSecond: 75 } }] }
        const { fetchImpl, posts } = fakeServer({ state })
        const view = render(panel({ fetchImpl, values: { frame: v2, budget: 1500 } }))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        await act(async () => { await vi.advanceTimersByTimeAsync(100) })
        // 400 after the guards, 25 % kept for what the guards add when the server has no plan yet.
        expect(frames(posts).at(-1).body.points).toHaveLength(300)
        expect(view.container.textContent).toContain('the cube takes 300')
        expect(view.container.textContent).toContain('scans at 75 Hz')
    })
    it('the cap: #931 path.budget first, else 67 ms at the cube\'s rate, the smallest for all', () => {
        expect(cubeCap({ cubes: [{ id: 'a', path: { budget: 900 } }, { id: 'b', info: { dacRate: 10000 } }] }, 'all')).toBe(502)
        expect(cubeCap({ cubes: [{ id: 'a', path: { budget: 900 } }] }, 'a')).toBe(675)
        // With a plan, the guards' own in/out ratio.
        expect(cubeCap({ cubes: [{ id: 'a', path: { budget: 900, pointsIn: 500, pointsOut: 800 } }] }, 'a')).toBe(562)
        expect(cubeCap({ cubes: [{ id: 'a' }] }, 'a')).toBeNull()
    })
    it('the slider and Auto write the node\'s budget', async () => {
        const { fetchImpl } = fakeServer()
        const onConfigChange = vi.fn()
        const view = render(panel({ fetchImpl, onConfigChange, values: { frame: v2, budget: 300 } }))
        const { fireEvent } = await import('@testing-library/react')
        fireEvent.change(view.getByLabelText('Points per frame'), { target: { value: '640' } })
        expect(onConfigChange).toHaveBeenLastCalledWith('laser-1', { budget: 640 })
        fireEvent.click(view.getByLabelText('Auto points'))
        expect(onConfigChange).toHaveBeenLastCalledWith('laser-1', { budget: 0 })
    })
})

// Arm / Disarm and Find cubes (2026-10-14). The server is faked at the fetch boundary.
describe('LaserOutPanelWindow arm, disarm and Find cubes', () => {
    const PHRASE = 'the words the officer agreed'
    const opsServer = ({ armed = false, find, config } = {}) => {
        const state = { armed, sim: false, cubes: [{ id: 'cube-1', name: 'Left', ip: '127.0.0.9', connected: true, info: { serial: 'deadbeef0042' } }] }
        const posts = []
        const fetchImpl = vi.fn(async (url, options) => {
            const u = String(url)
            if (u.endsWith('/laser/api/state')) return json({ ...state })
            const body = JSON.parse(options.body)
            posts.push({ url: u, body })
            if (u.endsWith('/arm')) {
                if (body.armed === false) { state.armed = false; return json({ ok: true, armed: false }) }
                if (body.confirm === PHRASE) { state.armed = true; return json({ ok: true, armed: true }) }
                return json({ ok: false, armed: false, error: 'not armed: that is not the sign-off phrase.' }, 403)
            }
            if (u.endsWith('/find')) return find ? find() : json({ ok: true, asked: 253, networks: ['192.0.2.0/24 (eth0)'], cubes: [] })
            if (u.endsWith('/config')) { state.armed = false; return config ? config(body) : json({ ok: true, disarmed: true, cubes: body.cubes.map((c, i) => ({ id: `cube-${i + 1}`, name: c.name })) }) }
            return json({ ok: true })
        })
        return { fetchImpl, posts, state }
    }
    const of = (posts, route) => posts.filter((p) => p.url.endsWith(route))

    it('starts with an empty phrase field and never shows the phrase; Arm sends what was typed', async () => {
        const { fetchImpl, posts } = opsServer()
        const view = render(panel({ fetchImpl }))
        await waitFor(() => expect(view.getByText('DISARMED')).toBeTruthy())
        const field = view.getByLabelText('Sign-off phrase')
        expect(field.value).toBe('')
        expect(field.getAttribute('autocomplete')).toBe('off')
        expect(field.getAttribute('placeholder')).toBeNull()
        expect(view.container.textContent).toMatch(/you are the laser safety officer for this run/)
        const armButton = view.getByRole('button', { name: 'Arm' })
        expect(armButton.disabled).toBe(true)
        fireEvent.change(field, { target: { value: `  ${PHRASE} ` } })
        fireEvent.click(armButton)
        await waitFor(() => expect(view.getByText('ARMED')).toBeTruthy())
        expect(of(posts, '/arm')).toEqual([{ url: `${ORIGIN}/laser/api/arm`, body: { armed: true, confirm: PHRASE } }])
    })

    it('a wrong phrase is refused in the server\'s words and the field is emptied', async () => {
        const { fetchImpl } = opsServer()
        const view = render(panel({ fetchImpl }))
        await waitFor(() => expect(view.getByText('DISARMED')).toBeTruthy())
        fireEvent.change(view.getByLabelText('Sign-off phrase'), { target: { value: 'signed off' } })
        fireEvent.click(view.getByRole('button', { name: 'Arm' }))
        await waitFor(() => expect(view.getByRole('alert').textContent).toMatch(/not the sign-off phrase/))
        expect(view.getByLabelText('Sign-off phrase').value).toBe('')
        expect(view.getByText('DISARMED')).toBeTruthy()
    })

    it('Disarm is always there and disarms with one click, no confirm', async () => {
        const { fetchImpl, posts } = opsServer({ armed: true })
        const view = render(panel({ fetchImpl }))
        // Before the server has even answered, Disarm is there.
        expect(view.getByRole('button', { name: 'Disarm' })).toBeTruthy()
        await waitFor(() => expect(view.getByText('ARMED')).toBeTruthy())
        fireEvent.click(view.getByRole('button', { name: 'Disarm' }))
        await waitFor(() => expect(view.getByText('DISARMED')).toBeTruthy())
        expect(of(posts, '/arm').map((p) => p.body)).toEqual([{ armed: false }])
    })

    it('Find cubes lists the answers; pick, name and Use these posts serial, address and name', async () => {
        const found = [
            { serial: 'deadbeef0042', ip: '192.0.2.44', modelName: 'LaserCube Ultra', firmware: '1.7', temperature: 30 },
            { serial: 'c0ffee000007', ip: '192.0.2.184', modelName: 'LaserCube Ultra', firmware: '1.7', temperature: 28 }
        ]
        const { fetchImpl, posts } = opsServer({ find: () => json({ ok: true, asked: 253, networks: ['192.0.2.0/24 (eth0)'], cubes: found }) })
        const view = render(panel({ fetchImpl }))
        await waitFor(() => expect(view.getByRole('button', { name: 'Find cubes' })).toBeTruthy())
        fireEvent.click(view.getByRole('button', { name: 'Find cubes' }))
        await waitFor(() => expect(view.getByText(/2 cubes answered/)).toBeTruthy())
        // The cube the setup already knows by its serial keeps its name.
        expect(view.getByLabelText('Name for the cube at 192.0.2.44').value).toBe('Left')
        fireEvent.change(view.getByLabelText('Name for the cube at 192.0.2.184'), { target: { value: 'Right' } })
        // Scoped to the list: the budget's Auto points box (#934) is a checkbox too.
        fireEvent.click(within(view.getByLabelText('Cubes found')).getAllByRole('checkbox')[0])
        fireEvent.click(view.getByRole('button', { name: 'Use these (1)' }))
        await waitFor(() => expect(view.getByText(/disarmed for the change/)).toBeTruthy())
        expect(of(posts, '/config').map((p) => p.body)).toEqual([{ cubes: [{ serial: 'c0ffee000007', ip: '192.0.2.184', name: 'Right' }] }])
    })

    it('a refused search says why (a firewall, the same-machine rule)', async () => {
        const { fetchImpl } = opsServer({ find: () => json({ ok: false, error: 'this computer refused to send the question (EACCES): a firewall …' }, 502) })
        const view = render(panel({ fetchImpl }))
        await waitFor(() => expect(view.getByRole('button', { name: 'Find cubes' })).toBeTruthy())
        fireEvent.click(view.getByRole('button', { name: 'Find cubes' }))
        await waitFor(() => expect(view.getByText(/EACCES/)).toBeTruthy())
    })
})

// The TouchDesigner-style Laser Out (2026-10-14): its own cube by IP, ON/OFF on the card.
describe('LaserOutPanelWindow with an IP', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
    afterEach(() => { vi.useRealTimers() })

    const ipServer = ({ resolve = { ok: true, status: 'answering', serial: '8cbfea06ab30', modelName: 'LaserCube Ultra', cube: { id: 'cube-1', name: 'Left' } }, signedOff = false, armed = false, armAnswer } = {}) => {
        const posts = []
        let state = { armed, signedOff, sim: false, cubes: [{ id: 'cube-1', name: 'Left', ip: '192.168.1.51', connected: true, armed }] }
        const fetchImpl = vi.fn(async (url, options) => {
            if (String(url).endsWith('/state')) return json(state)
            const body = JSON.parse(options.body)
            posts.push({ url: String(url), body })
            if (String(url).endsWith('/resolve')) return json(resolve)
            if (String(url).endsWith('/arm')) {
                const answer = armAnswer ? armAnswer(body) : { ok: true }
                if (answer.ok && body.cube) state = { ...state, signedOff: true, cubes: [{ ...state.cubes[0], armed: body.armed }] }
                return json(answer, answer.ok ? 200 : 403)
            }
            return json({ ok: true })
        })
        return { fetchImpl, posts }
    }
    const ipNode = { ...node, id: 'out-left' }

    it('checks its IP with the server as this Out, and sends frames only to the cube that answered, as this Out', async () => {
        const { fetchImpl, posts } = ipServer()
        const view = render(<LaserOutPanelWindow node={ipNode} pageOrigin={ORIGIN} fetchImpl={fetchImpl} values={{ ip: '192.168.1.51', serial: '8cbfea06ab30', frame: frameOf(0.5) }} />)
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        const resolves = posts.filter((p) => p.url.endsWith('/resolve'))
        expect(resolves[0].body).toMatchObject({ ip: '192.168.1.51', serial: '8cbfea06ab30', out: 'out-left' })
        expect(view.container.querySelector('[data-resolve="answering"]').textContent).toMatch(/answering: LaserCube Ultra · serial 8cbfea06ab30/)
        await act(async () => { await vi.advanceTimersByTimeAsync(100) })
        expect(frames(posts).at(-1).body).toMatchObject({ cube: 'cube-1', out: 'out-left' })
        expect(alives(posts).at(-1).body).toEqual({ cube: 'cube-1', out: 'out-left' })
        // The check repeats (it keeps the Out's hold on its cube).
        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        expect(posts.filter((p) => p.url.endsWith('/resolve')).length).toBeGreaterThan(1)
    })

    it('says no answer / wrong serial / refused, and sends no frame then', async () => {
        for (const [status, error] of [['no-answer', 'no cube answered at 192.168.1.51'], ['wrong-serial', 'the cube at 192.168.1.51 is serial aa'], ['refused', 'already driven by another Laser Out — one Out per cube']]) {
            const { fetchImpl, posts } = ipServer({ resolve: { ok: false, status, error } })
            const view = render(<LaserOutPanelWindow node={ipNode} pageOrigin={ORIGIN} fetchImpl={fetchImpl} values={{ ip: '192.168.1.51', frame: frameOf(0.5) }} />)
            await act(async () => { await vi.advanceTimersByTimeAsync(200) })
            expect(view.container.querySelector(`[data-resolve="${status}"]`).textContent).toContain(error)
            expect(frames(posts)).toHaveLength(0)
            view.unmount()
        }
    })

    it('the IP field is editable by hand, and Find cubes fills it with the address and serial', async () => {
        const onConfigChange = vi.fn()
        const { fetchImpl } = ipServer()
        const view = render(<LaserOutPanelWindow node={ipNode} pageOrigin={ORIGIN} fetchImpl={fetchImpl} onConfigChange={onConfigChange} values={{}} />)
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        const field = view.getByLabelText('Cube IP')
        fireEvent.change(field, { target: { value: ' 10.0.0.7 ' } })
        fireEvent.blur(field)
        expect(onConfigChange).toHaveBeenLastCalledWith('out-left', { ip: '10.0.0.7', serial: '' })
    })

    it('ON asks the phrase on the first ON of a run, then is one click; OFF is one click and names this cube only', async () => {
        const armAnswer = (body) => (body.armed && !body.confirm && !signed ? { ok: false, needsPhrase: true, error: 'not on: the first ON of a run takes the sign-off phrase' } : { ok: true })
        let signed = false
        const { fetchImpl, posts } = ipServer({ armAnswer })
        const view = render(<LaserOutPanelWindow node={ipNode} pageOrigin={ORIGIN} fetchImpl={fetchImpl} values={{ ip: '192.168.1.51' }} />)
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        // Not signed off: the phrase field is there and empty, ON waits for it.
        const field = view.getByLabelText('Sign-off phrase')
        expect(field.value).toBe('')
        fireEvent.change(field, { target: { value: 'the words' } })
        signed = true
        await act(async () => { fireEvent.click(view.getByText('OFF — click for ON')) })
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        expect(posts.filter((p) => p.url.endsWith('/arm')).at(-1).body).toEqual({ armed: true, cube: 'cube-1', out: 'out-left', confirm: 'the words' })
        // ON now: OFF is one click, for this cube.
        await act(async () => { fireEvent.click(view.getByText('ON — click for OFF')) })
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        expect(posts.filter((p) => p.url.endsWith('/arm')).at(-1).body).toEqual({ armed: false, cube: 'cube-1', out: 'out-left' })
        // Signed off this run: ON again is one click, no phrase field.
        expect(view.queryByLabelText('Sign-off phrase')).toBeNull()
        await act(async () => { fireEvent.click(view.getByText('OFF — click for ON')) })
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        expect(posts.filter((p) => p.url.endsWith('/arm')).at(-1).body).toEqual({ armed: true, cube: 'cube-1', out: 'out-left' })
        // Disarm all is always there.
        await act(async () => { fireEvent.click(view.getByText('Disarm all')) })
        expect(posts.filter((p) => p.url.endsWith('/arm')).at(-1).body).toEqual({ armed: false })
    })
})
