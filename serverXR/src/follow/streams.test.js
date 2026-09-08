// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { streamsFor, projectIdsFrom, sceneStream, projectStream } = require('./streams')

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
        expect(projectIdsFrom({ projects: [{ id: 'a' }, { projectId: 'b' }, 'c'] })).toEqual(['a', 'b', 'c'])
    })

    it('treats an answer it cannot read as no projects, and lets the room keep going', () => {
        expect(projectIdsFrom(null)).toEqual([])
        expect(projectIdsFrom({ projects: 'not a list' })).toEqual([])
        expect(projectIdsFrom({ projects: [{}, null, 42] })).toEqual([])
    })
})
