import { describe, expect, it } from 'vitest'
import { describeMachine, inputOnMachine, streamInputOptions, streamInputStatus, unresolvedStreams } from './mapMachines.js'
import { matchStreamDevice } from './MapSourceView.jsx'

const desk = { id: 'm1', name: 'aylmo', self: true, pages: 1, devices: [
    { kind: 'camera', id: 'a', label: 'HD Webcam' },
    { kind: 'screen', id: 's', label: 'Screen', width: 2560, height: 1440 }
] }
const stage = { id: 'm2', name: 'win', self: false, pages: 2, devices: [
    { kind: 'camera', id: 'b', label: 'Integrated Camera (13d3:56b2)' },
    { kind: 'camera', id: 'c', label: 'OBS Virtual Camera' },
    { kind: 'screen', id: 's', label: 'Screen', width: 1920, height: 1080 },
    { kind: 'mic', id: 'm', label: 'OBS Virtual Camera' }
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
        expect(unresolvedStreams([{ id: 's1', enabled: true, source: { kind: 'stream', ref: 'obs' } }], [blind])).toEqual([])
    })

    it('names the stream surfaces no machine can show', () => {
        const surfaces = [
            { id: 's1', name: 'td', enabled: true, source: { kind: 'stream', ref: 'OBS Virtual Camera' } },
            { id: 's2', name: 'capture', enabled: true, source: { kind: 'stream', ref: 'Cam Link' } },
            { id: 's3', name: 'off', enabled: false, source: { kind: 'stream', ref: 'Cam Link' } },
            { id: 's4', name: 'unnamed', enabled: true, source: { kind: 'stream', ref: '' } },
            { id: 's5', name: 'cam', enabled: true, source: { kind: 'camera', ref: '' } }
        ]
        expect(unresolvedStreams(surfaces, [desk, stage]).map((s) => s.id)).toEqual(['s2', 's4'])
    })

    it('describes a machine in one line the desk can print', () => {
        expect(describeMachine(stage)).toEqual({
            id: 'm2', name: 'win', pages: 2, screens: ['1920×1080'],
            inputs: ['Integrated Camera (13d3:56b2)', 'OBS Virtual Camera']
        })
    })
})
