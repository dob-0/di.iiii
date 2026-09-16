import { describe, expect, it, vi } from 'vitest'
import { createMembers } from './members.js'

const hello = (overrides = {}) => ({
    machine: { id: 'm-1', name: 'asuz' },
    release: '0.5.0',
    part: 'stage',
    room: null,
    http: { port: 4000, base: '/serverXR' },
    features: { card: 1, cue: 1 },
    ...overrides
})

describe('createMembers', () => {
    it('upsert files a §2.6-shaped entry and emits join for a brand new id', () => {
        const now = vi.fn(() => 1000)
        const members = createMembers({ now })
        const onJoin = vi.fn()
        members.on('join', onJoin)

        const entry = members.upsert(hello(), { address: '192.168.88.10', via: 'hello' })

        expect(entry).toEqual({
            machine: { id: 'm-1', name: 'asuz' },
            release: '0.5.0',
            part: 'stage',
            room: null,
            address: '192.168.88.10',
            http: { port: 4000, base: '/serverXR' },
            agreed: undefined,
            features: { card: 1, cue: 1 },
            lastSeen: 1000,
            via: 'hello'
        })
        expect(members.get('m-1')).toEqual(entry)
        expect(members.list()).toEqual([entry])
        expect(onJoin).toHaveBeenCalledTimes(1)
        expect(onJoin).toHaveBeenCalledWith(entry)
    })

    it('a refresh does not re-emit join, and only overwrites fields the new hello actually carries', () => {
        let t = 1000
        const now = vi.fn(() => t)
        const members = createMembers({ now })
        const onJoin = vi.fn()
        members.on('join', onJoin)

        members.upsert(hello(), { address: '192.168.88.10', via: 'hello' })

        t = 2000
        // A bare discovery refresh: only the id, no address override.
        const refreshed = members.upsert({ machine: { id: 'm-1' } }, { via: 'discovery' })

        expect(refreshed.lastSeen).toBe(2000)
        expect(refreshed.via).toBe('discovery')
        // Everything else survives untouched.
        expect(refreshed.release).toBe('0.5.0')
        expect(refreshed.address).toBe('192.168.88.10')
        expect(refreshed.features).toEqual({ card: 1, cue: 1 })
        expect(onJoin).toHaveBeenCalledTimes(1) // still just the first upsert
    })

    it('keeps `agreed` only when the new hello carries one, otherwise leaves the previous value', () => {
        const members = createMembers({ now: () => 1000 })

        const first = members.upsert(hello({ agreed: { card: 1 } }), { via: 'hello' })
        expect(first.agreed).toEqual({ card: 1 })

        // A refresh with no `agreed` field at all keeps what was there.
        const refreshed = members.upsert({ machine: { id: 'm-1' } }, { via: 'discovery' })
        expect(refreshed.agreed).toEqual({ card: 1 })

        // A hello that explicitly sends a new `agreed` replaces it.
        const updated = members.upsert(hello({ agreed: { card: 1, cue: 1 } }), { via: 'hello' })
        expect(updated.agreed).toEqual({ card: 1, cue: 1 })
    })

    it('never files our own id, however it arrives', () => {
        const members = createMembers({ now: () => 1000, selfId: 'me' })
        const onJoin = vi.fn()
        members.on('join', onJoin)

        const result = members.upsert(hello({ machine: { id: 'me', name: 'self' } }))

        expect(result).toBeNull()
        expect(members.list()).toEqual([])
        expect(onJoin).not.toHaveBeenCalled()
    })

    it('ignores a hello with no machine id', () => {
        const members = createMembers({ now: () => 1000 })
        expect(members.upsert({})).toBeNull()
        expect(members.upsert({ machine: {} })).toBeNull()
        expect(members.list()).toEqual([])
    })

    it('expire() drops entries older than ttlMs and emits leave, keeps fresh ones', () => {
        let t = 0
        const now = vi.fn(() => t)
        const members = createMembers({ now, ttlMs: 20000 })
        const onLeave = vi.fn()
        members.on('leave', onLeave)

        members.upsert(hello({ machine: { id: 'stale', name: 'stale' } }))
        t = 5000
        members.upsert(hello({ machine: { id: 'fresh', name: 'fresh' } }))

        t = 20001 // stale's lastSeen (0) is now older than 20000ms; fresh's (5000) is not
        members.expire()

        expect(members.get('stale')).toBeUndefined()
        expect(members.get('fresh')).toBeDefined()
        expect(onLeave).toHaveBeenCalledTimes(1)
        expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ machine: { id: 'stale', name: 'stale' } }))
    })

    it('list() and get() reflect the current store', () => {
        const members = createMembers({ now: () => 1000 })
        expect(members.list()).toEqual([])
        expect(members.get('nope')).toBeUndefined()

        members.upsert(hello())
        expect(members.list()).toHaveLength(1)
        expect(members.get('m-1')).toBeDefined()
    })
})
