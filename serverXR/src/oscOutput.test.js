// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { encodeOscMessage, isPrivateHost } = require('./oscOutput.js')

describe('encodeOscMessage', () => {
    it('encodes a float message with OSC 1.0 layout and 4-byte padding', () => {
        const packet = encodeOscMessage('/test', [0.5])
        // '/test' + null, padded to 8 bytes
        expect(packet.subarray(0, 8)).toEqual(Buffer.from('/test\0\0\0', 'ascii'))
        // ',f' + null, padded to 4 bytes
        expect(packet.subarray(8, 12)).toEqual(Buffer.from(',f\0\0', 'ascii'))
        // 0.5 as big-endian float32
        expect(packet.subarray(12, 16).readFloatBE()).toBe(0.5)
        expect(packet.length).toBe(16)
    })

    it('pads an address that already fills a 4-byte boundary with a full null word', () => {
        const packet = encodeOscMessage('/pad', [])
        // '/pad' is 4 bytes -> needs 4 more null bytes for its terminator
        expect(packet.subarray(0, 8)).toEqual(Buffer.from('/pad\0\0\0\0', 'ascii'))
        expect(packet.subarray(8, 12)).toEqual(Buffer.from(',\0\0\0', 'ascii'))
    })

    it('encodes every number as float and strings as padded s-args', () => {
        const packet = encodeOscMessage('/mix', [1, 'go'])
        expect(packet.subarray(8, 12)).toEqual(Buffer.from(',fs\0', 'ascii'))
        expect(packet.subarray(12, 16).readFloatBE()).toBe(1)
        expect(packet.subarray(16, 20)).toEqual(Buffer.from('go\0\0', 'ascii'))
    })
})

describe('isPrivateHost', () => {
    it('accepts loopback and private-range IPv4 and localhost', () => {
        for (const host of ['127.0.0.1', 'localhost', '10.0.0.5', '172.16.9.1', '172.31.255.1', '192.168.1.44', '169.254.0.1']) {
            expect(isPrivateHost(host)).toBe(true)
        }
    })

    it('rejects public addresses, hostnames, and malformed input', () => {
        for (const host of ['8.8.8.8', '172.32.0.1', 'di-studio.xyz', '192.168.1', '999.168.1.1', '', null]) {
            expect(isPrivateHost(host)).toBe(false)
        }
    })
})
