// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { streamsFor, projectIdsFrom, sceneStream, projectStream, MAX_FOLLOWED_PROJECTS } = require('./streams')

describe('what a followed space is made of', () => {
    it('is always the room itself, even when it holds no projects', () => {
        const streams = streamsFor({ spaceId: 'jam' })
        expect(streams).toHaveLength(1)
        expect(streams[0]).toMatchObject({ kind: 'scene', opsPath: '/api/spaces/jam/ops' })
    })

    it('carries every project either side has — a project made on one machine must reach the other', () => {
        const streams = streamsFor({ spaceId: 'jam', localProjects: ['a'], remoteProjects: ['b'] })
        expect(streams.map(s => s.key)).toEqual(['scene:jam', 'project:a', 'project:b'])
    })

    it('never carries the same project twice when both sides have it', () => {
        const streams = streamsFor({ spaceId: 'jam', localProjects: ['a', 'b'], remoteProjects: ['b', 'a'] })
        expect(streams.map(s => s.key)).toEqual(['scene:jam', 'project:a', 'project:b'])
    })

    it('addresses a space id that needs escaping without leaving the path', () => {
        expect(sceneStream('a space/../etc').opsPath).toBe('/api/spaces/a%20space%2F..%2Fetc/ops')
        expect(projectStream('../secret').opsPath).toBe('/api/projects/..%2Fsecret/ops')
    })

    it('reads a project list in either shape the server might send', () => {
        expect(projectIdsFrom({ projects: [{ id: 'aaa' }, { projectId: 'bbb' }, 'ccc'] })).toEqual(['aaa', 'bbb', 'ccc'])
    })

    it('treats an answer it cannot read as no projects, and lets the room keep going', () => {
        expect(projectIdsFrom(null)).toEqual([])
        expect(projectIdsFrom({ projects: 'not a list' })).toEqual([])
        expect(projectIdsFrom({ projects: [{}, null, 42] })).toEqual([])
    })

    // Follow audit F18: an id the other side lists becomes a path on this side
    // (/api/projects/<id>/…); '.' and '..' survive encodeURIComponent and are
    // dot-normalised by new URL. Only an id this server would itself make is kept.
    it('keeps only ids this server would make, and counts every one it drops', () => {
        const dropped = []
        const onDrop = (reason, id) => dropped.push([reason, id])
        const long = 'a'.repeat(300)
        const ids = projectIdsFrom({ projects: ['.', '..', 'a/b', '%2e%2e', 'ABC', long, 'good-one', { id: 'abc' }] }, onDrop)
        expect(ids).toEqual(['good-one', 'abc'])
        expect(dropped).toEqual([
            ['bad id', '.'], ['bad id', '..'], ['bad id', 'a/b'], ['bad id', '%2e%2e'], ['bad id', 'ABC'], ['bad id', long]
        ])
    })

    it('caps a list too long to carry, and counts what it left out', () => {
        expect(MAX_FOLLOWED_PROJECTS).toBe(5000)
        const list = Array.from({ length: 10000 }, (_, i) => `p-${String(i).padStart(5, '0')}`)
        const dropped = { 'bad id': 0, 'over cap': 0 }
        const ids = projectIdsFrom({ projects: list }, (reason) => { dropped[reason] += 1 })
        expect(ids).toHaveLength(5000)
        expect(ids[0]).toBe('p-00000')
        expect(dropped).toEqual({ 'bad id': 0, 'over cap': 5000 })
    })

    it('never throws on a drop, even with no one listening', () => {
        expect(projectIdsFrom({ projects: ['..', 'fine-id'] })).toEqual(['fine-id'])
    })
})
