// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createMachineHub, viaFollower, viaLink } = require('./hub.js')

const HERE = { id: 'machine-here', name: 'aylmo' }
const SPACE = 'shared-room'

const clock = (start = 1_000_000) => {
    let at = start
    return { now: () => at, advance: (ms) => { at += ms } }
}

describe('machine hub peers', () => {
    it('registers a local tab with this machine, and refreshes it on a second hello', () => {
        const time = clock()
        const hub = createMachineHub({ now: time.now })
        expect(hub.hello(SPACE, { peerId: 'tab-1', role: 'editor', machine: HERE }).peer).toMatchObject({
            peerId: 'tab-1', machineId: HERE.id, machineName: 'aylmo', role: 'editor', via: 'local'
        })
        time.advance(20_000)
        hub.hello(SPACE, { peerId: 'tab-1', machine: HERE })
        time.advance(20_000)
        expect(hub.listPeers(SPACE).map(peer => peer.peerId)).toEqual(['tab-1'])
    })

    it('forgets a peer not seen for 30s, and its mailbox with it', () => {
        const time = clock()
        const hub = createMachineHub({ now: time.now })
        hub.hello(SPACE, { peerId: 'tab-1', machine: HERE })
        hub.deliver(SPACE, 'tab-1', { from: 'x', to: 'tab-1', payload: { sdp: 1 } })
        time.advance(29_000)
        expect(hub.touch(SPACE, 'tab-1')).toBe(true)
        time.advance(30_001)
        expect(hub.listPeers(SPACE)).toEqual([])
        expect(hub.drain(SPACE, 'tab-1')).toEqual([])
        expect(hub.touch(SPACE, 'tab-1')).toBe(false)
    })

    it('refuses the 51st peer in a space but lets a known one refresh', () => {
        const hub = createMachineHub()
        for (let i = 0; i < 50; i += 1) expect(hub.hello(SPACE, { peerId: `tab-${i}`, machine: HERE }).peer).toBeTruthy()
        expect(hub.hello(SPACE, { peerId: 'tab-50', machine: HERE })).toMatchObject({ status: 429 })
        expect(hub.hello(SPACE, { peerId: 'tab-3', machine: HERE }).peer).toBeTruthy()
        expect(hub.hello('other-room', { peerId: 'tab-50', machine: HERE }).peer).toBeTruthy()
    })

    it('rejects a peer id that is not an id', () => {
        const hub = createMachineHub()
        expect(hub.hello(SPACE, { peerId: '', machine: HERE }).status).toBe(400)
        expect(hub.hello(SPACE, { peerId: 'a b', machine: HERE }).status).toBe(400)
        expect(hub.hello(SPACE, { peerId: 'x'.repeat(129), machine: HERE }).status).toBe(400)
    })

    it('replaces what one route said with what it says now, and never overwrites a local tab', () => {
        const hub = createMachineHub()
        hub.hello(SPACE, { peerId: 'mine', machine: HERE })
        const via = viaLink('http://host')
        hub.recordRemotePeers(SPACE, via, [
            { peerId: 'there-1', machineId: 'machine-host', machineName: 'asuz' },
            { peerId: 'there-2', machineId: 'machine-host', machineName: 'asuz' },
            { peerId: 'mine', machineId: 'machine-host', machineName: 'asuz' }
        ])
        expect(hub.listPeers(SPACE).map(peer => [peer.peerId, peer.via, peer.machineName])).toEqual([
            ['mine', 'local', 'aylmo'],
            ['there-1', via, 'asuz'],
            ['there-2', via, 'asuz']
        ])
        hub.recordRemotePeers(SPACE, via, [{ peerId: 'there-2', machineId: 'machine-host', machineName: 'asuz' }])
        expect(hub.listPeers(SPACE).map(peer => peer.peerId)).toEqual(['mine', 'there-2'])
        expect(hub.localPeers(SPACE).map(peer => peer.peerId)).toEqual(['mine'])
    })

    it('lists peers for a follower without its own', () => {
        const hub = createMachineHub()
        hub.hello(SPACE, { peerId: 'host-tab', machine: HERE })
        hub.recordRemotePeers(SPACE, viaFollower('f1'), [{ peerId: 'f1-tab', machineId: 'f1', machineName: 'one' }])
        hub.recordRemotePeers(SPACE, viaFollower('f2'), [{ peerId: 'f2-tab', machineId: 'f2', machineName: 'two' }])
        expect(hub.listPeers(SPACE, { excludeVia: viaFollower('f1'), excludeMachineId: 'f1' }).map(peer => peer.peerId))
            .toEqual(['host-tab', 'f2-tab'])
    })
})

describe('machine hub mailboxes', () => {
    it('drains in order and empties the mailbox', () => {
        const hub = createMachineHub()
        hub.hello(SPACE, { peerId: 'tab', machine: HERE })
        hub.deliver(SPACE, 'tab', { from: 'a', to: 'tab', payload: 1 })
        hub.deliver(SPACE, 'tab', { from: 'b', to: 'tab', payload: 2 })
        expect(hub.drain(SPACE, 'tab').map(message => message.payload)).toEqual([1, 2])
        expect(hub.drain(SPACE, 'tab')).toEqual([])
    })

    it('keeps the newest 200 messages', () => {
        const hub = createMachineHub()
        hub.hello(SPACE, { peerId: 'tab', machine: HERE })
        for (let i = 0; i < 205; i += 1) hub.deliver(SPACE, 'tab', { from: 'a', to: 'tab', payload: i })
        const messages = hub.drain(SPACE, 'tab')
        expect(messages).toHaveLength(200)
        expect(messages[0].payload).toBe(5)
        expect(messages[199].payload).toBe(204)
    })

    it('refuses a payload over 64 KB, and one that is not JSON', () => {
        const hub = createMachineHub()
        expect(hub.checkPayload({ sdp: 'x'.repeat(1000) })).toEqual({ ok: true })
        expect(hub.checkPayload({ sdp: 'x'.repeat(64 * 1024) })).toMatchObject({ status: 413 })
        expect(hub.checkPayload(undefined)).toMatchObject({ status: 400 })
        const loop = {}
        loop.self = loop
        expect(hub.checkPayload(loop)).toMatchObject({ status: 400 })
    })

    it('wakes a held read the moment a message lands', async () => {
        const hub = createMachineHub()
        hub.hello(SPACE, { peerId: 'tab', machine: HERE })
        const startedAt = Date.now()
        const held = hub.wait(SPACE, 'tab', 5000)
        setTimeout(() => hub.deliver(SPACE, 'tab', { from: 'a', to: 'tab', payload: 'offer' }), 50)
        expect(await held).toBe(true)
        expect(Date.now() - startedAt).toBeLessThan(2000)
        expect(hub.drain(SPACE, 'tab').map(message => message.payload)).toEqual(['offer'])
    })

    it('lets a held read run out when nothing lands, and never wakes another hub', async () => {
        const one = createMachineHub()
        const two = createMachineHub()
        const held = one.wait(SPACE, 'tab', 100)
        two.hello(SPACE, { peerId: 'tab', machine: HERE })
        two.deliver(SPACE, 'tab', { from: 'a', to: 'tab', payload: 1 })
        expect(await held).toBe(false)
    })

    it('keeps a follower server mailbox only while that server keeps calling', () => {
        const time = clock()
        const hub = createMachineHub({ now: time.now })
        hub.noteServer(SPACE, 'f1')
        hub.recordRemotePeers(SPACE, viaFollower('f1'), [{ peerId: 'f1-tab', machineId: 'f1', machineName: 'one' }])
        hub.deliver(SPACE, 'server:f1', { from: 'a', to: 'f1-tab', payload: 1 })
        time.advance(31_000)
        hub.listPeers(SPACE)
        expect(hub.drain(SPACE, 'server:f1')).toEqual([])
    })
})

describe('machine hub routing', () => {
    it('sends to a local tab, queues for a follower, forwards to the host, and knows nobody else', () => {
        const hub = createMachineHub()
        const link = { base: 'http://host/serverXR', spaceId: SPACE, token: 'dii_sync_x' }
        hub.setLink(SPACE, link)
        hub.hello(SPACE, { peerId: 'here', machine: HERE })
        hub.noteServer(SPACE, 'f1')
        hub.recordRemotePeers(SPACE, viaFollower('f1'), [{ peerId: 'on-follower', machineId: 'f1', machineName: 'one' }])
        hub.recordRemotePeers(SPACE, viaLink(link.base), [{ peerId: 'on-host', machineId: 'h', machineName: 'asuz' }])

        expect(hub.route(SPACE, 'here')).toEqual({ kind: 'local', key: 'here' })
        expect(hub.route(SPACE, 'on-follower')).toEqual({ kind: 'server', key: 'server:f1', machineId: 'f1' })
        expect(hub.route(SPACE, 'on-host')).toEqual({ kind: 'forward', link, remote: link.base })
        expect(hub.route(SPACE, 'nobody')).toBeNull()
        expect(hub.route('another-room', 'here')).toBeNull()
    })

    it('forgets the host and everyone there when the follow ends', () => {
        const hub = createMachineHub()
        const link = { base: 'http://host/serverXR', spaceId: SPACE, token: null }
        hub.setLink(SPACE, link)
        hub.hello(SPACE, { peerId: 'here', machine: HERE })
        hub.recordRemotePeers(SPACE, viaLink(link.base), [{ peerId: 'on-host', machineId: 'h', machineName: 'asuz' }])
        hub.forgetLink(SPACE)
        expect(hub.linkFor(SPACE)).toBeNull()
        expect(hub.route(SPACE, 'on-host')).toBeNull()
        expect(hub.listPeers(SPACE).map(peer => peer.peerId)).toEqual(['here'])
    })
})

describe('what a machine has', () => {
    it('keeps a plain, capped device list and drops anything it does not know', () => {
        const { cleanDevices } = require('./hub')
        const devices = cleanDevices([
            { kind: 'camera', id: 'abc', label: 'USB2.0 HD UVC WebCam', secret: 'x' },
            { kind: 'screen', id: 'screen-0', label: 'Screen', width: 1366.4, height: 768 },
            { kind: 'toaster', id: 'nope' },
            null
        ])
        expect(devices).toEqual([
            { kind: 'camera', id: 'abc', label: 'USB2.0 HD UVC WebCam' },
            { kind: 'screen', id: 'screen-0', label: 'Screen', width: 1366, height: 768 }
        ])
        expect(cleanDevices(Array.from({ length: 50 }, (_, i) => ({ kind: 'mic', id: `m${i}` })))).toHaveLength(32)
    })

    it('caps each KIND on its own, so thirty NDI sources cannot push out the screens', () => {
        const { cleanDevices } = require('./hub')
        // A festival LAN advertising thirty NDI sources is an ordinary night.
        // Under the old single ceiling of 32 they would have pushed out
        // whatever came after them — and readMachineDevices appends the
        // screens before the NDI sources, so what went missing would have been
        // the panel sizes the desk lays a wall out from.
        const devices = cleanDevices([
            ...Array.from({ length: 30 }, (_, i) => ({ kind: 'ndi', id: `n${i}`, label: `SENDER ${i}` })),
            { kind: 'camera', id: 'c', label: 'HD Webcam' },
            { kind: 'screen', id: 'screen-0', label: 'Screen', width: 1920, height: 1080 },
            { kind: 'screen', id: 'screen-1', label: 'Projector', width: 1280, height: 800 }
        ])
        expect(devices.filter(device => device.kind === 'ndi')).toHaveLength(30)
        expect(devices.filter(device => device.kind === 'screen').map(device => device.label))
            .toEqual(['Screen', 'Projector'])
        expect(devices.filter(device => device.kind === 'camera')).toHaveLength(1)
    })

    it('still bounds one kind, and the whole message', () => {
        const { cleanDevices, MAX_DEVICES, MAX_DEVICES_TOTAL } = require('./hub')
        expect(cleanDevices(Array.from({ length: 200 }, (_, i) => ({ kind: 'ndi', id: `n${i}` })))).toHaveLength(MAX_DEVICES)
        const everything = ['camera', 'mic', 'speaker', 'screen', 'midi-in', 'midi-out', 'ndi']
            .flatMap(kind => Array.from({ length: 40 }, (_, i) => ({ kind, id: `${kind}${i}` })))
        expect(cleanDevices(everything)).toHaveLength(MAX_DEVICES_TOTAL)
    })

    it('knows an NDI source as a kind of its own', () => {
        const { cleanDevices } = require('./hub')
        expect(cleanDevices([{ kind: 'ndi', id: 'AYLMO (td_out_windows)', label: 'AYLMO (td_out_windows)' }]))
            .toEqual([{ kind: 'ndi', id: 'AYLMO (td_out_windows)', label: 'AYLMO (td_out_windows)' }])
    })
})
