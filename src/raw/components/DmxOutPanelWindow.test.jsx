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
    it('asks for a host and says so through the status side channel', async () => {
        const onStatus = vi.fn()
        const { fetchImpl } = fakeRig()
        render(<DmxOutPanelWindow node={node()} values={{}} onStatus={onStatus} fetchImpl={fetchImpl} pageProtocol="http:" />)
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
