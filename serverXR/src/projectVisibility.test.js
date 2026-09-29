import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { assetCacheControl, canSeeProject, filterVisibleProjects, isSpaceMember } = require('./projectVisibility.js')

const visitor = { authenticated: false, role: 'guest', spaces: null }
const stranger = { authenticated: true, type: 'token', role: 'viewer', spaces: ['elsewhere'] }
const member = { authenticated: true, type: 'token', role: 'editor', spaces: ['show'] }
const admin = { authenticated: true, type: 'token', role: 'admin', spaces: null, isUnrestricted: true }

const door = { id: 'door', spaceId: 'show', visibility: 'public' }
const sources = { id: 'sources', spaceId: 'show', visibility: 'private' }
const legacy = { id: 'old', spaceId: 'show' } // a row read before the column existed

describe('who is a member of a space', () => {
    it('is the same test a private space applies: signed in, viewer or above, scoped to it', () => {
        expect(isSpaceMember(visitor, 'show')).toBe(false)
        expect(isSpaceMember(stranger, 'show')).toBe(false)
        expect(isSpaceMember(member, 'show')).toBe(true)
        expect(isSpaceMember(admin, 'show')).toBe(true)
        // An unauthenticated state reads as "every space" in scope terms —
        // exactly the trap the trash route documents. Authentication comes first.
        expect(isSpaceMember({ ...visitor, spaces: null }, 'show')).toBe(false)
    })

    it('with auth off, everyone is the owner', () => {
        expect(isSpaceMember(visitor, 'show', { requireAuth: false })).toBe(true)
    })
})

describe('which projects a caller sees', () => {
    it('a public (or pre-column) project is seen by anyone who reached the space', () => {
        expect(canSeeProject(visitor, door)).toBe(true)
        expect(canSeeProject(visitor, legacy)).toBe(true)
    })

    it('a private project is seen by members only', () => {
        expect(canSeeProject(visitor, sources)).toBe(false)
        expect(canSeeProject(stranger, sources)).toBe(false)
        expect(canSeeProject(member, sources)).toBe(true)
        expect(canSeeProject(admin, sources)).toBe(true)
    })

    it('narrows a list for a visitor and leaves a member\'s alone', () => {
        const list = [door, sources, legacy]
        expect(filterVisibleProjects(visitor, 'show', list).map((p) => p.id)).toEqual(['door', 'old'])
        expect(filterVisibleProjects(member, 'show', list)).toBe(list)
    })

    it('never lets a shared cache keep a private project\'s bytes', () => {
        expect(assetCacheControl(sources)).toBe('private, no-store')
        expect(assetCacheControl(door)).toContain('public')
    })
})
