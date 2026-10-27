import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { planSettings, readSettings } = require('./followSettings.js')

const space = (over = {}) => ({ label: 'Laser', isPublic: false, publishedProjectId: null, ...over })

describe('planSettings — the space address (N1279)', () => {
    const at = (over = {}) => space({ id: 'dilijan', slug: 'dilijan', ...over })

    it('carries the address the host chose, apart from the patch', () => {
        const { patch, slug } = planSettings({ host: at({ slug: 'dilijan-camp' }), local: at() })
        expect(slug).toBe('dilijan-camp')
        expect(patch).toEqual({})
    })

    it('a host with no chosen address never clears this copy\'s', () => {
        expect(planSettings({ host: at(), local: at({ slug: 'dilijan-camp' }) }).slug).toBe(null)
        expect(planSettings({ host: at({ slug: null }), local: at({ slug: 'dilijan-camp' }) }).slug).toBe(null)
    })

    it('nothing to carry when both already agree', () => {
        expect(planSettings({ host: at({ slug: 'dilijan-camp' }), local: at({ slug: 'dilijan-camp' }) }).slug).toBe(null)
    })

    it('readSettings keeps the id and the slug', () => {
        expect(readSettings({ space: { id: 'dilijan', slug: 'dilijan-camp', label: 'D' } })).toMatchObject({ id: 'dilijan', slug: 'dilijan-camp' })
    })
})

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
        expect(planSettings({ host: space(), local: space() })).toEqual({ patch: {}, slug: null, notes: [] })
        expect(planSettings({ host: null, local: space() })).toEqual({ patch: {}, slug: null, notes: [] })
        expect(readSettings({})).toBeNull()
    })
})
