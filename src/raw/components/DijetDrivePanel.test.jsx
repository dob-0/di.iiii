import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DijetDrivePanel from './DijetDrivePanel.jsx'
import { __resetLinks } from '../utils/dijetLink.js'

const node = { id: 'drive-1', typeId: 'device.dijet.drive', values: { host: '192.168.1.11' } }

let sockets = []
class FakeWS {
    constructor(url) {
        this.url = url
        this.sent = []
        this.readyState = 0
        sockets.push(this)
    }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() { this.readyState = 3; this.onclose?.() }
    openIt() { this.readyState = 1; this.onopen?.() }
}

const published = (topic) => sockets.flatMap((s) => s.sent).filter((m) => m.op === 'publish' && m.topic === topic)

beforeEach(() => {
    sockets = []
    globalThis.WebSocket = FakeWS
    vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
    vi.useRealTimers()
    __resetLinks()
    delete globalThis.WebSocket
})

const connect = async () => {
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0))
    await act(async () => { sockets[0].openIt() })
}

describe('DijetDrivePanel safety', () => {
    // The property the whole node hangs on. If a graph could arm it, an edge
    // dropped on the wrong port would set a real machine moving.
    it('publishes nothing until a person arms it, however the inputs are wired', async () => {
        render(<DijetDrivePanel node={node} values={node.values} inputs={{ forward: 0.3, turn: 1 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(2000) })
        expect(published('/cmd_vel')).toHaveLength(0)
    })

    it('drives only while armed, and stops on disarm', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<DijetDrivePanel node={node} values={node.values} inputs={{ forward: 0.2, strafe: 0, turn: 0 }} />)
        await connect()

        await user.click(screen.getByRole('button', { name: /arm/i }))
        await act(async () => { vi.advanceTimersByTime(500) })
        const moving = published('/cmd_vel')
        expect(moving.length).toBeGreaterThan(0)
        expect(moving.at(-1).msg.linear.x).toBeCloseTo(0.2)

        await user.click(screen.getByRole('button', { name: /stop/i }))
        const after = published('/cmd_vel').at(-1)
        expect(after.msg.linear.x).toBe(0)
        expect(after.msg.angular.z).toBe(0)
    })

    it('clamps to the ceiling, because the robot’s driver enforces none', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(
            <DijetDrivePanel
                node={node}
                values={{ ...node.values, maxLinear: 0.3, maxAngular: 1.2 }}
                inputs={{ forward: 99, strafe: -99, turn: 99 }}
            />
        )
        await connect()
        await user.click(screen.getByRole('button', { name: /arm/i }))
        await act(async () => { vi.advanceTimersByTime(300) })
        const last = published('/cmd_vel').at(-1)
        expect(last.msg.linear.x).toBe(0.3)
        expect(last.msg.linear.y).toBe(-0.3)
        expect(last.msg.angular.z).toBe(1.2)
    })

    it('stops when the tab is hidden — a phone in a pocket must not keep driving', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<DijetDrivePanel node={node} values={node.values} inputs={{ forward: 0.2 }} />)
        await connect()
        await user.click(screen.getByRole('button', { name: /arm/i }))
        await act(async () => { vi.advanceTimersByTime(300) })

        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })

        expect(published('/cmd_vel').at(-1).msg.linear.x).toBe(0)
        await waitFor(() => expect(screen.getByRole('button', { name: /arm/i })).toBeInTheDocument())
    })

    it('stops on unmount — deleting the node cannot leave it driving', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        const { unmount } = render(
            <DijetDrivePanel node={node} values={node.values} inputs={{ forward: 0.25 }} />
        )
        await connect()
        await user.click(screen.getByRole('button', { name: /arm/i }))
        await act(async () => { vi.advanceTimersByTime(300) })
        unmount()
        expect(published('/cmd_vel').at(-1).msg.linear.x).toBe(0)
    })

    it('cannot be armed while the robot is unreachable', async () => {
        render(<DijetDrivePanel node={node} values={node.values} inputs={{}} />)
        await waitFor(() => expect(sockets.length).toBeGreaterThan(0))
        await act(async () => { sockets[0].close() })
        await waitFor(() => expect(screen.getByRole('button', { name: /arm/i })).toBeDisabled())
    })
})
