import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The NDI® probe is the one thing here that leaves the machine. It is mocked
// per test rather than globally, because "a machine with no NDI runtime reports
// NOTHING" and "a machine with one reports its sources" are both cases this
// file has to state — and on aylmo, where these run, the true answer is always
// the first one.
vi.mock('../../map/ndiLink.js', () => ({ fetchNdiSources: vi.fn(async () => []) }))

import { readMachineDevices } from './machineDevices.js'
import { fetchNdiSources } from '../../map/ndiLink.js'

beforeEach(() => { fetchNdiSources.mockReset(); fetchNdiSources.mockResolvedValue([]) })
afterEach(() => { vi.unstubAllGlobals() })

describe('what a machine says it has', () => {
    it('reports a scaled screen in real pixels, not CSS pixels', async () => {
        // A 1920×1080 laptop panel at 150% scaling: the browser says 1280×720.
        // The desk sizes a wall from this, so it has to be the panel's own size.
        vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } })
        vi.stubGlobal('screen', { width: 1280, height: 720 })
        vi.stubGlobal('devicePixelRatio', 1.5)
        const screens = (await readMachineDevices()).filter((device) => device.kind === 'screen')
        expect(screens).toEqual([{ kind: 'screen', id: 'screen-0', label: 'Screen', width: 1920, height: 1080 }])
    })

    it('leaves an unscaled screen as it is', async () => {
        vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } })
        vi.stubGlobal('screen', { width: 1920, height: 1080 })
        vi.stubGlobal('devicePixelRatio', 1)
        const screens = (await readMachineDevices()).filter((device) => device.kind === 'screen')
        expect(screens[0]).toMatchObject({ width: 1920, height: 1080 })
    })
})

describe('the NDI sources this machine can see', () => {
    const noHardware = () => {
        vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } })
        vi.stubGlobal('screen', { width: 1920, height: 1080 })
        vi.stubGlobal('devicePixelRatio', 1)
    }

    it('reports nothing at all on a machine with no runtime', async () => {
        // Most machines will never have NDI installed, and a hosted di.iiii
        // answers 404 to the whole lane. Silence is the ordinary case and must
        // not read as an error anywhere downstream.
        noHardware()
        const devices = await readMachineDevices()
        expect(devices.filter((device) => device.kind === 'ndi')).toEqual([])
        expect(devices.some((device) => device.kind === 'screen')).toBe(true)
    })

    it('appends what the local receiver sees, one entry per source', async () => {
        noHardware()
        fetchNdiSources.mockResolvedValue([
            { name: 'AYLMO (td_out_windows)', address: '10.10.10.2:5961' },
            { name: 'WIN (OBS)', address: '10.10.10.3:5961' }
        ])
        const devices = await readMachineDevices()
        expect(devices.filter((device) => device.kind === 'ndi')).toEqual([
            { kind: 'ndi', id: 'AYLMO (td_out_windows)', label: 'AYLMO (td_out_windows)' },
            { kind: 'ndi', id: 'WIN (OBS)', label: 'WIN (OBS)' }
        ])
    })

    it('keeps an NDI name whole — it is not an ALSA route', async () => {
        // tidyDevices splits a label at the first " ... - ..." to fold Linux's
        // five entries for one sound chip into one. An NDI name legitimately
        // contains both a comma and a dash, so the sources are appended AFTER
        // that pass and must come through byte-identical.
        noHardware()
        fetchNdiSources.mockResolvedValue([{ name: 'STUDIO, back room - Resolume Arena' }])
        const devices = await readMachineDevices()
        expect(devices.at(-1).label).toBe('STUDIO, back room - Resolume Arena')
    })

    it('never fails the whole read when the probe throws', async () => {
        // A machine whose serverXR is mid-restart must still report its screen.
        noHardware()
        fetchNdiSources.mockRejectedValue(new Error('connection refused'))
        const devices = await readMachineDevices()
        expect(devices.filter((device) => device.kind === 'ndi')).toEqual([])
        expect(devices.some((device) => device.kind === 'screen')).toBe(true)
    })

    it('drops a source with no name rather than listing a blank', async () => {
        noHardware()
        fetchNdiSources.mockResolvedValue([{ name: '  ' }, { address: 'x' }, { name: ' td ' }])
        const devices = await readMachineDevices()
        expect(devices.filter((device) => device.kind === 'ndi')).toEqual([{ kind: 'ndi', id: 'td', label: 'td' }])
    })
})
