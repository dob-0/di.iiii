import { describe, expect, it } from 'vitest'
import {
    describeMachine,
    inputOnMachine,
    ndiOnMachine,
    ndiSourceOptions,
    ndiSourceStatus,
    streamInputOptions,
    streamInputStatus,
    unresolvedInputs
} from './mapMachines.js'
import { matchStreamDevice } from './MapSourceView.jsx'

const desk = { id: 'm1', name: 'aylmo', self: true, pages: 1, devices: [
    { kind: 'camera', id: 'a', label: 'HD Webcam' },
    { kind: 'screen', id: 's', label: 'Screen', width: 2560, height: 1440 }
] }
const stage = { id: 'm2', name: 'win', self: false, pages: 2, devices: [
    { kind: 'camera', id: 'b', label: 'Integrated Camera (13d3:56b2)' },
    { kind: 'camera', id: 'c', label: 'OBS Virtual Camera' },
    { kind: 'screen', id: 's', label: 'Screen', width: 1920, height: 1080 },
    { kind: 'mic', id: 'm', label: 'OBS Virtual Camera' },
    { kind: 'ndi', id: 'AYLMO (td_out_windows)', label: 'AYLMO (td_out_windows)' },
    { kind: 'ndi', id: 'WIN (OBS)', label: 'WIN (OBS)' }
] }

describe('inputs across the machines on a desk', () => {
    it('finds a named input on the machine that has it, and only there', () => {
        expect(inputOnMachine(stage, 'OBS Virtual Camera')).toBe('OBS Virtual Camera')
        expect(inputOnMachine(stage, 'obs')).toBe('OBS Virtual Camera')
        expect(inputOnMachine(desk, 'obs')).toBe('')
    })

    it('resolves a name exactly as the wall does', () => {
        // The desk's promise ("win has it") is only worth something if the wall
        // would pick the same device. One rule, checked from both sides.
        for (const name of ['OBS Virtual Camera', 'obs', 'integrated', 'Cam Link', '']) {
            const asWall = matchStreamDevice(stage.devices.filter((d) => d.kind === 'camera').map((d) => ({ kind: 'videoinput', label: d.label, deviceId: d.id })), name)
            expect(inputOnMachine(stage, name)).toBe(asWall ? asWall.label : '')
        }
    })

    it('lists every input once, with the machines that have it', () => {
        expect(streamInputOptions([desk, stage])).toEqual([
            { label: 'HD Webcam', on: ['this machine'] },
            { label: 'Integrated Camera (13d3:56b2)', on: ['win'] },
            { label: 'OBS Virtual Camera', on: ['win'] }
        ])
    })

    it('says which machines can show a stream and which cannot', () => {
        expect(streamInputStatus([desk, stage], 'OBS Virtual Camera')).toEqual({ found: ['win'], missing: ['this machine'], known: true })
    })

    it('does not cry "missing" while no machine has named its cameras yet', () => {
        const blind = { id: 'm3', name: 'kiosk', devices: [{ kind: 'camera', id: 'x', label: 'Camera 1' }] }
        expect(streamInputStatus([blind], 'obs').known).toBe(false)
        expect(unresolvedInputs([{ id: 's1', enabled: true, source: { kind: 'stream', ref: 'obs' } }], [blind])).toEqual([])
    })

    it('names the stream surfaces no machine can show', () => {
        const surfaces = [
            { id: 's1', name: 'td', enabled: true, source: { kind: 'stream', ref: 'OBS Virtual Camera' } },
            { id: 's2', name: 'capture', enabled: true, source: { kind: 'stream', ref: 'Cam Link' } },
            { id: 's3', name: 'off', enabled: false, source: { kind: 'stream', ref: 'Cam Link' } },
            { id: 's4', name: 'unnamed', enabled: true, source: { kind: 'stream', ref: '' } },
            { id: 's5', name: 'cam', enabled: true, source: { kind: 'camera', ref: '' } }
        ]
        expect(unresolvedInputs(surfaces, [desk, stage]).map((s) => s.id)).toEqual(['s2', 's4'])
    })

    it('describes a machine in one line the desk can print', () => {
        expect(describeMachine(stage)).toEqual({
            id: 'm2', name: 'win', pages: 2, screens: ['1920×1080'],
            inputs: ['Integrated Camera (13d3:56b2)', 'OBS Virtual Camera'],
            ndi: ['AYLMO (td_out_windows)', 'WIN (OBS)']
        })
    })
})

describe('NDI sources across the machines on a desk', () => {
    it('finds a source on the machine whose receiver can see it, by a fragment', () => {
        expect(ndiOnMachine(stage, 'td_out')).toBe('AYLMO (td_out_windows)')
        expect(ndiOnMachine(stage, 'AYLMO (td_out_windows)')).toBe('AYLMO (td_out_windows)')
        // The source is CALLED aylmo and is seen by win — a name says nothing
        // about which machine is showing it, which is the whole point.
        expect(ndiOnMachine(desk, 'td_out')).toBe('')
    })

    it('does not confuse an NDI source with a camera of the same name', () => {
        // stage has BOTH a camera and an NDI source called "OBS ...". They are
        // different kinds, resolved on different sides, and the desk must not
        // promise one when the surface named the other.
        expect(ndiOnMachine(stage, 'OBS Virtual Camera')).toBe('')
        expect(inputOnMachine(stage, 'WIN (OBS)')).toBe('')
    })

    it('lists every source once, with the machines that see it', () => {
        expect(ndiSourceOptions([desk, stage])).toEqual([
            { label: 'AYLMO (td_out_windows)', on: ['win'] },
            { label: 'WIN (OBS)', on: ['win'] }
        ])
        // aylmo has no NDI runtime, so it contributes nothing at all.
        expect(ndiSourceOptions([desk])).toEqual([])
    })

    it('says which machines can show a source and which cannot', () => {
        expect(ndiSourceStatus([desk, stage], 'td_out'))
            .toEqual({ found: ['win'], missing: ['this machine'], known: true })
    })

    it('does not cry "missing" while no machine has reported any NDI at all', () => {
        // A machine with no runtime reports nothing, which looks exactly like a
        // machine that has not answered yet. With nothing in hand the desk says
        // nothing rather than accusing a name that may be perfectly right.
        expect(ndiSourceStatus([desk], 'td_out').known).toBe(false)
        expect(unresolvedInputs([{ id: 'n1', enabled: true, source: { kind: 'ndi', ref: 'td_out' } }], [desk])).toEqual([])
    })

    it('names the NDI surfaces no machine can show, and says which kind they are', () => {
        const surfaces = [
            { id: 'n1', name: 'wall', enabled: true, source: { kind: 'ndi', ref: 'td_out' } },
            { id: 'n2', name: 'resolume', enabled: true, source: { kind: 'ndi', ref: 'resolume' } },
            { id: 'n3', name: 'off', enabled: false, source: { kind: 'ndi', ref: 'resolume' } },
            { id: 'n4', name: 'unnamed', enabled: true, source: { kind: 'ndi', ref: '' } },
            { id: 's2', name: 'capture', enabled: true, source: { kind: 'stream', ref: 'Cam Link' } }
        ]
        expect(unresolvedInputs(surfaces, [desk, stage])).toEqual([
            { id: 'n2', kind: 'ndi', name: 'resolume', input: 'resolume' },
            { id: 'n4', kind: 'ndi', name: 'unnamed', input: '' },
            { id: 's2', kind: 'stream', name: 'capture', input: 'Cam Link' }
        ])
    })
})

describe('which display shows this mapping — the desk picker', () => {
    const win = { id: 'm2', name: 'win', self: false, pages: 1, devices: [
        { kind: 'screen', id: 'screen-0', label: 'Built-in screen', width: 1920, height: 1080 },
        { kind: 'screen', id: 'screen-1', label: 'Optoma', width: 1280, height: 800 }
    ] }

    it('offers nothing, then every machine\'s screens by name and size', async () => {
        const { showOptions } = await import('./mapMachines.js')
        expect(showOptions([desk, win]).map((option) => option.label)).toEqual([
            'any screen',
            'aylmo · this machine · all screens',
            'aylmo · this machine · Screen 2560×1440',
            'win · all screens',
            'win · Built-in screen 1920×1080',
            'win · Optoma 1280×800'
        ])
    })

    it('writes the screen with label, index AND size, so the stage box can match by whichever survived', async () => {
        const { showFromValue, showOptions } = await import('./mapMachines.js')
        const value = showOptions([desk, win]).find((option) => option.label.endsWith('Optoma 1280×800')).value
        expect(showFromValue(value, [desk, win])).toEqual({
            machine: 'm2', name: 'win', screen: { label: 'Optoma', index: 1, size: [1280, 800] }
        })
        expect(showFromValue('m2::all', [desk, win])).toEqual({ machine: 'm2', name: 'win', screen: 'all' })
        expect(showFromValue('', [desk, win])).toBeNull()
    })

    it('shows what the document says even when that machine is not on the desk right now', async () => {
        const { showOptions, showValue } = await import('./mapMachines.js')
        const show = { machine: 'gone-machine-id', name: 'asuz', screen: { label: 'HDMI-1', index: 0, size: [1920, 1080] } }
        const options = showOptions([desk], show)
        expect(options.at(-1)).toEqual({ value: showValue(show), label: 'asuz · HDMI-1 — not on the desk now' })
        // And it round-trips as itself rather than snapping to "any".
        expect(options.some((option) => option.value === showValue(show))).toBe(true)
    })

    it('reads a stored show back to the same select value it was chosen from', async () => {
        const { showFromValue, showOptions, showValue } = await import('./mapMachines.js')
        for (const option of showOptions([desk, win])) {
            expect(showValue(showFromValue(option.value, [desk, win]))).toBe(option.value)
        }
    })
})
