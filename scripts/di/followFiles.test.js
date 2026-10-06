// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { followFileLines, ui } from './ui.mjs'

// What `di follows` says about the files a follow carries
// (serverXR/src/follow/assets.js). Colour is off under vitest (no TTY), so the
// strings compare plain.
describe('di follows — files', () => {
    it('says nothing when there is nothing to say, or an older install reports no files', () => {
        expect(followFileLines(undefined)).toEqual([])
        expect(followFileLines({ carried: 4, pending: 0, failed: 0, failures: [], notCarried: 0, bytesPending: 0 })).toEqual([])
    })

    it('counts what is still coming, one file or many', () => {
        expect(followFileLines({ pending: 3, bytesPending: 0 })).toEqual(['3 files still coming'])
        expect(followFileLines({ pending: 1, bytesPending: 250 * 1024 * 1024 })).toEqual(['1 file still coming (250 MB)'])
    })

    it('names a file that could not be carried, and why', () => {
        expect(followFileLines({ failed: 1, failures: [{ id: 'x', name: 'opening.mp4', why: 'the other di.iiii refused the key' }] }))
            .toEqual(['1 file could not be carried — opening.mp4: the other di.iiii refused the key'])
        const many = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, why: 'w' }))
        expect(followFileLines({ failed: 5, failures: many })[0]).toBe('5 files could not be carried — f0: w; f1: w; f2: w; and 2 more')
    })

    it('says older files are not carried, and what to do about it', () => {
        expect(followFileLines({ notCarried: 2 })[0]).toMatch(/^2 older files are not carried — .*add them again/)
        expect(followFileLines({ notCarried: 1 })[0]).toMatch(/^1 older file is not carried — .*add it again/)
    })

    it('hangs the lines under the follow they belong to', () => {
        const text = ui.followList(
            { room: { remote: 'http://host:4000/serverXR' } },
            [{ spaceId: 'room', status: 'following', carriedIn: 1, carriedOut: 2, streams: 2, lastError: null, files: { pending: 2, bytesPending: 0 } }]
        )
        const lines = text.split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toContain('following · in 1 · out 2 · 2 logs')
        expect(lines[1].trim()).toBe('2 files still coming')
    })

    it('tells a new follower which files travel and which do not', () => {
        const text = ui.following('room', 'http://host:4000/serverXR', true)
        expect(text).toContain('files in its projects travel too')
        expect(text).toContain('files placed straight in the room itself are not carried yet')
    })
})

describe('di follows — a project\'s life', () => {
    it('says what a follow did not carry about its projects, under the follow', () => {
        const text = ui.followList(
            { room: { remote: 'http://host:4000/serverXR' } },
            [{ spaceId: 'room', status: 'following', carriedIn: 0, carriedOut: 0, streams: 1, lastError: null, projects: { carried: 1, notes: ['a left this space on the host (moved to another space, or purged from its trash) — kept here'] } }]
        )
        const lines = text.split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[1].trim()).toBe('projects: a left this space on the host (moved to another space, or purged from its trash) — kept here')
    })
})

describe('di follows — the key\'s scope (SPEC_space_sync_keys.md §13)', () => {
    it('shows whether each follow\'s key may carry trash, hiding and moves to the host', () => {
        const text = ui.followList(
            { room: { remote: 'http://host:4000/serverXR' }, other: { remote: 'http://host:4000/serverXR' } },
            [
                { spaceId: 'room', status: 'following', carriedIn: 0, carriedOut: 0, streams: 1, lastError: null, key: { scope: 'manage' } },
                { spaceId: 'other', status: 'following', carriedIn: 0, carriedOut: 0, streams: 1, lastError: null, key: { scope: 'edit' } }
            ]
        )
        expect(text.split('\n')[0]).toContain('following · in 0 · out 0 · key: manage')
        expect(text.split('\n')[1]).toContain('key: edit')
    })

    it('says a manage key out loud when it is minted, and an ordinary one stays as it was', () => {
        expect(ui.invited('room', 'http://host:4000', 'K', { manage: true })).toMatch(/MANAGE key/)
        expect(ui.invited('room', 'http://host:4000', 'K')).not.toMatch(/MANAGE/)
    })

    it('lists the key log, refusals in yellow with their reason', () => {
        const text = ui.inviteActions('room', [
            { keyId: 'abc', keyLabel: 'aylmo follow room', action: 'trash', projectId: 'p1', outcome: 'refused', reason: 'limit', at: 0 },
            { keyId: 'abc', keyLabel: 'aylmo follow room', action: 'move', projectId: 'p2', toSpaceId: 'other', outcome: 'done', at: 0 }
        ])
        expect(text).toContain('trash p1')
        expect(text).toContain('refused: limit')
        expect(text).toContain('move p2 → other')
        expect(ui.inviteActions('room', [])).toMatch(/no key has/)
    })
})
