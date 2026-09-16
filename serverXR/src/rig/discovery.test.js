import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiscovery, broadcastAddress, sign, verify } from './discovery.js'
import { createMembers } from './members.js'

// A fake dgram socket: an EventEmitter that records every send() and lets a
// test drive bind()/message/error by hand, standing in for the real UDP
// stack per the lead's instructions (real sockets can't reach each other
// over loopback with different ports in CI).
class FakeSocket extends EventEmitter {
    constructor({ bindError } = {}) {
        super()
        this.sends = []
        this.closed = false
        this.broadcast = false
        this.bindError = bindError
    }

    bind(port) {
        this.boundPort = port
        if (this.bindError) {
            this.emit('error', this.bindError)
            return
        }
        this.emit('listening')
    }

    setBroadcast(v) {
        this.broadcast = v
    }

    send(buf, offset, length, port, address, cb) {
        this.sends.push({ json: JSON.parse(buf.toString('utf8')), port, address })
        if (cb) cb(null)
    }

    close() {
        this.closed = true
    }
}

const fakeDgram = (socketOpts) => {
    const sockets = []
    return {
        sockets,
        createSocket: () => {
            const s = new FakeSocket(socketOpts)
            sockets.push(s)
            return s
        }
    }
}

const twoInterfaces = () => ({
    eth0: [{ address: '192.168.88.231', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true }]
})

afterEach(() => {
    vi.useRealTimers()
})

describe('broadcastAddress', () => {
    it('computes the directed broadcast from address + netmask', () => {
        expect(broadcastAddress('192.168.88.231', '255.255.255.0')).toBe('192.168.88.255')
        expect(broadcastAddress('10.0.0.5', '255.255.0.0')).toBe('10.0.255.255')
    })

    it('returns null for garbage input instead of throwing', () => {
        expect(broadcastAddress('not-an-ip', '255.255.255.0')).toBeNull()
        expect(broadcastAddress(undefined, undefined)).toBeNull()
    })
})

describe('sign / verify', () => {
    it('round-trips, and rejects a tampered body or wrong key', () => {
        const body = JSON.stringify({ a: 1 })
        const sig = sign('secret', body)
        expect(verify('secret', body, sig)).toBe(true)
        expect(verify('secret', JSON.stringify({ a: 2 }), sig)).toBe(false)
        expect(verify('other-secret', body, sig)).toBe(false)
        expect(verify('secret', body, 'not-hex-and-wrong-length')).toBe(false)
        expect(verify('secret', body, undefined)).toBe(false)
    })
})

describe('createDiscovery', () => {
    const baseOpts = () => ({
        identity: { id: 'self-1', name: 'aylmo' },
        release: '0.5.0',
        room: null,
        port: 4000,
        base: '/serverXR',
        udpPort: 47600,
        intervalMs: 5000
    })

    it('start() sends a §6 packet on start and again every intervalMs, only to directed broadcast addresses of up non-internal IPv4 interfaces', () => {
        vi.useFakeTimers()
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const discovery = createDiscovery({
            ...baseOpts(),
            members,
            sayHello: vi.fn(),
            interfaces: twoInterfaces,
            dgram: { createSocket },
            now: () => 1000
        })

        discovery.start()
        const socket = sockets[0]
        expect(socket.broadcast).toBe(true)
        expect(socket.sends).toHaveLength(1)
        expect(socket.sends[0].address).toBe('192.168.88.255') // lo is internal, never targeted
        expect(socket.sends[0].port).toBe(47600)
        expect(socket.sends[0].json).toMatchObject({
            rig: 1, t: 'here', id: 'self-1', name: 'aylmo', release: '0.5.0',
            room: null, port: 4000, base: '/serverXR', sentAt: 1000
        })

        vi.advanceTimersByTime(5000)
        expect(socket.sends).toHaveLength(2)

        discovery.stop()
        vi.advanceTimersByTime(20000)
        expect(socket.sends).toHaveLength(2) // stop() cancels the interval
        expect(socket.closed).toBe(true)

        // idempotent
        expect(() => discovery.stop()).not.toThrow()
    })

    it('signs outbound packets when a key is set, and the signature verifies against the packet minus sig', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const discovery = createDiscovery({
            ...baseOpts(),
            key: 'room-secret',
            members,
            sayHello: vi.fn(),
            interfaces: twoInterfaces,
            dgram: { createSocket }
        })

        discovery.start()
        const { json } = sockets[0].sends[0]
        expect(typeof json.sig).toBe('string')
        const { sig, ...rest } = json
        expect(verify('room-secret', JSON.stringify(rest), sig)).toBe(true)
    })

    it('ignores its own id on receive', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const discovery = createDiscovery({
            ...baseOpts(), members, sayHello: vi.fn(), interfaces: () => ({}), dgram: { createSocket }
        })
        discovery.start()
        const socket = sockets[0]

        const packet = Buffer.from(JSON.stringify({ rig: 1, t: 'here', id: 'self-1', name: 'x', room: null, port: 1, base: '/x', sentAt: 0 }))
        socket.emit('message', packet, { address: '192.168.1.5' })

        expect(members.list()).toEqual([])
        expect(discovery.stats().received).toBe(1)
        expect(discovery.stats().malformed).toBe(0)
    })

    it('counts a different room and never files it as a member', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const discovery = createDiscovery({
            ...baseOpts(), room: 'studio', members, sayHello: vi.fn(), interfaces: () => ({}), dgram: { createSocket }
        })
        discovery.start()
        const socket = sockets[0]

        const packet = Buffer.from(JSON.stringify({ rig: 1, t: 'here', id: 'other-1', name: 'x', room: 'stage', port: 1, base: '/x', sentAt: 0 }))
        socket.emit('message', packet, { address: '192.168.1.5' })

        expect(members.list()).toEqual([])
        expect(discovery.stats().otherRoom).toBe(1)
    })

    it('drops a packet with a bad signature and counts it, without filing a member', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const sayHello = vi.fn()
        const discovery = createDiscovery({
            ...baseOpts(), key: 'room-secret', members, sayHello, interfaces: () => ({}), dgram: { createSocket }
        })
        discovery.start()
        const socket = sockets[0]

        const body = { rig: 1, t: 'here', id: 'other-1', name: 'x', room: null, port: 1, base: '/x', sentAt: 0 }
        const packet = { ...body, sig: sign('wrong-secret', JSON.stringify(body)) }
        socket.emit('message', Buffer.from(JSON.stringify(packet)), { address: '192.168.1.5' })

        expect(members.list()).toEqual([])
        expect(discovery.stats().badSig).toBe(1)
        expect(sayHello).not.toHaveBeenCalled()
    })

    it('accepts a correctly signed packet from an unknown id and files a member', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const sayHello = vi.fn(() => Promise.resolve())
        const discovery = createDiscovery({
            ...baseOpts(), key: 'room-secret', members, sayHello, interfaces: () => ({}), dgram: { createSocket }
        })
        discovery.start()
        const socket = sockets[0]

        const body = { rig: 1, t: 'here', id: 'other-1', name: 'stage-box', room: null, port: 4001, base: '/serverXR', sentAt: 0 }
        const packet = { ...body, sig: sign('room-secret', JSON.stringify(body)) }
        socket.emit('message', Buffer.from(JSON.stringify(packet)), { address: '192.168.1.5' })

        expect(discovery.stats().badSig).toBe(0)
        const entry = members.get('other-1')
        expect(entry).toMatchObject({
            machine: { id: 'other-1', name: 'stage-box' },
            address: '192.168.1.5',
            http: { port: 4001, base: '/serverXR' },
            via: 'discovery'
        })
    })

    it('never throws on malformed input: bad JSON, oversize, or missing id', () => {
        const { createSocket, sockets } = fakeDgram()
        const members = createMembers({ now: () => 0 })
        const discovery = createDiscovery({
            ...baseOpts(), members, sayHello: vi.fn(), interfaces: () => ({}), dgram: { createSocket }
        })
        discovery.start()
        const socket = sockets[0]

        expect(() => socket.emit('message', Buffer.from('not json{{{'), { address: '1.2.3.4' })).not.toThrow()
        expect(() => socket.emit('message', Buffer.from(JSON.stringify({ rig: 1, t: 'here' })), { address: '1.2.3.4' })).not.toThrow()
        expect(() => socket.emit('message', Buffer.from('x'.repeat(2000)), { address: '1.2.3.4' })).not.toThrow()

        expect(discovery.stats().malformed).toBe(3)
        expect(members.list()).toEqual([])
    })

    it('sayHello fires once per new id, then debounces for 10s, and errors are counted not thrown', async () => {
        vi.useFakeTimers()
        const { createSocket, sockets } = fakeDgram()
        let t = 0
        const now = () => t
        const members = createMembers({ now })
        const sayHello = vi.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('unreachable')))
            .mockImplementation(() => Promise.resolve())
        const discovery = createDiscovery({
            ...baseOpts(), members, sayHello, interfaces: () => ({}), dgram: { createSocket }, now
        })
        discovery.start()
        const socket = sockets[0]

        const send = (id) => socket.emit(
            'message',
            Buffer.from(JSON.stringify({ rig: 1, t: 'here', id, name: 'x', room: null, port: 1, base: '/x', sentAt: t })),
            { address: '192.168.1.9' }
        )

        send('new-1')
        await vi.advanceTimersByTimeAsync(0) // let the rejected sayHello promise settle
        expect(sayHello).toHaveBeenCalledTimes(1)
        expect(discovery.stats().sayHelloErrors).toBe(1)

        // A second packet arrives immediately — inside the 10s debounce window.
        send('new-1')
        await vi.advanceTimersByTimeAsync(0)
        expect(sayHello).toHaveBeenCalledTimes(1)

        // Past the debounce window, a fresh sighting says hello again.
        t = 10001
        send('new-1')
        await vi.advanceTimersByTimeAsync(0)
        expect(sayHello).toHaveBeenCalledTimes(2)
    })

    it('calls members.expire() on every tick, dropping stale members (leave)', () => {
        vi.useFakeTimers()
        const { createSocket } = fakeDgram()
        let t = 0
        const now = () => t
        const members = createMembers({ now, ttlMs: 20000 })
        const onLeave = vi.fn()
        members.on('leave', onLeave)
        members.upsert({ machine: { id: 'stale-1', name: 'x' } }, { via: 'discovery' })

        const discovery = createDiscovery({
            ...baseOpts(), members, sayHello: vi.fn(), interfaces: () => ({}), dgram: { createSocket }, now, intervalMs: 5000
        })
        discovery.start() // tick #1 at t=0: not yet stale
        expect(members.get('stale-1')).toBeDefined()

        t = 25000
        vi.advanceTimersByTime(5000) // next tick runs expire() at t=25000
        expect(members.get('stale-1')).toBeUndefined()
        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    it('on EADDRINUSE, logs once, counts it, and keeps the server alive instead of throwing', () => {
        const bindError = Object.assign(new Error('address in use'), { code: 'EADDRINUSE' })
        const { createSocket } = fakeDgram({ bindError })
        const members = createMembers({ now: () => 0 })
        const logger = { error: vi.fn(), warn: vi.fn() }
        const discovery = createDiscovery({
            ...baseOpts(), members, sayHello: vi.fn(), interfaces: () => ({}), dgram: { createSocket }, logger
        })

        expect(() => discovery.start()).not.toThrow()
        expect(discovery.stats().bindError).toBe(1)
        expect(logger.error).toHaveBeenCalledTimes(1)
        expect(() => discovery.stop()).not.toThrow()
    })
})

describe('createDiscovery — real socket', () => {
    it('start() binds a real UDP socket and stop() closes it cleanly', async () => {
        const identity = { id: 'real-1', name: 'loopback-test' }
        const members = createMembers({ now: () => Date.now() })
        const discovery = createDiscovery({
            identity,
            release: '0.5.0',
            room: null,
            port: 4000,
            base: '/serverXR',
            udpPort: 0, // let the OS pick a free port — no fixed port to collide with in CI
            members,
            sayHello: vi.fn(),
            interfaces: () => ({}), // no targets: this test proves bind/close, not broadcast
            intervalMs: 60000
        })

        discovery.start()
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(discovery.stats().bindError).toBe(0)

        expect(() => discovery.stop()).not.toThrow()
        expect(() => discovery.stop()).not.toThrow() // idempotent
    })
})
