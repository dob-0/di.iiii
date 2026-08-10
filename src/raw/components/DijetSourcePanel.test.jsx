import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DijetSourcePanel from './DijetSourcePanel.jsx'
import { nearestReturn, speedFrom } from '../utils/dijetCapture.js'
import { __resetLinks } from '../utils/dijetLink.js'

const node = { id: 'dijet-1', typeId: 'device.dijet', values: { host: '192.168.1.11' } }

// There is no robot in CI, so the socket is faked at the browser API boundary.
// Everything above it -- the subscribe calls, the scan reduction, the port
// writes -- is the real code.
const fakeSocket = () => {
    const sockets = []
    class FakeWS {
        constructor(url) {
            this.url = url
            this.sent = []
            this.readyState = 0
            sockets.push(this)
        }
        send(data) { this.sent.push(JSON.parse(data)) }
        close() { this.onclose?.() }
        openIt() { this.readyState = 1; this.onopen?.() }
        deliver(topic, msg) { this.onmessage?.({ data: JSON.stringify({ op: 'publish', topic, msg }) }) }
    }
    global.WebSocket = FakeWS
    return sockets
}

// links are module-level and refcounted, so they must be torn down between
// cases or one test's socket serves the next one
afterEach(() => { __resetLinks(); delete global.WebSocket; vi.restoreAllMocks() })

describe('nearestReturn', () => {
    it('ignores inf, NaN and out-of-range samples', () => {
        expect(nearestReturn({ ranges: [Infinity, NaN, 2.5, 0.9], range_min: 0.1, range_max: 12 })).toBe(0.9)
    })

    // The whole point of the port: a graph must not read 0 m and believe
    // something is touching the robot when the truth is "nothing came back".
    it('returns null when nothing came back, never 0', () => {
        expect(nearestReturn({ ranges: [Infinity, NaN], range_min: 0.1, range_max: 12 })).toBeNull()
        expect(nearestReturn(null)).toBeNull()
    })

    it('treats range_min and range_max as exclusive bounds', () => {
        expect(nearestReturn({ ranges: [0.1, 12, 3], range_min: 0.1, range_max: 12 })).toBe(3)
    })
})

describe('speedFrom', () => {
    it('combines both linear axes, because the chassis is mecanum', () => {
        expect(speedFrom({ linear: { x: 3, y: 4 } })).toBe(5)
    })
    it('survives a message with no linear block', () => {
        expect(speedFrom({})).toBe(0)
        expect(speedFrom(null)).toBe(0)
    })
})

describe('DijetSourcePanel', () => {
    it('says the robot is unreachable rather than sitting blank', async () => {
        const sockets = fakeSocket()
        render(<DijetSourcePanel node={node} values={node.values} />)
        await waitFor(() => expect(sockets.length).toBe(1))
        sockets[0].close()
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/same network/i))
    })

    it('subscribes read-only: it never advertises or publishes', async () => {
        const sockets = fakeSocket()
        render(<DijetSourcePanel node={node} values={node.values} />)
        await waitFor(() => expect(sockets.length).toBe(1))
        sockets[0].openIt()
        await waitFor(() => expect(sockets[0].sent.length).toBeGreaterThan(0))
        const ops = sockets[0].sent.map((m) => m.op)
        // The property that matters is that it never WRITES. unsubscribe is a
        // read-side op and shows up when a sibling node lets a topic go, so
        // assert the absence of the two dangerous ops rather than an exact set.
        expect(ops).not.toContain('advertise')
        expect(ops).not.toContain('publish')
        expect(ops.every((op) => op === 'subscribe' || op === 'unsubscribe')).toBe(true)
    })

    it('writes the lidar range to the port and shows it', async () => {
        const sockets = fakeSocket()
        const onSignalChange = vi.fn()
        render(<DijetSourcePanel node={node} values={node.values} onSignalChange={onSignalChange} />)
        await waitFor(() => expect(sockets.length).toBe(1))
        sockets[0].openIt()
        sockets[0].deliver('/scan', { ranges: [4.2, 1.25, Infinity], range_min: 0.1, range_max: 12 })
        await waitFor(() => expect(screen.getByText('1.25 m')).toBeInTheDocument())
        expect(onSignalChange).toHaveBeenCalledWith('dijet-1', expect.objectContaining({ nearest: 1.25 }))
    })

    it('rising trigger, because the runtime computes no signal outputs', async () => {
        const sockets = fakeSocket()
        const onSignalChange = vi.fn()
        render(<DijetSourcePanel node={node} values={node.values} onSignalChange={onSignalChange} />)
        await waitFor(() => expect(sockets.length).toBe(1))
        sockets[0].openIt()
        sockets[0].deliver('/voltage', { data: 12.2 })
        sockets[0].deliver('/voltage', { data: 12.1 })
        const triggers = onSignalChange.mock.calls
            .map(([, ports]) => ports?.trigger)
            .filter((t) => typeof t === 'number')
        expect(triggers.length).toBeGreaterThanOrEqual(2)
        expect(triggers[triggers.length - 1]).toBeGreaterThan(triggers[0])
    })

    it('clears every port on unmount so a removed node leaves no stale reading', async () => {
        const sockets = fakeSocket()
        const onSignalChange = vi.fn()
        const { unmount } = render(
            <DijetSourcePanel node={node} values={node.values} onSignalChange={onSignalChange} />
        )
        await waitFor(() => expect(sockets.length).toBe(1))
        unmount()
        expect(onSignalChange).toHaveBeenCalledWith('dijet-1', null)
    })
})
