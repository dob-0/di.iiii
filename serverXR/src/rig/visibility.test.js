// @vitest-environment node
//
// visibility.js: the one place "can the others see this copy" is worked out,
// and `nearby`, the bounded list of di.iiii heard but never paired.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createNearby, describeVisibility, fixCommand, NEARBY_MAX } = require('./visibility.js')

describe('describeVisibility', () => {
  it('open: bound to the network and the LAN allowed — visible, no fix', () => {
    const v = describeVisibility({ lanBind: true, lanAllowed: true, local: true, discoveryMode: 'open', discoveryStats: { listening: true, bindError: 0 }, members: [{}, {}] })
    expect(v).toMatchObject({ rig: 1, visible: true, reason: 'open', discovery: 'on', members: 2, fix: null })
  })

  it('the 2026-09-24 case: bound to the network, device routes closed — private, and says which variable', () => {
    const v = describeVisibility({ lanBind: true, lanAllowed: false, local: false, discoveryMode: 'private', discoveryStats: { listening: true, bindError: 0 } })
    expect(v.visible).toBe(false)
    expect(v.reason).toBe('devices-closed')
    expect(v.discovery).toBe('listening')
    expect(v.summary).toMatch(/private/)
    expect(v.summary).toMatch(/DI_ALLOW_LAN_DEVICES/)
    expect(v.fix).toMatch(/DI_ALLOW_LAN_DEVICES=1/)
    expect(v.fix).toMatch(/di up --lan/)
  })

  it('a loopback `di up`: private, discovery off, and the fix is the di command', () => {
    const v = describeVisibility({ lanBind: false, lanAllowed: false, local: true, discoveryMode: 'off' })
    expect(v).toMatchObject({ visible: false, reason: 'loopback', discovery: 'off', fix: 'di down, then di up --lan' })
    expect(v.summary).toMatch(/this machine only/)
  })

  it('LAN allowed but bound to loopback is still private — nobody can reach a loopback bind', () => {
    expect(describeVisibility({ lanBind: false, lanAllowed: true, local: true }).visible).toBe(false)
  })

  it('a UDP port that would not bind reads port-busy, not "on"', () => {
    const v = describeVisibility({ lanBind: true, lanAllowed: true, discoveryMode: 'open', discoveryStats: { listening: false, bindError: 1 } })
    expect(v.discovery).toBe('port-busy')
  })

  it('passes nearby through with only the fields a screen needs', () => {
    const v = describeVisibility({ nearby: [{ id: 'a', name: 'ponyo', address: '192.168.88.125', release: null, open: false, via: 'beacon', lastSeen: 5, extra: 'x' }] })
    expect(v.nearby).toEqual([{ id: 'a', name: 'ponyo', address: '192.168.88.125', release: null, open: false, via: 'beacon', lastSeen: 5 }])
  })
})

describe('fixCommand', () => {
  it('names the variables a non-di start needs, and HOST only when the bind is loopback', () => {
    expect(fixCommand({ lanBind: true, local: false })).not.toMatch(/HOST=/)
    expect(fixCommand({ lanBind: false, local: false })).toMatch(/HOST=0\.0\.0\.0 DI_ALLOW_LAN_DEVICES=1/)
  })
})

describe('createNearby', () => {
  it('keeps the newest sighting per id and forgets after the TTL', () => {
    let t = 0
    const nearby = createNearby({ now: () => t, ttlMs: 20_000 })
    nearby.note({ id: 'p', name: 'ponyo', address: '192.168.88.125', open: false, via: 'beacon' })
    t = 10_000
    nearby.note({ id: 'p', open: false, via: 'beacon' })
    expect(nearby.list()).toEqual([expect.objectContaining({ id: 'p', name: 'ponyo', address: '192.168.88.125', lastSeen: 10_000 })])
    t = 30_001
    expect(nearby.list()).toEqual([])
  })

  it('is bounded: a flood of fresh ids evicts the oldest and never grows past the cap', () => {
    let t = 0
    const nearby = createNearby({ now: () => t })
    for (let i = 0; i < NEARBY_MAX + 50; i++) { t = i; nearby.note({ id: `id-${i}`, open: true, via: 'here' }) }
    const list = nearby.list()
    expect(list).toHaveLength(NEARBY_MAX)
    expect(list.some((e) => e.id === 'id-0')).toBe(false)
    expect(list.some((e) => e.id === `id-${NEARBY_MAX + 49}`)).toBe(true)
  })

  it('shows the first address still heard, not whichever interface spoke last', () => {
    let t = 0
    const nearby = createNearby({ now: () => t, ttlMs: 20_000 })
    nearby.note({ id: 'a', address: '192.168.88.231' })
    t = 1; nearby.note({ id: 'a', address: '100.67.142.106' })
    t = 2; nearby.note({ id: 'a', address: '10.0.0.122' })
    expect(nearby.list()[0].address).toBe('192.168.88.231')
    // the first address falls silent for the TTL: the next one takes over
    for (t = 5_000; t <= 25_000; t += 5_000) nearby.note({ id: 'a', address: '100.67.142.106' })
    expect(nearby.list()[0].address).toBe('100.67.142.106')
  })

  it('refuses a sighting without an id, and clips long text', () => {
    const nearby = createNearby()
    expect(nearby.note({ name: 'x' })).toBeNull()
    const entry = nearby.note({ id: 'x', name: 'n'.repeat(500) })
    expect(entry.name).toHaveLength(128)
  })

  it('forget() drops an id — a private copy that opened up becomes a member instead', () => {
    const nearby = createNearby()
    nearby.note({ id: 'p', open: false })
    nearby.forget('p')
    expect(nearby.list()).toEqual([])
  })
})
