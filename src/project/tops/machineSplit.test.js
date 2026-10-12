import { describe, expect, it } from 'vitest'
import { cameraRefusal, splitNetwork } from './useTopNetwork.js'
import { canCapture, machinesIn, runnerOn } from './machineLink.js'

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

    // 2026-10-02: asuz's projector kiosk showed project `wall`; a viewer of
    // project `test` asked it (the newest page) for test's Camera In and got
    // nothing. And a page on plain http from another machine cannot open a
    // camera at all.
    it('asks the page that runs THIS project, and never one that runs only others', () => {
        const peers = [
            { peerId: 'kiosk', machineId: 'asuz', role: 'runner', seenAt: 30, projects: ['wall'], capture: true },
            { peerId: 'editor', machineId: 'asuz', role: 'runner', seenAt: 10, projects: ['test'], capture: true }
        ]
        expect(runnerOn(peers, 'asuz', 'me', { projectId: 'test' }).peerId).toBe('editor')
        expect(runnerOn(peers.slice(0, 1), 'asuz', 'me', { projectId: 'test' })).toBe(null)
    })

    it('for a camera, skips a page that cannot open one', () => {
        const peers = [
            { peerId: 'http-tab', machineId: 'asuz', role: 'runner', seenAt: 30, projects: ['test'], capture: false },
            { peerId: 'kiosk', machineId: 'asuz', role: 'runner', seenAt: 10, projects: ['test'], capture: true }
        ]
        expect(runnerOn(peers, 'asuz', 'me', { projectId: 'test', needsCapture: true }).peerId).toBe('kiosk')
        expect(runnerOn(peers, 'asuz', 'me', { projectId: 'test' }).peerId).toBe('http-tab')
    })

    it('keeps an older page that says nothing as a candidate, after the ones that said yes', () => {
        const old = { peerId: 'old', machineId: 'asuz', role: 'runner', seenAt: 30 }
        const says = { peerId: 'says', machineId: 'asuz', role: 'runner', seenAt: 10, projects: ['test'], capture: true }
        expect(runnerOn([old, says], 'asuz', 'me', { projectId: 'test', needsCapture: true }).peerId).toBe('says')
        expect(runnerOn([old], 'asuz', 'me', { projectId: 'test', needsCapture: true }).peerId).toBe('old')
    })

    it('never asks a page whose browser is on another computer', () => {
        const peers = [
            { peerId: 'visitor', machineId: 'asuz', role: 'runner', seenAt: 30, projects: ['test'], capture: true, away: true },
            { peerId: 'kiosk', machineId: 'asuz', role: 'runner', seenAt: 10, projects: ['test'], capture: true }
        ]
        expect(runnerOn(peers, 'asuz', 'me', { projectId: 'test', needsCapture: true }).peerId).toBe('kiosk')
        expect(runnerOn(peers.slice(0, 1), 'asuz', 'me', { projectId: 'test' })).toBe(null)
    })

    it('an away page is not that machine: no "this machine" card, and away pages add nothing', () => {
        const peers = [
            { peerId: 'visitor', machineId: 'asuz', machineName: 'asuz', away: true, devices: [{ kind: 'screen', id: 's', label: 'Screen' }] },
            { peerId: 'kiosk', machineId: 'asuz', machineName: 'asuz', devices: [{ kind: 'camera', id: 'c', label: 'USB2.0 HD UVC WebCam' }] }
        ]
        const list = machinesIn(peers, { id: 'asuz', name: 'asuz', away: true }, [{ kind: 'screen', id: 'mine', label: 'Screen' }])
        expect(list).toEqual([{ id: 'asuz', name: 'asuz', self: false, scripts: false, devices: [{ kind: 'camera', id: 'c', label: 'USB2.0 HD UVC WebCam' }], pages: 1 }])
    })

    it("an away page runs only what runs anywhere; the machine's operators come to it as pictures", () => {
        const net = { nodes: [{ id: 'cam', type: 'top.camera', values: { machine: 'asuz' } }, { id: 'blur', type: 'top.blur', values: {} }], wires: [{ from: 'cam', to: 'blur', port: 'a' }] }
        const split = splitNetwork(net, null)
        expect(split.local.map((node) => node.id)).toEqual(['blur'])
        expect(split.remote).toEqual(['cam'])
    })

    it('knows when this page can open a camera', () => {
        const api = { mediaDevices: { getUserMedia: () => {} } }
        expect(canCapture({ isSecureContext: true, navigator: api })).toBe(true)
        expect(canCapture({ isSecureContext: false, navigator: {} })).toBe(false)
        expect(canCapture({ isSecureContext: true, navigator: {} })).toBe(false)
    })

    it('lists each machine once, this one first', () => {
        const list = machinesIn(
            [{ machineId: 'asuz', machineName: 'asuz' }, { machineId: 'asuz', machineName: 'asuz' }, { machineId: 'pc', machineName: 'aylmo' }],
            { id: 'pc', name: 'aylmo' }
        )
        expect(list.map(({ id, name, self, pages }) => ({ id, name, self, pages }))).toEqual([{ id: 'pc', name: 'aylmo', self: true, pages: 1 }, { id: 'asuz', name: 'asuz', self: false, pages: 2 }])
    })
})

describe('what a machine has, as a person reads it', async () => {
    const { tidyDevices } = await import('./machineDevices.js')
    it('lists one sound chip once, and every camera as itself', () => {
        const tidy = tidyDevices([
            { kind: 'mic', id: '1', label: 'HDA Intel PCH, ALC269VB Analog-Direct hardware device without any conversions' },
            { kind: 'mic', id: '2', label: 'HDA Intel PCH, ALC269VB Analog-Default Audio Device' },
            { kind: 'speaker', id: '3', label: 'HDA Intel PCH, Optoma 1080P-Hardware device with all software conversions' },
            { kind: 'camera', id: '4', label: 'USB2.0 HD UVC WebCam' }
        ])
        expect(tidy.map((device) => `${device.kind}: ${device.label}`)).toEqual([
            'mic: HDA Intel PCH, ALC269VB Analog',
            'speaker: HDA Intel PCH, Optoma 1080P',
            'camera: USB2.0 HD UVC WebCam'
        ])
    })
})

describe('why a Camera In shows nothing', () => {
    it('names the plain-http page, a refusal, a missing camera — and nothing when it opened', () => {
        expect(cameraRefusal({ secure: false, hasApi: false })).toMatch(/plain http from another machine/)
        expect(cameraRefusal({ hasApi: false })).toMatch(/no camera access/)
        expect(cameraRefusal({ errorName: 'NotAllowedError' })).toMatch(/not allowed/)
        expect(cameraRefusal({ errorName: 'NotFoundError' })).toMatch(/No camera found/)
        expect(cameraRefusal({ errorName: 'NotReadableError' })).toMatch(/busy/)
        expect(cameraRefusal({})).toBe(null)
    })
})
