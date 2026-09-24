// @vitest-environment node

// The autoscan's bookkeeping: appear / disappear / come back / change address, the
// settle window that keeps a young finder from announcing departures, and the bounds.
// Pure — the clock is a number passed in.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSourceRegistry, isEmptyChange } = require('./scanner.js')

const TD = { name: 'AYLMO (td_out_windows)', address: '192.168.15.53:5961' }
const OBS = { name: 'WIN (OBS)', address: '192.168.15.20:5962' }

describe('the NDI source registry', () => {
  it('reports what appeared, with first and last seen', () => {
    const reg = createSourceRegistry()
    const change = reg.apply([TD], 1000)
    expect(change.appeared).toEqual([{ ...TD, firstSeen: 1000, lastSeen: 1000, goneSince: null }])
    expect(change.gone).toEqual([])
    expect(reg.count()).toBe(1)
  })

  it('reports nothing when the list is the same', () => {
    const reg = createSourceRegistry()
    reg.apply([TD, OBS], 1000)
    const change = reg.apply([OBS, TD], 2000)
    expect(isEmptyChange(change)).toBe(true)
    expect(reg.list().map((s) => s.lastSeen)).toEqual([2000, 2000])
  })

  it('marks a source gone, keeps it with goneSince, and brings it back with its first sighting', () => {
    const reg = createSourceRegistry()
    reg.apply([TD, OBS], 1000)
    const left = reg.apply([OBS], 5000)
    expect(left.gone.map((s) => s.name)).toEqual([TD.name])
    expect(left.gone[0].goneSince).toBe(5000)
    expect(reg.count()).toBe(1)
    const listed = reg.list()
    expect(listed[0]).toMatchObject({ name: OBS.name, present: true })
    expect(listed[1]).toMatchObject({ name: TD.name, present: false, goneSince: 5000, lastSeen: 1000 })

    const back = reg.apply([OBS, TD], 9000)
    expect(back.appeared).toHaveLength(1)
    expect(back.appeared[0]).toMatchObject({ name: TD.name, firstSeen: 1000, lastSeen: 9000, goneSince: null })
  })

  it('reports an address change under the same name', () => {
    const reg = createSourceRegistry()
    reg.apply([TD], 1000)
    const change = reg.apply([{ ...TD, address: '10.0.0.5:5961' }], 2000)
    expect(change.changed).toEqual([expect.objectContaining({ name: TD.name, address: '10.0.0.5:5961' })])
    expect(change.appeared).toEqual([])
  })

  // The SDK: "an 'early' return … might not include all the sources on the network".
  it('while settling, adds but never removes', () => {
    const reg = createSourceRegistry()
    reg.apply([TD, OBS], 1000)
    const early = reg.apply([OBS], 2000, { settling: true })
    expect(early.gone).toEqual([])
    expect(reg.count()).toBe(2)
    const settled = reg.apply([OBS], 4000)
    expect(settled.gone.map((s) => s.name)).toEqual([TD.name])
  })

  it('touch() refreshes lastSeen of present names only', () => {
    const reg = createSourceRegistry()
    reg.apply([TD, OBS], 1000)
    reg.apply([OBS], 2000)
    reg.touch(3000)
    const byName = Object.fromEntries(reg.list().map((s) => [s.name, s]))
    expect(byName[OBS.name].lastSeen).toBe(3000)
    expect(byName[TD.name].lastSeen).toBe(1000)
  })

  it('forgets a departed name after goneKeepMs, and never holds more than maxEntries', () => {
    const reg = createSourceRegistry({ goneKeepMs: 100, maxEntries: 3 })
    reg.apply([TD], 0)
    reg.apply([], 10)
    expect(reg.size()).toBe(1)
    reg.apply([], 200)
    expect(reg.size()).toBe(0)

    const many = Array.from({ length: 5 }, (_, i) => ({ name: `M (${i})`, address: '' }))
    reg.apply(many, 300)
    expect(reg.size()).toBe(3)
  })

  it('ignores nameless and duplicate entries and bounds what it stores', () => {
    const reg = createSourceRegistry()
    const change = reg.apply([{ name: '' }, null, TD, { ...TD, address: 'x' }, { name: 'L'.repeat(1000), address: 'a'.repeat(1000) }], 1)
    expect(change.appeared).toHaveLength(2)
    expect(reg.list().every((s) => s.name.length <= 400 && s.address.length <= 200)).toBe(true)
  })
})
