// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { onThisMachine } = require('./onThisMachine.js')

// aylmo holds 192.168.15.20 on the wifi and 100.67.142.106 on the tailnet.
const interfaces = {
    lo: [{ address: '127.0.0.1' }, { address: '::1' }],
    wlan0: [{ address: '192.168.15.20' }],
    tailscale0: [{ address: '100.67.142.106' }]
}

describe('is the browser on this machine', () => {
    it('loopback, through a local proxy or not, is this machine', () => {
        expect(onThisMachine({ ip: '127.0.0.1' }, { interfaces })).toBe(true)
        expect(onThisMachine({ ip: '::ffff:127.0.0.1' }, { interfaces })).toBe(true)
        expect(onThisMachine({ ip: '::1' }, { interfaces })).toBe(true)
    })

    it("one of this machine's own addresses is this machine (the front door on :443)", () => {
        expect(onThisMachine({ ip: '100.67.142.106' }, { interfaces })).toBe(true)
        expect(onThisMachine({ ip: '::ffff:192.168.15.20' }, { interfaces })).toBe(true)
    })

    it('another computer is away, and so is a request with no address', () => {
        expect(onThisMachine({ ip: '100.72.53.77' }, { interfaces })).toBe(false)
        expect(onThisMachine({ ip: '192.168.15.31' }, { interfaces })).toBe(false)
        expect(onThisMachine({}, { interfaces })).toBe(false)
    })
})
