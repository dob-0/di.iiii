import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createMachineHub } = require('./hub.js')

describe('which machines follow a space (the host’s sync light)', () => {
    it('remembers a follower after it went quiet — "not answering for two minutes" needs it', () => {
        let at = 1000
        const hub = createMachineHub({ now: () => at, peerTtlMs: 30_000 })
        hub.noteServer('moxir', 'machine-aaaa')
        hub.noteFollower('moxir', 'machine-aaaa', 'ponyo')
        at += 120_000
        // the hub forgot it as a live server...
        hub.listPeers('moxir')
        expect(hub.followersOf('moxir')).toEqual([{ machineId: 'machine-aaaa', name: 'ponyo', seenAt: 1000 }])
    })

    it('updates last seen and name on each call, newest first, per space', () => {
        let at = 1
        const hub = createMachineHub({ now: () => at })
        hub.noteFollower('moxir', 'machine-aaaa', 'ponyo')
        at = 5
        hub.noteFollower('moxir', 'machine-bbbb', 'asuz')
        at = 9
        hub.noteFollower('moxir', 'machine-aaaa', 'ponyo')
        expect(hub.followersOf('moxir').map((one) => [one.machineId, one.seenAt])).toEqual([['machine-aaaa', 9], ['machine-bbbb', 5]])
        expect(hub.followersOf('elsewhere')).toEqual([])
    })

    it('refuses an id that is not a machine id and bounds how many it keeps', () => {
        const hub = createMachineHub({ now: () => 1 })
        expect(hub.noteFollower('moxir', 'has spaces', 'x')).toBe(false)
        for (let i = 0; i < 40; i += 1) hub.noteFollower('moxir', `machine-${String(i).padStart(4, '0')}`, null)
        expect(hub.followersOf('moxir').length).toBeLessThanOrEqual(32)
    })

    it('a follower can be forgotten', () => {
        const hub = createMachineHub({ now: () => 1 })
        hub.noteFollower('moxir', 'machine-aaaa', 'ponyo')
        expect(hub.forgetFollower('moxir', 'machine-aaaa')).toBe(true)
        expect(hub.followersOf('moxir')).toEqual([])
    })
})
