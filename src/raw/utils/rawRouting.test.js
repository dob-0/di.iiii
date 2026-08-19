import { describe, expect, it } from 'vitest'
import {
    DEFAULT_RAW_SPACE_ID,
    RAW_PAGE_HUB,
    RAW_PAGE_PROJECT,
    RAW_PAGE_OUT,
    RAW_PAGE_PROJECTS,
    buildRawHubPath,
    buildRawOutPath,
    buildRawProjectPath,
    buildRawProjectsPath,
    getRawLocationState
} from './rawRouting.js'

describe('rawRouting', () => {
    it('builds compatibility and space-scoped seed paths', () => {
        expect(buildRawHubPath()).toBe('/raw')
        expect(buildRawHubPath('main')).toBe('/main/raw')
        expect(buildRawProjectPath('demo-project')).toBe('/raw/projects/demo-project')
        expect(buildRawProjectPath('demo-project', 'gallery')).toBe('/gallery/raw/projects/demo-project')
        expect(buildRawProjectsPath()).toBe('/raw/projects')
        expect(buildRawProjectsPath('gallery')).toBe('/gallery/raw/projects')
    })

    it('parses the compatibility seed routes as the default space seed', () => {
        expect(getRawLocationState({ pathname: '/raw', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_HUB,
            projectId: null,
            spaceId: DEFAULT_RAW_SPACE_ID,
            isDefaultSpace: true
        })

        expect(getRawLocationState({ pathname: '/raw/projects/demo-project', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: DEFAULT_RAW_SPACE_ID,
            isDefaultSpace: true
        })

        expect(getRawLocationState({ pathname: '/raw/projects', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_PROJECTS,
            projectId: null,
            spaceId: DEFAULT_RAW_SPACE_ID,
            isDefaultSpace: true
        })
    })

    it('parses space-scoped seed routes', () => {
        expect(getRawLocationState({ pathname: '/gallery/raw', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_HUB,
            projectId: null,
            spaceId: 'gallery'
        })

        expect(getRawLocationState({ pathname: '/gallery/raw/projects/demo-project', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: 'gallery'
        })

        expect(getRawLocationState({ pathname: '/gallery/raw/projects', search: '' })).toEqual({
            isRaw: true,
            isLegacyPath: false,
            page: RAW_PAGE_PROJECTS,
            projectId: null,
            spaceId: 'gallery'
        })
    })
})

describe('legacy /seed paths', () => {
    // The lane was called Seed until 2026-07-30. Old links must keep resolving,
    // and must be flagged so the router can heal the URL to /raw.
    it('resolves a bare /seed hub and marks it legacy', () => {
        expect(getRawLocationState({ pathname: '/seed' })).toEqual({
            isRaw: true,
            isLegacyPath: true,
            page: RAW_PAGE_HUB,
            projectId: null,
            spaceId: 'main',
            isDefaultSpace: true
        })
    })

    it('resolves a space-scoped /{space}/seed', () => {
        expect(getRawLocationState({ pathname: '/gallery/seed' })).toEqual({
            isRaw: true,
            isLegacyPath: true,
            page: RAW_PAGE_HUB,
            projectId: null,
            spaceId: 'gallery'
        })
    })

    it('keeps deep-linked legacy project routes intact', () => {
        expect(getRawLocationState({ pathname: '/gallery/seed/projects/abc' })).toEqual({
            isRaw: true,
            isLegacyPath: true,
            page: RAW_PAGE_PROJECT,
            projectId: 'abc',
            spaceId: 'gallery'
        })
    })

    it('does not flag the new /raw paths as legacy', () => {
        expect(getRawLocationState({ pathname: '/raw' }).isLegacyPath).toBe(false)
        expect(getRawLocationState({ pathname: '/gallery/raw' }).isLegacyPath).toBe(false)
    })

    it('still ignores unrelated paths', () => {
        expect(getRawLocationState({ pathname: '/studio' }).isRaw).toBe(false)
        expect(getRawLocationState({ pathname: '/seedling' }).isRaw).toBe(false)
    })
})

// The defaulted-space flag is what lets RootApp bend a bare typed /raw toward
// a space the session can actually enter (LaneDefaultSpace). A URL that NAMES
// its space is a deliberate address and must never carry the flag.
describe('isDefaultSpace', () => {
    it('marks only the routes whose space came from the default', () => {
        expect(getRawLocationState({ pathname: '/raw' }).isDefaultSpace).toBe(true)
        expect(getRawLocationState({ pathname: '/raw/projects' }).isDefaultSpace).toBe(true)
        expect(getRawLocationState({ pathname: '/gallery/raw' }).isDefaultSpace).toBeUndefined()
        expect(getRawLocationState({ pathname: '/gallery/raw/projects/abc' }).isDefaultSpace).toBeUndefined()
    })
})

// The projector cable: /out is an address a show machine can hold fullscreen.
describe('the /out route', () => {
    it('parses a project out route, spaceful and default-space', () => {
        expect(getRawLocationState({ pathname: '/gallery/raw/projects/abc/out' })).toMatchObject({
            isRaw: true,
            page: RAW_PAGE_OUT,
            projectId: 'abc',
            spaceId: 'gallery'
        })
        expect(getRawLocationState({ pathname: '/raw/projects/abc/out' })).toMatchObject({
            page: RAW_PAGE_OUT,
            projectId: 'abc',
            spaceId: DEFAULT_RAW_SPACE_ID,
            isDefaultSpace: true
        })
    })

    it("parses a space canvas out route — the local desk's own projector", () => {
        expect(getRawLocationState({ pathname: '/open/raw/out' })).toMatchObject({
            page: RAW_PAGE_OUT,
            projectId: null,
            spaceId: 'open'
        })
        expect(getRawLocationState({ pathname: '/raw/out' })).toMatchObject({
            page: RAW_PAGE_OUT,
            projectId: null,
            spaceId: DEFAULT_RAW_SPACE_ID
        })
    })

    it('carries ?scope= through so a container room can be the output', () => {
        expect(getRawLocationState({ pathname: '/open/raw/out', search: '?scope=node-9' }).scopeId).toBe('node-9')
        expect(getRawLocationState({ pathname: '/gallery/raw/projects/abc/out', search: '' }).scopeId).toBeNull()
    })

    it('builds out paths with and without a project and scope', () => {
        expect(buildRawOutPath('abc', 'gallery')).toBe('/gallery/raw/projects/abc/out')
        expect(buildRawOutPath('abc')).toBe('/raw/projects/abc/out')
        expect(buildRawOutPath(null, 'open')).toBe('/open/raw/out')
        expect(buildRawOutPath(null, 'open', { scopeId: 'geo-1' })).toBe('/open/raw/out?scope=geo-1')
    })

    it('an /out segment never bleeds into the project route parse', () => {
        expect(getRawLocationState({ pathname: '/gallery/raw/projects/abc' }).page).toBe(RAW_PAGE_PROJECT)
    })
})
