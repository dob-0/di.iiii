// @vitest-environment node
//
// Follow by NAME (docs/ai/team-sync-by-network-name.md §8): one resolver, three
// routes in a fixed order, and the name kept for the certificate check. No real
// network: the beacon, DNS and the clock are supplied here; the one UDP test is
// loopback on an ephemeral port.
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { isLabel, networkName, nameBase, labelOfBase, readZone, resolveName, withPort, reresolver, DEFAULT_ZONE } = require('./nameResolve.js')
const beacon = require('./beacon.js')

const heard = (address, port = 443) => async () => ({ address, port })
const silent = async () => null
const dnsAnswers = (...addresses) => async () => addresses
const dnsEmpty = async () => []

describe('what counts as a network name', () => {
    it('a bare label is one; a scheme, a dot, a slash or a port is an address', () => {
        expect(isLabel('dob-a3f9')).toBe(true)
        expect(isLabel('ponyo-k7q2')).toBe(true)
        for (const typed of ['https://dob-a3f9', 'dob-a3f9.di-studio.xyz', '192.168.1.5', 'dob-a3f9:443', 'a/b', 'Dob_a3', '', '-x', null, undefined]) {
            expect(isLabel(typed), String(typed)).toBe(false)
        }
    })

    it('adds the zone, and a port only when it is not 443', () => {
        expect(networkName('dob-a3f9')).toBe(`dob-a3f9.${DEFAULT_ZONE}`)
        expect(nameBase('dob-a3f9', 'z.example')).toBe('https://dob-a3f9.z.example')
        expect(nameBase('dob-a3f9', 'z.example', 8443)).toBe('https://dob-a3f9.z.example:8443')
        expect(labelOfBase('https://dob-a3f9.z.example:8443/serverXR', 'z.example')).toEqual({ label: 'dob-a3f9', port: 8443 })
        expect(labelOfBase('https://other.example', 'z.example')).toBeNull()
    })

    it('the zone comes from DI_NAME_ZONE, else the default (name.json belongs to `di name`)', () => {
        expect(readZone({ env: { DI_NAME_ZONE: 'Zone.Example' }, home: '/nonexistent-di-home' })).toBe('zone.example')
        expect(readZone({ env: {}, home: '/nonexistent-di-home' })).toBe(DEFAULT_ZONE)
    })
})

describe('the resolver order: beacon, then DNS, then the last address', () => {
    it('the beacon wins when it is heard, with the port it announced', async () => {
        const found = await resolveName({ label: 'dob-a3f9', zone: 'z.example', beacon: heard('192.168.15.53', 8443), lookup: dnsAnswers('10.0.0.9'), last: { address: '10.1.1.1' } })
        expect(found).toMatchObject({ ok: true, route: 'beacon', address: '192.168.15.53', port: 8443, name: 'dob-a3f9.z.example' })
    })

    it('DNS answers when no beacon is heard', async () => {
        const found = await resolveName({ label: 'dob-a3f9', zone: 'z.example', beacon: silent, lookup: dnsAnswers('192.168.15.53'), last: { address: '10.1.1.1' } })
        expect(found).toMatchObject({ ok: true, route: 'dns', address: '192.168.15.53', port: 443 })
    })

    it('the last address that worked answers when neither does (the internet cut, the beacon missed)', async () => {
        const found = await resolveName({ label: 'dob-a3f9', zone: 'z.example', beacon: silent, lookup: dnsEmpty, last: { address: '192.168.15.53', port: 8443 } })
        expect(found).toMatchObject({ ok: true, route: 'last', address: '192.168.15.53', port: 8443 })
        expect(await resolveName({ label: 'x', beacon: silent, lookup: dnsEmpty, last: '192.168.1.2' })).toMatchObject({ ok: true, route: 'last', address: '192.168.1.2' })
    })

    it('says what it tried, in order, when nothing answers', async () => {
        expect(await resolveName({ label: 'dob-a3f9', zone: 'z.example', beacon: silent, lookup: dnsEmpty }))
            .toEqual({ ok: false, tried: ['beacon', 'dns', 'last'], name: 'dob-a3f9.z.example' })
    })

    it('a broker record pointing at loopback means "not shared", never an address to pin to', async () => {
        const found = await resolveName({ label: 'dob-a3f9', beacon: silent, lookup: dnsAnswers('127.0.0.1', '::1'), last: null })
        expect(found.ok).toBe(false)
    })

    it('a beacon that throws, or says something that is not an address, is skipped', async () => {
        const boom = async () => { throw new Error('socket') }
        expect(await resolveName({ label: 'a', beacon: boom, lookup: dnsAnswers('192.168.1.7') })).toMatchObject({ route: 'dns' })
        expect(await resolveName({ label: 'a', beacon: heard('not-an-ip'), lookup: dnsAnswers('192.168.1.7') })).toMatchObject({ route: 'dns' })
    })

    it('asks the beacon for THIS label, for a bounded time', async () => {
        const beaconSpy = vi.fn(async () => null)
        await resolveName({ label: 'dob-a3f9', beacon: beaconSpy, lookup: dnsEmpty, beaconMs: 1500 })
        expect(beaconSpy).toHaveBeenCalledWith({ label: 'dob-a3f9', timeoutMs: 1500 })
    })
})

describe('the beacon', () => {
    it('round-trips { v, kind, label, port } and refuses everything else', () => {
        expect(beacon.parse(beacon.encode({ label: 'dob-a3f9', port: 8443 }))).toEqual({ label: 'dob-a3f9', port: 8443 })
        expect(beacon.parse(Buffer.from('not json'))).toBeNull()
        expect(beacon.parse(Buffer.from(JSON.stringify({ v: 2, kind: 'share', label: 'a', port: 1 })))).toBeNull()
        expect(beacon.parse(Buffer.from(JSON.stringify({ v: 1, kind: 'other', label: 'a', port: 1 })))).toBeNull()
        expect(beacon.parse(Buffer.from(JSON.stringify({ v: 1, kind: 'share', label: 'A b', port: 1 })))).toBeNull()
        expect(beacon.parse(Buffer.from(JSON.stringify({ v: 1, kind: 'share', label: 'a', port: 70000 })))).toBeNull()
    })

    it('listen answers with the sender address and the announced port, only for the label asked', async () => {
        const handlers = {}
        const socket = { on: (event, fn) => { handlers[event] = fn }, bind: () => {}, close: vi.fn() }
        const pending = beacon.listen({ label: 'dob-a3f9', timeoutMs: 500, createSocket: () => socket })
        handlers.message(beacon.encode({ label: 'someone-else', port: 1 }), { address: '192.168.1.99' })
        handlers.message(beacon.encode({ label: 'dob-a3f9', port: 8443 }), { address: '192.168.1.5' })
        expect(await pending).toEqual({ address: '192.168.1.5', port: 8443 })
        expect(socket.close).toHaveBeenCalled()
    })

    it('listen gives null on silence, and never throws when the socket cannot be made', async () => {
        const socket = { on: () => {}, bind: () => {}, close: () => {} }
        expect(await beacon.listen({ label: 'a', timeoutMs: 20, createSocket: () => socket })).toBeNull()
        expect(await beacon.listen({ label: 'a', timeoutMs: 20, createSocket: () => { throw new Error('no udp') } })).toBeNull()
    })

    it('announce then listen on loopback, on an ephemeral port', async () => {
        const probe = require('node:dgram').createSocket('udp4')
        await new Promise((resolve) => probe.bind(0, '127.0.0.1', resolve))
        const port = probe.address().port
        probe.close()
        const pending = beacon.listen({ label: 'dob-a3f9', timeoutMs: 3000, port })
        const announcer = beacon.announce({ label: 'dob-a3f9', port: 8443, to: '127.0.0.1', beaconPort: port, everyMs: 50 })
        const got = await pending
        announcer.stop()
        expect(got).toEqual({ address: '127.0.0.1', port: 8443 })
    })
})

describe('a request failed: look the host up again, in the same order', () => {
    const mkSide = (overrides = {}) => ({ base: 'https://dob-a3f9.z.example/serverXR', address: '192.168.1.5', ...overrides })

    it('moves the side to the new address and says what changed', async () => {
        const side = mkSide()
        const record = vi.fn()
        const resolve = vi.fn(async () => ({ ok: true, route: 'beacon', address: '192.168.1.77', port: 443 }))
        const found = await reresolver({ side, name: { label: 'dob-a3f9', zone: 'z.example' }, resolve, record, log: {} })()
        expect(found.route).toBe('beacon')
        expect(side.address).toBe('192.168.1.77')
        expect(record).toHaveBeenCalledWith({ address: '192.168.1.77', via: 'beacon', remote: 'https://dob-a3f9.z.example/serverXR' })
        // The last address that worked is offered to the resolver as a fallback.
        expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ label: 'dob-a3f9', zone: 'z.example', last: { address: '192.168.1.5', port: 443 } }))
    })

    it('follows a new port into the base URL', async () => {
        const side = mkSide()
        await reresolver({ side, name: { label: 'dob-a3f9', zone: 'z.example' }, resolve: async () => ({ ok: true, route: 'beacon', address: '192.168.1.5', port: 8443 }), log: {} })()
        expect(side.base).toBe('https://dob-a3f9.z.example:8443/serverXR')
        expect(withPort('https://x.example:8443/serverXR', 443)).toBe('https://x.example/serverXR')
    })

    it('leaves the side where it was when nothing is found, and says it once', async () => {
        const side = mkSide()
        const warn = vi.fn()
        const found = await reresolver({ side, name: { label: 'dob-a3f9', zone: 'z.example' }, resolve: async () => ({ ok: false, tried: ['beacon', 'dns', 'last'] }), log: { warn } })()
        expect(found).toBeNull()
        expect(side.address).toBe('192.168.1.5')
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it('asks at most once per gap, so a host that is simply off does not cost every tick', async () => {
        let clock = 0
        const resolve = vi.fn(async () => ({ ok: false, tried: [] }))
        const again = reresolver({ side: mkSide(), name: { label: 'a', zone: 'z.example' }, resolve, log: {}, minGapMs: 10000, now: () => clock })
        await again(); clock = 5000; await again()
        expect(resolve).toHaveBeenCalledTimes(1)
        clock = 10001; await again()
        expect(resolve).toHaveBeenCalledTimes(2)
    })
})
