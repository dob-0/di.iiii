import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { planSettings, readSettings } = require('./followSettings.js')

const space = (over = {}) => ({ label: 'Laser', isPublic: false, publishedProjectId: null, ...over })

describe('planSettings — host to follower, never more public', () => {
    it('carries the host\'s label', () => {
        expect(planSettings({ host: space({ label: 'di.laser' }), local: space({ label: 'di-laser' }) }).patch).toEqual({ label: 'di.laser' })
    })

    it('a private host makes this copy private', () => {
        expect(planSettings({ host: space({ isPublic: false }), local: space({ isPublic: true }) }).patch).toEqual({ isPublic: false })
    })

    it('a public host does not make a private copy public, and says so', () => {
        const { patch, notes } = planSettings({ host: space({ isPublic: true }), local: space({ isPublic: false }) })
        expect(patch).toEqual({})
        expect(notes[0]).toMatch(/left private/)
    })

    it('carries the front door onto a project that is here and not private', () => {
        const host = space({ publishedProjectId: 'front' })
        expect(planSettings({ host, local: space(), localProjects: [{ id: 'front', visibility: 'public' }] }).patch).toEqual({ publishedProjectId: 'front' })
    })

    it('waits for a front door that has not arrived, and never sets a private one', () => {
        const host = space({ publishedProjectId: 'front' })
        expect(planSettings({ host, local: space(), localProjects: [] })).toMatchObject({ patch: {}, notes: [expect.stringMatching(/not arrived/)] })
        expect(planSettings({ host, local: space(), localProjects: [{ id: 'front', visibility: 'private' }] })).toMatchObject({ patch: {}, notes: [expect.stringMatching(/private here/)] })
    })

    it('a host with no front door clears this one', () => {
        expect(planSettings({ host: space(), local: space({ publishedProjectId: 'old' }) }).patch).toEqual({ publishedProjectId: null })
    })

    it('does nothing when they agree or when a side cannot be read', () => {
        expect(planSettings({ host: space(), local: space() })).toEqual({ patch: {}, notes: [] })
        expect(planSettings({ host: null, local: space() })).toEqual({ patch: {}, notes: [] })
        expect(readSettings({})).toBeNull()
    })
})
