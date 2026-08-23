import { render, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sent = []
const capabilities = { value: { capabilities: { osc: true } } }

vi.mock('../../services/oscApi.js', () => ({
    fetchLocalCapabilities: () => Promise.resolve(capabilities.value),
    sendOsc: (payload) => { sent.push(payload); return Promise.resolve({ sent: 1 }) }
}))

const { default: OscOutFeed, __resetCapabilities } = await import('./OscOutFeed.jsx')

const node = (values = {}) => ({ id: 'n1', typeId: 'device.osc.out', values: { targetHost: '127.0.0.1', targetPort: 9000, ...values } })

// Let the capability promise resolve before asserting — every send is gated on
// it, so a test that skips this asserts on a node that has not woken up.
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('OscOutFeed', () => {
    beforeEach(() => { sent.length = 0; capabilities.value = { capabilities: { osc: true } }; __resetCapabilities() })
    afterEach(() => { vi.clearAllMocks() })

    it('sends when the value changes', async () => {
        const { rerender } = render(<OscOutFeed node={node()} inputs={{ address: '/light/1', value: 0.2 }} />)
        await settle()
        sent.length = 0
        rerender(<OscOutFeed node={node()} inputs={{ address: '/light/1', value: 0.8 }} />)
        await settle()
        expect(sent).toHaveLength(1)
        expect(sent[0]).toMatchObject({ host: '127.0.0.1', port: 9000, address: '/light/1', args: [0.8] })
    })

    // The send effect re-runs whenever the target changes, not only when the
    // value does — so without an explicit last-value check, retyping a port or
    // an address re-fires a value nobody touched. React's dependency array does
    // NOT cover this: it is why the obvious version of this test passes on code
    // that has no guard at all.
    it('does not re-send an unchanged value when the target is edited', async () => {
        const { rerender } = render(<OscOutFeed node={node()} inputs={{ address: '/a', value: 0.5 }} />)
        await settle()
        sent.length = 0
        rerender(<OscOutFeed node={node({ targetPort: 9001 })} inputs={{ address: '/a', value: 0.5 }} />)
        await settle()
        rerender(<OscOutFeed node={node({ targetPort: 9001 })} inputs={{ address: '/b', value: 0.5 }} />)
        await settle()
        expect(sent).toHaveLength(0)
    })

    it('fires on a rising trigger, and re-fires when a held trigger changes', async () => {
        const { rerender } = render(<OscOutFeed node={node()} inputs={{ address: '/go', value: 1, trigger: 0 }} />)
        await settle()
        sent.length = 0
        rerender(<OscOutFeed node={node()} inputs={{ address: '/go', value: 1, trigger: 1 }} />)
        await settle()
        expect(sent).toHaveLength(1)
        // Stays truthy but changed — a counter ticking, MIDI In's rising count.
        rerender(<OscOutFeed node={node()} inputs={{ address: '/go', value: 1, trigger: 2 }} />)
        await settle()
        expect(sent).toHaveLength(2)
    })

    it('passes numberAs through so a desk can be given an int', async () => {
        const { rerender } = render(<OscOutFeed node={node({ numberAs: 'int' })} inputs={{ address: '/ch', value: 1 }} />)
        await settle()
        sent.length = 0
        rerender(<OscOutFeed node={node({ numberAs: 'int' })} inputs={{ address: '/ch', value: 3 }} />)
        await settle()
        expect(sent[0].numberAs).toBe('int')
    })

    // The silent-failure class: a node with nothing behind it must SAY so.
    it('says it needs a local di.iiii instead of going dark, and sends nothing', async () => {
        capabilities.value = { capabilities: { osc: false } }
        __resetCapabilities()
        const onStatus = vi.fn()
        const { rerender } = render(<OscOutFeed node={node()} inputs={{ address: '/a', value: 1 }} onStatus={onStatus} />)
        await settle()
        rerender(<OscOutFeed node={node()} inputs={{ address: '/a', value: 2 }} onStatus={onStatus} />)
        await settle()
        expect(sent).toHaveLength(0)
        const statuses = onStatus.mock.calls.map((call) => call[1])
        expect(statuses.some((text) => /machine/i.test(String(text)))).toBe(true)
    })

    it("names a bad port as the author’s mistake, not a network failure", async () => {
        const onStatus = vi.fn()
        render(<OscOutFeed node={node({ targetPort: 0 })} inputs={{ address: '/a', value: 1 }} onStatus={onStatus} />)
        await settle()
        expect(sent).toHaveLength(0)
        const statuses = onStatus.mock.calls.map((call) => call[1])
        expect(statuses.some((text) => /1-65535/.test(String(text)))).toBe(true)
    })

    it('reports the target once it is live, so a card can show where it is going', async () => {
        const onStatus = vi.fn()
        const { rerender } = render(<OscOutFeed node={node()} inputs={{ address: '/x', value: 1 }} onStatus={onStatus} />)
        await settle()
        rerender(<OscOutFeed node={node()} inputs={{ address: '/x', value: 2 }} onStatus={onStatus} />)
        await settle()
        const statuses = onStatus.mock.calls.map((call) => String(call[1]))
        expect(statuses.some((text) => text.includes('127.0.0.1:9000'))).toBe(true)
    })
})
