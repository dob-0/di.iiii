// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { describeListen, isLoopbackBind, lanAddresses } = require('./listenInfo.js')

// A laptop with a wifi card, a Tailscale tunnel, docker's bridge and loopback —
// the table os.networkInterfaces() returns on the festival machine.
const TABLE = {
  lo: [
    { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
    { address: '::1', family: 'IPv6', internal: true }
  ],
  wlp3s0: [
    { address: '192.168.1.5', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    { address: 'fe80::1%wlp3s0', family: 'IPv6', internal: false, scopeid: 3 }
  ],
  tailscale0: [
    { address: '100.64.0.3', netmask: '255.192.0.0', family: 'IPv4', internal: false }
  ]
}

describe('lanAddresses', () => {
  it('keeps every non-internal IPv4 with its interface name, and nothing else', () => {
    expect(lanAddresses(TABLE)).toEqual([
      { iface: 'wlp3s0', address: '192.168.1.5' },
      { iface: 'tailscale0', address: '100.64.0.3' }
    ])
  })

  it('reads the numeric family older node versions report', () => {
    expect(lanAddresses({ eth0: [{ address: '10.0.0.9', family: 4, internal: false }] }))
      .toEqual([{ iface: 'eth0', address: '10.0.0.9' }])
  })

  it('answers an empty list for an empty or missing table', () => {
    expect(lanAddresses({})).toEqual([])
    expect(lanAddresses(null)).toEqual([])
  })
})

describe('describeListen', () => {
  it('calls a loopback bind what it is, with no addresses', () => {
    expect(describeListen({ host: '127.0.0.1', local: true, interfaces: TABLE })).toEqual({ lan: false, addresses: [] })
    expect(describeListen({ host: 'localhost', local: true, interfaces: TABLE })).toEqual({ lan: false, addresses: [] })
    expect(isLoopbackBind('::1')).toBe(true)
  })

  it('names the addresses of a wildcard bind on a local runtime — `di up --lan`', () => {
    expect(describeListen({ host: '0.0.0.0', local: true, interfaces: TABLE }))
      .toEqual({ lan: true, addresses: ['192.168.1.5', '100.64.0.3'] })
  })

  it('treats an empty HOST as config.js does — every interface', () => {
    expect(describeListen({ host: '', local: true, interfaces: TABLE }).lan).toBe(true)
    expect(describeListen({ local: true, interfaces: TABLE }).lan).toBe(true)
  })

  it('keeps a hosted server\'s addresses to itself', () => {
    // A hosted di-studio.xyz also binds 0.0.0.0; its container addresses are not
    // for an unauthenticated config endpoint to hand out.
    expect(describeListen({ host: '0.0.0.0', local: false, interfaces: TABLE }))
      .toEqual({ lan: true, addresses: [] })
  })
})
