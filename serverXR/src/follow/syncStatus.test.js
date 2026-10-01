import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { buildSyncStatus, hostNameOf, originOf } = require('./syncStatus.js')

const entry = { remote: 'https://user:pw@ponyo.example:8443/serverXR?x=1', token: 'dii_sync_SECRET.KEYMATERIAL', label: null, followedAt: '2026-10-01T04:43:00.000Z', address: '100.64.0.9' }
const follow = {
    spaceId: 'moxir', status: 'following', hostAnswering: true, hostRefused: false, lastAnswerAt: 1000, latencyMs: 120, lastMoveAt: 900,
    converged: 2, lastConvergeAt: 800, convergedAt: [700, 800], lastError: null, files: { pending: 3, failed: 1, carried: 40, bytesPending: 9000, failures: [{ id: 'x', name: 'secret-name.png', why: 'no' }] }
}

describe('what the light is told', () => {
    it('never carries the follow key, the address pin, credentials in the address, or a failed file’s name', () => {
        const status = buildSyncStatus({ spaceId: 'moxir', follow, entry, linkHost: { id: 'h', name: 'ponyo' }, now: 5000 })
        const text = JSON.stringify(status)
        expect(text).not.toContain('SECRET')
        expect(text).not.toContain('KEYMATERIAL')
        expect(text).not.toContain('100.64.0.9')
        expect(text).not.toContain('user:pw')
        expect(text).not.toContain('pw@')
        expect(text).not.toContain('secret-name')
        expect(status.follows.host).toEqual({ name: 'ponyo', address: 'https://ponyo.example:8443' })
    })

    it('hands over the numbers the light words are made from, and the server’s own clock', () => {
        const status = buildSyncStatus({ spaceId: 'moxir', follow, entry, linkHost: null, now: 5000 })
        expect(status.now).toBe(5000)
        expect(status.follows).toMatchObject({
            status: 'following', hostAnswering: true, lastAnswerAt: 1000, latencyMs: 120, lastEditAt: 900,
            clashes: 2, clashTimes: [700, 800], files: { pending: 3, failed: 1, carried: 40, bytesPending: 9000 }
        })
    })

    it('says nothing about following when this install does not follow the space', () => {
        const status = buildSyncStatus({ spaceId: 'moxir', follow: null, entry: null, followers: [{ machineId: 'm1', name: 'asuz', seenAt: 77 }], now: 5000 })
        expect(status.follows).toBeNull()
        expect(status.followers).toEqual([{ machineId: 'm1', name: 'asuz', seenAt: 77 }])
    })

    it('a follow that has not ticked yet is "starting", not synced', () => {
        const status = buildSyncStatus({ spaceId: 'moxir', follow: null, entry, now: 1 })
        expect(status.follows.status).toBe('starting')
        expect(status.follows.hostAnswering).toBeNull()
    })

    it('names the host by what it called itself, else by the first label of its address', () => {
        expect(hostNameOf({ linkHost: { name: 'ponyo' }, entry })).toBe('ponyo')
        expect(hostNameOf({ linkHost: null, entry: { remote: 'https://local.thedi.studio/serverXR' } })).toBe('local')
        expect(hostNameOf({ linkHost: null, entry: { remote: 'nonsense' } })).toBeNull()
        expect(originOf('http://192.168.1.9:3000/serverXR')).toBe('http://192.168.1.9:3000')
    })
})
