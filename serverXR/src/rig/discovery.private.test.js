// Discovery's private mode and the private beacon (PROTOCOL-1.md amendment
// 2026-09-24): a copy bound to the network with its device routes closed
// listens, beacons "here but private", and never pairs; an open copy that
// hears the beacon lists it as nearby, never as a member.
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createDiscovery } from './discovery.js'
import { createMembers } from './members.js'
import { createNearby } from './visibility.js'

class FakeSocket extends EventEmitter {
    constructor() { super(); this.sends = []; this.closed = false }
    bind() { this.emit('listening') }
    setBroadcast() {}
    send(buf, _o, _l, port, address, cb) { this.sends.push({ json: JSON.parse(buf.toString('utf8')), port, address }); cb?.(null) }
    close() { this.closed = true }
}
const fakeDgram = () => {
    const sockets = []
    return { sockets, createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s } }
}
const lan = () => ({ eth0: [{ address: '192.168.88.125', netmask: '255.255.255.0', family: 'IPv4', internal: false }] })
const tick = () => new Promise((resolve) => setImmediate(resolve))
const packet = (body) => Buffer.from(JSON.stringify(body))

const boot = ({ mode, room = null, key = null } = {}) => {
    const dgram = fakeDgram()
    const members = createMembers({ now: () => 0, selfId: 'self' })
    const nearby = createNearby({ now: () => 0 })
    const sayHello = vi.fn(async () => null)
    const discovery = createDiscovery({
        identity: { id: 'self', name: 'ponyo' },
        release: '0.5.0',
        room,
        key,
        port: 4000,
        base: '/serverXR',
        members,
        nearby,
        sayHello,
        mode,
        interfaces: lan,
        dgram,
        now: () => 1000
    })
    discovery.start()
    return { discovery, socket: dgram.sockets[0], members, nearby, sayHello }
}

describe('private mode', () => {
    it('sends only the private beacon: no top-level id, no port, no base — nothing to dial', () => {
        const { socket } = boot({ mode: 'private' })
        expect(socket.sends).toHaveLength(1)
        const { json, address, port } = socket.sends[0]
        expect(address).toBe('192.168.88.255')
        expect(port).toBe(47600)
        expect(json).toEqual({ rig: 1, t: 'private', machine: { id: 'self', name: 'ponyo' }, release: '0.5.0', sentAt: 1000 })
    })

    it('a 0.4.x reader (id required, `t` never read) drops the beacon as malformed instead of filing a member', () => {
        const { socket } = boot({ mode: 'private' })
        const beacon = socket.sends[0].json
        // The whole of the old reader's acceptance test, discovery.js before 2026-09-24:
        const oldReaderAccepts = (p) => Boolean(p && typeof p === 'object' && typeof p.id === 'string' && p.id)
        expect(oldReaderAccepts(beacon)).toBe(false)
    })

    it('hears an open copy as nearby, never files it as a member and never dials it', async () => {
        const { socket, members, nearby, sayHello, discovery } = boot({ mode: 'private' })
        socket.emit('message', packet({ rig: 1, t: 'here', id: 'aylmo-id', name: 'aylmo', release: '0.4.16', room: null, port: 443, base: '/serverXR', sentAt: 1 }), { address: '192.168.88.231' })
        expect(members.list()).toEqual([])
        await tick()
        expect(sayHello).not.toHaveBeenCalled()
        expect(nearby.list()).toEqual([expect.objectContaining({ id: 'aylmo-id', name: 'aylmo', address: '192.168.88.231', open: true, via: 'here' })])
        expect(discovery.stats().heardWhilePrivate).toBe(1)
    })
})

describe('open mode hearing a private beacon', () => {
    it('lists it as nearby and private, never as a member, never dials it', () => {
        const { socket, members, nearby, sayHello, discovery } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, t: 'private', machine: { id: 'ponyo-id', name: 'ponyo' }, release: '0.5.0', sentAt: 1 }), { address: '192.168.88.125' })
        expect(members.list()).toEqual([])
        expect(sayHello).not.toHaveBeenCalled()
        expect(nearby.list()).toEqual([expect.objectContaining({ id: 'ponyo-id', name: 'ponyo', address: '192.168.88.125', open: false, via: 'beacon' })])
        expect(discovery.stats().heardPrivate).toBe(1)
    })

    it('hears the beacon whatever room it keeps, and without a signature, since it asks nothing', () => {
        const { socket, nearby } = boot({ mode: 'open', room: 'stage', key: 'secret' })
        socket.emit('message', packet({ rig: 1, t: 'private', machine: { id: 'p' }, sentAt: 1 }), { address: '10.0.0.9' })
        expect(nearby.list()).toHaveLength(1)
    })

    it('a private copy that opens up moves from nearby to the member list', async () => {
        const { socket, members, nearby, sayHello } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, t: 'private', machine: { id: 'p', name: 'ponyo' }, sentAt: 1 }), { address: '192.168.88.125' })
        socket.emit('message', packet({ rig: 1, t: 'here', id: 'p', name: 'ponyo', room: null, port: 4000, base: '/serverXR', sentAt: 2 }), { address: '192.168.88.125' })
        expect(nearby.list()).toEqual([])
        expect(members.list().map((m) => m.machine.id)).toEqual(['p'])
        await tick()
        expect(sayHello).toHaveBeenCalledTimes(1)
    })

    it('ignores its own beacon, and counts a beacon without a machine id as malformed', () => {
        const { socket, nearby, discovery } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, t: 'private', machine: { id: 'self' } }), { address: '192.168.88.125' })
        socket.emit('message', packet({ rig: 1, t: 'private' }), { address: '192.168.88.125' })
        expect(nearby.list()).toEqual([])
        expect(discovery.stats().malformed).toBe(1)
    })
})

describe('tolerance (§4): a packet kind this reader does not know', () => {
    it('is counted and ignored — not read as `here`', () => {
        const { socket, members, sayHello, discovery } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, t: 'from-the-future', id: 'x', room: null, port: 1, base: '/x' }), { address: '192.168.88.9' })
        expect(members.list()).toEqual([])
        expect(sayHello).not.toHaveBeenCalled()
        expect(discovery.stats().unknownKind).toBe(1)
    })

    it('a packet with no `t` is still `here`, as every sender before §6 was written may have sent', () => {
        const { socket, members } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, id: 'old', room: null, port: 4000, base: '/serverXR' }), { address: '192.168.88.9' })
        expect(members.list().map((m) => m.machine.id)).toEqual(['old'])
    })

    it('hands sayHello the announcer\'s id and name, so a refusal can be said by name', async () => {
        const { socket, sayHello } = boot({ mode: 'open' })
        socket.emit('message', packet({ rig: 1, t: 'here', id: 'win', name: 'DESKTOP', room: null, port: 4000, base: '/serverXR' }), { address: '192.168.88.140' })
        await tick()
        expect(sayHello).toHaveBeenCalledWith('192.168.88.140', 4000, '/serverXR', expect.objectContaining({ id: 'win', name: 'DESKTOP' }))
    })
})
