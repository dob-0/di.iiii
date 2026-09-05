import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DmxOutPanelWindow from './DmxOutPanelWindow.jsx'

const node = (values = {}) => ({ id: 'dmx-1', typeId: 'device.dmx.out', values })

// No rig here or in CI, so the network is faked at the fetch boundary: the
// status poll answers like a vizzz node, commands are recorded.
const fakeRig = ({ answering = true } = {}) => {
    const commands = []
    const fetchImpl = vi.fn(async (url, options) => {
        if (String(url).endsWith('/status')) {
            if (!answering) throw new TypeError('unreachable')
            return { ok: true, json: async () => ({ name: 'vizzz-a1', uni: 1 }) }
        }
        commands.push({ url: String(url), options })
        return {}
    })
    return { fetchImpl, commands }
}

describe('DmxOutPanelWindow', () => {
    // A node with NOTHING set is a desk node now (see the desk suite below), so
    // the empty-vizzz state is reached by choosing that rig and naming no box.
    it('asks for a host and says so through the status side channel', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        render(<DmxOutPanelWindow node={node({ rig: 'vizzz' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', 'No rig named'))
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('reports the answering rig by its own name', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        render(<DmxOutPanelWindow node={node({ host: '192.168.1.40' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', 'Sending to vizzz-a1 (universe 1)'))
    })

    it('says when nobody answers', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig({ answering: false })
        render(<DmxOutPanelWindow node={node({ host: '192.168.1.40' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', 'No answer from 192.168.1.40'))
    })

    it('names the mixed-content wall on a https page instead of failing silently', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        render(<DmxOutPanelWindow node={node({ host: '192.168.1.40' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="https:" />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', expect.stringMatching(/https page cannot reach/i)))
        // The wall is absolute: not even the status poll goes out.
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('sends a level when Value CHANGES, at the current Channel, scaled to bytes', async () => {
        const { fetchImpl, commands } = fakeRig()
        const view = render(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ channel: 5, value: 0.5 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        // The mount value is a value that merely keeps being itself.
        expect(commands.filter((c) => c.url.includes('/set'))).toHaveLength(0)
        view.rerender(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ channel: 5, value: 1 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        await waitFor(() => expect(commands.some((c) => c.url === 'http://rig/set?ch=5&v=255')).toBe(true))
    })

    it('sends Master on change and rides every command out no-cors', async () => {
        const { fetchImpl, commands } = fakeRig()
        const view = render(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ master: 1 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        view.rerender(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ master: 0.25 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        await waitFor(() => expect(commands.some((c) => c.url === 'http://rig/master?v=64')).toBe(true))
        for (const c of commands) expect(c.options).toEqual({ mode: 'no-cors' })
    })

    it('blackout fires on the rising edge only', async () => {
        const { fetchImpl, commands } = fakeRig()
        const view = render(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ blackout: 0 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        view.rerender(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ blackout: 1 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        view.rerender(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{ blackout: 1 }} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        await waitFor(() => expect(commands.filter((c) => c.url === 'http://rig/blackout')).toHaveLength(1))
    })

    it('settles on the answer under a parent that re-renders with inline arrows', async () => {
        // The keeper's inline-arrow lesson, caught live on this panel: with the
        // fetch identity in the poll effect's deps, every parent render restarts
        // the poll and the status says "Looking…" for ever while the rig answers.
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        const inlineFetch = () => (...args) => fetchImpl(...args)
        const view = render(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{}} onStatus={onStatus} fetchImpl={inlineFetch()} pageProtocol="http:" />
        )
        for (let i = 0; i < 5; i += 1) {
            view.rerender(
                <DmxOutPanelWindow node={node({ host: 'rig' })} values={{}} onStatus={onStatus} fetchImpl={inlineFetch()} pageProtocol="http:" />
            )
        }
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', 'Sending to vizzz-a1 (universe 1)'))
    })

    it('clears its status port on unmount, the capture-panel convention', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        const view = render(
            <DmxOutPanelWindow node={node({ host: 'rig' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" />
        )
        view.unmount()
        expect(onStatus).toHaveBeenCalledWith('dmx-1', null)
    })
})

// --- the desk: di.iiii's own lighting desk at /light ------------------------

const ORIGIN = 'http://localhost:5173'
const API = `${ORIGIN}/light/api`

const SUMMARY = {
    master: 200, blackout: false, activeScene: 's1', activeSceneName: 'Red', fading: false,
    fx: { mode: 'ring', bpm: 120, depth: 1, enabled: true },
    chase: { enabled: false, index: 0, count: 0 },
    fixtures: 21, scenes: 588, universes: [0],
    output: { driver: 'artnet', enabled: false, connected: false, packetsSent: 0, lastError: null, lanAllowed: false },
}

// The desk is a local server nobody is running in CI, so it is faked at the
// same fetch boundary the vizzz rig is: GETs answer, POSTs are recorded.
const fakeDesk = ({ summaryStatus = 200, scenes = [{ id: 's1', name: 'Red' }], recallOk = true } = {}) => {
    const posts = []
    // A real Response carries headers, and the desk answers JSON. The client now checks
    // that, because a hosted di.iiii answers 200 with its own index.html for an address
    // it does not know — a page, not a desk.
    const JSON_HEADERS = { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null) }
    const jsonBody = (body) => ({ ok: true, status: 200, headers: JSON_HEADERS, json: async () => body })
    const fetchImpl = vi.fn(async (url, options) => {
        const address = String(url)
        if (options?.method === 'POST') {
            posts.push({ url: address, body: JSON.parse(options.body) })
            const path = address.slice(API.length)
            const ok = path === '/scenes/recall'
                ? (typeof recallOk === 'function' ? recallOk(JSON.parse(options.body)) : recallOk)
                : true
            return jsonBody({ ok })
        }
        if (address.endsWith('/scenes/summary')) {
            return jsonBody({ scenes: typeof scenes === 'function' ? scenes() : scenes })
        }
        if (address.endsWith('/summary')) {
            if (summaryStatus !== 200) return { ok: false, status: summaryStatus }
            return jsonBody(SUMMARY)
        }
        return { ok: false, status: 404 }
    })
    return { fetchImpl, posts }
}

const desk = (props) => (
    <DmxOutPanelWindow pageProtocol="http:" pageOrigin={ORIGIN} {...props} />
)

describe('DmxOutPanelWindow — the lighting desk', () => {
    it('is the rig a new node speaks to, and says what the desk actually holds', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeDesk()
        render(desk({ node: node(), values: {}, onStatus, fetchImpl }))
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith(
            'dmx-1', 'Desk: 21 fixtures, 588 scenes · Red · ring · output OFF'
        ))
        expect(fetchImpl.mock.calls.some(([url]) => String(url) === `${API}/summary`)).toBe(true)
    })

    it('says where the desk lives when a hosted di.iiii answers 404', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeDesk({ summaryStatus: 404 })
        render(desk({ node: node(), values: {}, onStatus, fetchImpl }))
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith(
            'dmx-1', 'The lighting desk lives on a local di.iiii — run di up or npm run dev'
        ))
    })

    it('names the LAN rule on a 403 instead of shrugging', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeDesk({ summaryStatus: 403 })
        render(desk({ node: node(), values: {}, onStatus, fetchImpl }))
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', expect.stringMatching(/DI_ALLOW_LAN_DEVICES=1/)))
    })

    it('offers the way in — a link to the desk itself', async () => {
        const { fetchImpl } = fakeDesk()
        const view = render(desk({ node: node(), values: {}, fetchImpl }))
        const link = await view.findByText(/Open the desk/)
        expect(link.getAttribute('href')).toBe(`${ORIGIN}/light/`)
        expect(link.getAttribute('target')).toBe('_blank')
    })

    it('says the rig will not light while the desk\'s output is off', async () => {
        const { fetchImpl } = fakeDesk()
        const view = render(desk({ node: node(), values: {}, fetchImpl }))
        await view.findByText(/switch it on under OUTPUT/)
    })

    it('sends Master and a channel level as the desk\'s own bodies', async () => {
        const { fetchImpl, posts } = fakeDesk()
        const view = render(desk({ node: node(), values: { master: 1, channel: 5, value: 0 }, fetchImpl }))
        view.rerender(desk({ node: node(), values: { master: 0.25, channel: 5, value: 1 }, fetchImpl }))
        await waitFor(() => {
            expect(posts.some((p) => p.url === `${API}/master` && p.body.master === 64)).toBe(true)
            expect(posts.some((p) => p.url === `${API}/raw`
                && p.body.universe === 0 && p.body.channel === 5 && p.body.value === 255)).toBe(true)
        })
    })

    it('carries blackout as a state — the falling edge lifts it again', async () => {
        const { fetchImpl, posts } = fakeDesk()
        const view = render(desk({ node: node(), values: { blackout: 0 }, fetchImpl }))
        view.rerender(desk({ node: node(), values: { blackout: 1 }, fetchImpl }))
        await waitFor(() => expect(posts.some((p) => p.body.blackout === true)).toBe(true))
        view.rerender(desk({ node: node(), values: { blackout: 0 }, fetchImpl }))
        await waitFor(() => expect(posts.some((p) => p.body.blackout === false)).toBe(true))
        expect(posts.every((p) => p.url === `${API}/master`)).toBe(true)
    })

    it('recalls a scene by its id when the word changes', async () => {
        const { fetchImpl, posts } = fakeDesk()
        const view = render(desk({ node: node(), values: { scene: '' }, fetchImpl }))
        view.rerender(desk({ node: node(), values: { scene: 's1' }, fetchImpl }))
        await waitFor(() => expect(posts.some((p) => p.url === `${API}/scenes/recall` && p.body.id === 's1')).toBe(true))
    })

    it('recalls a scene by the NAME written on the desk', async () => {
        const { fetchImpl, posts } = fakeDesk({ scenes: [{ id: 's7', name: 'House lights' }] })
        const view = render(desk({ node: node(), values: {}, fetchImpl }))
        await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => String(url) === `${API}/scenes/summary`)).toBe(true))
        view.rerender(desk({ node: node(), values: { scene: 'House lights' }, fetchImpl }))
        await waitFor(() => expect(posts.some((p) => p.url === `${API}/scenes/recall` && p.body.id === 's7')).toBe(true))
    })

    it('looks the library up again when a recall misses, and tries once more', async () => {
        // A scene saved on the desk after this node mounted: the panel's first
        // try goes out as the raw word, misses, and the re-read finds the id.
        let library = []
        const { fetchImpl, posts } = fakeDesk({
            scenes: () => library,
            recallOk: (body) => body.id === 's9',
        })
        const view = render(desk({ node: node(), values: {}, fetchImpl }))
        await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => String(url) === `${API}/scenes/summary`)).toBe(true))
        library = [{ id: 's9', name: 'Warm' }]
        view.rerender(desk({ node: node(), values: { scene: 'Warm' }, fetchImpl }))
        await waitFor(() => expect(posts.some((p) => p.body.id === 's9')).toBe(true))
        expect(posts.filter((p) => p.url === `${API}/scenes/recall`)).toHaveLength(2)
    })

    it('leaves a graph authored before the desk existed on its vizzz node', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        // No `rig` field anywhere — a saved node, exactly as it was stored.
        render(<DmxOutPanelWindow node={node({ host: '192.168.1.40' })} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" pageOrigin={ORIGIN} />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('dmx-1', 'Sending to vizzz-a1 (universe 1)'))
        expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('http://192.168.1.40'))).toBe(true)
    })

    it('an explicit vizzz choice keeps the host field, the desk one hides it', async () => {
        const { fetchImpl } = fakeRig()
        const view = render(<DmxOutPanelWindow node={node({ rig: 'vizzz', host: 'rig' })} values={{}} fetchImpl={fetchImpl} pageProtocol="http:" pageOrigin={ORIGIN} />)
        expect(view.container.querySelector('input[type="text"]')).not.toBeNull()
        const deskView = render(desk({ node: node({ rig: 'desk' }), values: {}, fetchImpl: fakeDesk().fetchImpl }))
        expect(deskView.container.querySelector('input[type="text"]')).toBeNull()
    })
})
