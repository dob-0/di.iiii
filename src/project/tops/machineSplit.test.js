import { describe, expect, it } from 'vitest'
import { splitNetwork } from './useTopNetwork.js'
import { machinesIn, runnerOn } from './machineLink.js'

// The owner's patch, 2026-09-14: asuz's camera, analysed on the PC, back to
// asuz's projector.
const network = {
    nodes: [
        { id: 'cam', type: 'top.camera', values: { machine: 'asuz' } },
        { id: 'diff', type: 'top.difference', values: { machine: 'pc' } },
        { id: 'edge', type: 'top.edge', values: { machine: 'pc' } },
        { id: 'out', type: 'top.out', values: { machine: 'asuz' } },
        { id: 'level', type: 'top.level', values: {} }
    ],
    wires: [
        { from: 'cam', to: 'diff', port: 'a' },
        { from: 'cam', to: 'edge', port: 'a' },
        { from: 'diff', to: 'out', port: 'a' },
        { from: 'edge', to: 'level', port: 'a' }
    ]
}

describe('a patch across machines', () => {
    it('on the PC: computes its own and the anywhere-operators, receives the camera as video', () => {
        const split = splitNetwork(network, 'pc')
        expect(split.local.map((node) => node.id).sort()).toEqual(['diff', 'edge', 'level'])
        expect(split.remote).toEqual(['cam'])
        expect(split.previews).toEqual(['out'])
        expect(Object.fromEntries(split.byMachine)).toEqual({ asuz: ['cam', 'out'] })
    })

    it('on asuz: computes camera and out, receives the difference as video, previews the edge', () => {
        const split = splitNetwork(network, 'asuz')
        expect(split.local.map((node) => node.id).sort()).toEqual(['cam', 'level', 'out'])
        expect(split.remote.sort()).toEqual(['diff', 'edge'])
        expect(split.previews).toEqual([])
    })

    it('asks the most recently seen runner page on that machine, never itself', () => {
        const peers = [
            { peerId: 'kiosk', machineId: 'asuz', role: 'runner', seenAt: 10 },
            { peerId: 'newer', machineId: 'asuz', role: 'runner', seenAt: 20 },
            { peerId: 'me', machineId: 'pc', role: 'runner', seenAt: 30 }
        ]
        expect(runnerOn(peers, 'asuz', 'me').peerId).toBe('newer')
        expect(runnerOn(peers, 'pc', 'me')).toBe(null)
    })

    it('lists each machine once, this one first', () => {
        const list = machinesIn(
            [{ machineId: 'asuz', machineName: 'asuz' }, { machineId: 'asuz', machineName: 'asuz' }, { machineId: 'pc', machineName: 'aylmo' }],
            { id: 'pc', name: 'aylmo' }
        )
        expect(list).toEqual([{ id: 'pc', name: 'aylmo', self: true }, { id: 'asuz', name: 'asuz', self: false }])
    })
})
