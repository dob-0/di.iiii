// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isOwnerAtTheMachine, ownAddresses } = require('./localOwner')

// One wifi card and loopback, the shape a laptop in a room actually has.
const interfaces = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  wlp0s20f3: [
    { address: '192.168.15.187', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false }
  ]
}

const from = (address, headers = {}) => ({ socket: { remoteAddress: address }, headers })

describe('who counts as the owner of a personal install', () => {
    it('is the person at the machine, on loopback and on its own wifi address', () => {
        // Both matter: `di up --guests` points one name at the wifi address, so
        // the owner's own browser arrives there, not on 127.0.0.1.
        expect(isOwnerAtTheMachine(from('127.0.0.1'), { isLocal: true, interfaces })).toBe(true)
        expect(isOwnerAtTheMachine(from('::1'), { isLocal: true, interfaces })).toBe(true)
        expect(isOwnerAtTheMachine(from('192.168.15.187'), { isLocal: true, interfaces })).toBe(true)
        // IPv4-mapped IPv6 is how Node reports a v4 client on a dual-stack bind.
        expect(isOwnerAtTheMachine(from('::ffff:192.168.15.187'), { isLocal: true, interfaces })).toBe(true)
    })

    it('is nobody else on the wifi — that is the whole point of guest mode', () => {
        expect(isOwnerAtTheMachine(from('192.168.15.42'), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from('10.0.0.5'), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from('203.0.113.9'), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from(''), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine({}, { isLocal: true, interfaces })).toBe(false)
    })

    it('never applies on a hosted server, whatever the address', () => {
        // A hosted di.iiii talks to itself over loopback all the time (the
        // GitHub sync writes back through its own routes). None of that may
        // become an admin session.
        expect(isOwnerAtTheMachine(from('127.0.0.1'), { isLocal: false, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from('192.168.15.187'), { isLocal: false, interfaces })).toBe(false)
    })

    it('reads the machine fresh, so changing wifi changes the answer', () => {
        const atHome = { wlan: [{ address: '192.168.88.67', family: 'IPv4' }] }
        const atTheVenue = { wlan: [{ address: '192.168.15.187', family: 'IPv4' }] }
        expect(isOwnerAtTheMachine(from('192.168.88.67'), { isLocal: true, interfaces: atHome })).toBe(true)
        expect(isOwnerAtTheMachine(from('192.168.88.67'), { isLocal: true, interfaces: atTheVenue })).toBe(false)
    })

    it('always holds loopback, even on a machine with no network at all', () => {
        expect([...ownAddresses({})]).toContain('127.0.0.1')
    })

    // A proxy on this very machine — nginx, cloudflared, ngrok, `ssh -L`, a
    // published docker port — terminates the visitor's connection and makes a
    // new one from loopback. Without this, every visitor on earth is the owner.
    it('refuses the grant to anything that came through a proxy', () => {
        expect(isOwnerAtTheMachine(from('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' }), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from('127.0.0.1', { forwarded: 'for=203.0.113.9' }), { isLocal: true, interfaces })).toBe(false)
        expect(isOwnerAtTheMachine(from('192.168.15.187', { 'x-real-ip': '10.1.1.1' }), { isLocal: true, interfaces })).toBe(false)
        // and a plain browser, which sends none of them, still counts
        expect(isOwnerAtTheMachine(from('127.0.0.1', { 'user-agent': 'Firefox' }), { isLocal: true, interfaces })).toBe(true)
    })

    it('does not count a container bridge or a virtual switch as this machine', () => {
        // A published docker port rewrites the source to the bridge address, so
        // treating docker0 as "here" would hand the container's traffic the
        // owner's estate.
        const withDocker = {
            ...interfaces,
            docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
            'br-abc123': [{ address: '172.18.0.1', family: 'IPv4', internal: false }]
        }
        expect(isOwnerAtTheMachine(from('172.17.0.1'), { isLocal: true, interfaces: withDocker })).toBe(false)
        expect(isOwnerAtTheMachine(from('172.18.0.1'), { isLocal: true, interfaces: withDocker })).toBe(false)
        expect(isOwnerAtTheMachine(from('192.168.15.187'), { isLocal: true, interfaces: withDocker })).toBe(true)
    })
})
