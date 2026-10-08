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

// Two servers on one data folder (serverXR/src/follow/lease.js): the one `di`
// asks may not be the one carrying the follows. It must say so, not print
// "(not running)" beside a follow that is running next door.
describe('di follows — carried by another server on this data folder', () => {
    it('names the server that carries them instead of calling them not running', () => {
        const text = ui.followList(
            { 'test-desk': { remote: 'http://100.72.53.77:4000/serverXR' } },
            [],
            { follows: [], carriedHere: false, carriedBy: { pid: 4242, port: 4000, hostname: 'aylmo' } }
        )
        const lines = text.split('\n')
        expect(lines[0]).toBe('another di.iiii server on this data folder carries these follows (pid 4242, port 4000). ask that one how they are doing; this one takes over if it stops.')
        expect(lines[1]).toContain('(carried by pid 4242, port 4000)')
        expect(text).not.toContain('not running')
    })
})
