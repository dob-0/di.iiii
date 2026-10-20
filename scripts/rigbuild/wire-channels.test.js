import { describe, expect, it } from 'vitest'
import { staticChannelDiffs, roleMapOf, nodeFollowStats, followLine } from './wire-channels.mjs'

const profiles = { wash: { channels: ['dimmer', 'red', 'green'] }, spot: { channels: ['dimmer', 'pan'] } }
const fixtures = [
    { id: 'a', universe: 0, address: 1, profile: 'wash', rigKey: 'p:lamp-a' },
    { id: 'b', universe: 0, address: 4, profile: 'spot', rigKey: 'p:lamp-b' },
    { id: 'c', universe: 1, address: 1, profile: 'wash', rigKey: 'p:lamp-c' },
]

describe('staticChannelDiffs', () => {
    const values = { a: { dimmer: 10, red: 200, green: 0 }, b: { pan: 128 }, c: { red: 5 } }
    it('is clean when the output equals the look, the dimmer ignored', () => {
        const dmx = { 0: [99, 200, 0, 7, 128], 1: [0, 5, 0] }
        const r = staticChannelDiffs({ fixtures, profiles, values, dmx })
        expect(r).toEqual({ lamps: 3, compared: 4, bad: [] })
    })
    it('names the lamp, address and role that differ, within a tolerance of 2', () => {
        const dmx = { 0: [0, 198, 9, 0, 120], 1: [0, 0, 0] }
        const r = staticChannelDiffs({ fixtures, profiles, values, dmx })
        expect(r.bad.map((b) => [b.name, b.address, b.diffs])).toEqual([['lamp-a', 1, ['green 0→9']], ['lamp-b', 4, ['pan 128→120']], ['lamp-c', 1, ['red 5→0']]])
    })
    it('counts a missing byte as a difference, skips lamps the look does not store', () => {
        const r = staticChannelDiffs({ fixtures, profiles, values: { a: { red: 1 } }, dmx: { 0: [0] } })
        expect(r.lamps).toBe(1)
        expect(r.bad).toHaveLength(1)
    })
})

describe('node follow', () => {
    const roles = roleMapOf(fixtures, profiles)[0]
    it('maps buffer slots to lamp.role', () => {
        expect(roles[1]).toBe('lamp-a.red')
        expect(roles[4]).toBe('lamp-b.pan')
    })
    it('a node equal to a recent desk read differs in 0 channels', () => {
        const d = [[1, 2, 3], [1, 2, 4], [1, 2, 5]]
        const n = [[1, 2, 3], [1, 2, 3], [1, 2, 4]]   // one tick behind
        const s = nodeFollowStats({ deskReads: d, nodeReads: n, roleAt: roles })
        expect(s.hist).toEqual({ 0: 3 })
        expect(s.worst).toBe(0)
    })
    it('counts differing channels and the roles that differ, buckets by size', () => {
        const d = [[0, 0, 0, 0, 0, 0]]
        const n = [[0, 9, 0, 0, 9, 0]]
        const s = nodeFollowStats({ deskReads: d, nodeReads: n, roleAt: roles })
        expect(s.hist).toEqual({ '1-4': 1 })
        expect(s.worst).toBe(2)
        expect(s.roles).toEqual([['red', 1], ['pan', 1]])
        expect(followLine('node x', s)).toContain('1-4: 1')
    })
    it('skips unread ticks and says so when there are no reads', () => {
        const s = nodeFollowStats({ deskReads: [null], nodeReads: [null, [1]] })
        expect(s.reads).toBe(0)
        expect(followLine('node x', s)).toBe('node x: no reads')
    })
})
