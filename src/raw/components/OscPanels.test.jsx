import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OscInPanelWindow from './OscInPanelWindow.jsx'
import OscOutPanelWindow from './OscOutPanelWindow.jsx'
import DmxInPanelWindow from './DmxInPanelWindow.jsx'
import { NO_BRIDGE_TEXT } from '../utils/oscBridgeClient.js'

// No di.iiii server here, so the network is faked at the fetch boundary: the
// bridge's and the desk's answers, shaped as the routes answer them
// (serverXR/src/routes/oscRoutes.js, lighting/desk.js GET /api/input/levels).
const jsonRes = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
})

afterEach(() => { vi.useRealTimers() })

const lastReport = (fn, nodeId) => {
    const calls = fn.mock.calls.filter((c) => c[0] === nodeId && c[1] !== null)
    return calls[calls.length - 1]?.[1]
}

describe('OscInPanelWindow', () => {
    const node = { id: 'oi', typeId: 'device.osc.in', values: { port: 8000, pattern: '' } }

    it('shows what was waiting without counting it, then counts each new message once', async () => {
        const queue = [
            { ok: true, seq: 2, bind: '127.0.0.1', messages: [{ seq: 1, address: '/a', args: [{ type: 'f', value: 0.1 }] }, { seq: 2, address: '/a', args: [{ type: 'f', value: 0.2 }] }] },
            { ok: true, seq: 4, bind: '127.0.0.1', messages: [{ seq: 3, address: '/b', args: [{ type: 's', value: 'go' }] }, { seq: 4, address: '/fader/1', args: [{ type: 'f', value: 0.75 }] }] },
        ]
        const sinces = []
        const fetchImpl = vi.fn(async (url, opts) => {
            sinces.push(JSON.parse(opts.body).since)
            return jsonRes(queue.shift() || { ok: true, seq: 4, bind: '127.0.0.1', messages: [] })
        })
        const onSignalChange = vi.fn()
        render(<OscInPanelWindow node={node} values={node.values} onSignalChange={onSignalChange} fetchImpl={fetchImpl} pageOrigin="http://diiii.localhost" pollMs={5} />)
        await waitFor(() => expect(lastReport(onSignalChange, 'oi')?.signal).toBe(2))
        const r = lastReport(onSignalChange, 'oi')
        expect(r).toMatchObject({ address: '/fader/1', value: 0.75, signal: 2 })
        expect(r.status).toMatch(/2 heard/)
        // the second read asked for what came after the first read's last number
        expect(sinces.slice(0, 2)).toEqual([0, 2])
        expect(fetchImpl.mock.calls[0][0]).toBe('http://diiii.localhost/osc/api/in')
    })

    it('says there is no local bridge on a hosted page (404)', async () => {
        const onSignalChange = vi.fn()
        render(<OscInPanelWindow node={node} values={node.values} onSignalChange={onSignalChange} fetchImpl={async () => jsonRes({}, 404)} pageOrigin="https://diiii.xyz" pollMs={5} />)
        await waitFor(() => expect(lastReport(onSignalChange, 'oi')?.status).toBe(NO_BRIDGE_TEXT))
    })

    it('refuses a port under 1024 without asking the bridge', async () => {
        const fetchImpl = vi.fn()
        const onSignalChange = vi.fn()
        render(<OscInPanelWindow node={node} values={{ port: 80 }} onSignalChange={onSignalChange} fetchImpl={fetchImpl} pollMs={5} />)
        await waitFor(() => expect(lastReport(onSignalChange, 'oi')?.status).toMatch(/1024/))
        expect(fetchImpl).not.toHaveBeenCalled()
    })
})

describe('OscOutPanelWindow', () => {
    const node = { id: 'oo', typeId: 'device.osc.out', values: { targetHost: '127.0.0.1', targetPort: 9000, numbers: 'float' } }
    const bridge = () => {
        const sent = []
        const fetchImpl = vi.fn(async (url, opts) => {
            if (String(url).endsWith('/state')) return jsonRes({ ok: true, listeners: [] })
            const body = JSON.parse(opts.body)
            sent.push(body)
            return jsonRes({ ok: true, to: `${body.host}:${body.port}` })
        })
        return { fetchImpl, sent }
    }

    it('sends when Value changes, not while it stays the same, and Trigger re-sends', async () => {
        const { fetchImpl, sent } = bridge()
        const onStatus = vi.fn()
        const props = { node, onStatus, fetchImpl, pageOrigin: 'http://diiii.localhost' }
        const { rerender } = render(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/layer1/opacity', value: 0 }} />)
        await waitFor(() => expect(lastReport(onStatus, 'oo')).toMatch(/Ready/))
        expect(sent).toEqual([]) // mounting sends nothing
        rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/layer1/opacity', value: 0.5 }} />)
        await waitFor(() => expect(sent.length).toBe(1))
        expect(sent[0]).toEqual({ host: '127.0.0.1', port: 9000, address: '/layer1/opacity', args: [0.5], numbers: 'float' })
        rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/layer1/opacity', value: 0.5 }} />)
        await new Promise((r) => setTimeout(r, 40))
        expect(sent.length).toBe(1)
        rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/layer1/opacity', value: 0.5, trigger: 1 }} />)
        await waitFor(() => expect(sent.length).toBe(2))
        rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/layer1/opacity', value: 0.5, trigger: 2 }} />)
        await waitFor(() => expect(sent.length).toBe(3))
        await waitFor(() => expect(lastReport(onStatus, 'oo')).toMatch(/3 sent/))
    })

    it('coalesces a fast-changing Value to the latest (20 ms throttle)', async () => {
        const { fetchImpl, sent } = bridge()
        const props = { node, onStatus: vi.fn(), fetchImpl }
        const { rerender } = render(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/x', value: 0 }} />)
        await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
        for (let i = 1; i <= 10; i++) rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/x', value: i }} />)
        await new Promise((r) => setTimeout(r, 60))
        // the first change goes at once, the other nine coalesce into the latest
        expect(sent.map((s) => s.args[0])).toEqual([1, 10])
    })

    it('a Trigger with nothing on Value sends the bare address', async () => {
        const { fetchImpl, sent } = bridge()
        const props = { node, onStatus: vi.fn(), fetchImpl }
        const { rerender } = render(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/go' }} />)
        rerender(<OscOutPanelWindow {...props} values={{ ...node.values, address: '/go', trigger: true }} />)
        await waitFor(() => expect(sent.length).toBe(1))
        expect(sent[0].args).toEqual([])
    })

    it('says there is no local bridge, and the bridge\'s reason for a refused target', async () => {
        const onStatus = vi.fn()
        render(<OscOutPanelWindow node={node} values={node.values} onStatus={onStatus} fetchImpl={async () => jsonRes({}, 404)} />)
        await waitFor(() => expect(lastReport(onStatus, 'oo')).toBe(NO_BRIDGE_TEXT))

        const onStatus2 = vi.fn()
        const fetchImpl = async (url) => (String(url).endsWith('/state')
            ? jsonRes({ ok: true })
            : jsonRes({ ok: false, error: '8.8.8.8 is not on this machine or a private network' }, 400))
        const { rerender } = render(<OscOutPanelWindow node={{ ...node, id: 'o2' }} values={{ targetHost: '8.8.8.8', targetPort: 9000, address: '/x', value: 0 }} onStatus={onStatus2} fetchImpl={fetchImpl} />)
        await waitFor(() => expect(lastReport(onStatus2, 'o2')).toMatch(/Ready/))
        rerender(<OscOutPanelWindow node={{ ...node, id: 'o2' }} values={{ targetHost: '8.8.8.8', targetPort: 9000, address: '/x', value: 1 }} onStatus={onStatus2} fetchImpl={fetchImpl} />)
        await waitFor(() => expect(lastReport(onStatus2, 'o2')).toMatch(/private network/))
    })
})

describe('DmxInPanelWindow', () => {
    const node = { id: 'di', typeId: 'device.dmx.in', values: { universe: 1, channel: 2 } }
    const levelsWith = (byte) => { const l = new Array(512).fill(0); l[1] = byte; return l }

    it('reads one channel of the desk\'s input as 0..1, and HOLDS it when the signal is lost', async () => {
        const answers = [
            { universe: 0, state: 'live', levels: levelsWith(255) },
            { universe: 0, state: 'live', levels: levelsWith(51) },
        ]
        const urls = []
        const fetchImpl = vi.fn(async (url) => {
            urls.push(String(url))
            return jsonRes(answers.shift() || { universe: 0, state: 'lost', levels: null })
        })
        const onLevelChange = vi.fn()
        render(<DmxInPanelWindow node={node} values={node.values} onLevelChange={onLevelChange} fetchImpl={fetchImpl} pageOrigin="http://diiii.localhost" pollMs={5} />)
        await waitFor(() => expect(lastReport(onLevelChange, 'di')?.status).toMatch(/holding the last value, 20%/))
        expect(lastReport(onLevelChange, 'di').value).toBeCloseTo(0.2, 6)
        expect(onLevelChange.mock.calls.some((c) => c[1]?.value === 1)).toBe(true)
        // universe 1 on the node is the desk's universe 0
        expect(urls[0]).toBe('http://diiii.localhost/light/api/input/levels?universe=0')
    })

    it('says the desk\'s input is off, and that a hosted page has no desk', async () => {
        const onLevelChange = vi.fn()
        render(<DmxInPanelWindow node={node} values={node.values} onLevelChange={onLevelChange} fetchImpl={async () => jsonRes({ universe: 0, state: 'off', levels: null })} pollMs={5} />)
        await waitFor(() => expect(lastReport(onLevelChange, 'di')?.status).toMatch(/input is off/))
        expect(lastReport(onLevelChange, 'di').value).toBe(0)

        const onHosted = vi.fn()
        render(<DmxInPanelWindow node={{ ...node, id: 'd2' }} values={node.values} onLevelChange={onHosted} fetchImpl={async () => jsonRes({}, 404)} pollMs={5} />)
        await waitFor(() => expect(lastReport(onHosted, 'd2')?.status).toMatch(/local di.iiii/))
    })

    it('clears its ports on unmount', async () => {
        const onLevelChange = vi.fn()
        const { unmount } = render(<DmxInPanelWindow node={node} values={node.values} onLevelChange={onLevelChange} fetchImpl={async () => jsonRes({ universe: 0, state: 'waiting', levels: null })} pollMs={5} />)
        await waitFor(() => expect(lastReport(onLevelChange, 'di')?.status).toMatch(/nothing has arrived/))
        act(() => unmount())
        expect(onLevelChange).toHaveBeenLastCalledWith('di', null)
    })
})
