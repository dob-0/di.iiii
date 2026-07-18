import { describe, expect, it } from 'vitest'
import {
    APP_PAGE_PREFERENCES,
    buildPreferencesPath,
    buildPublicProjectPath,
    buildVanityProjectPath,
    getAppLocationState,
    isReservedAppSegment
} from './spaceRouting.js'

describe('spaceRouting', () => {
    it('builds the admin route as the canonical control room path', () => {
        expect(buildPreferencesPath()).toBe('/admin')
        expect(buildPreferencesPath('main')).toBe('/admin?space=main')
    })

    it('treats both /admin and /preferences as the admin page', () => {
        expect(getAppLocationState(new URL('https://example.com/admin?space=main'))).toEqual({
            page: APP_PAGE_PREFERENCES,
            spaceId: 'main'
        })

        expect(getAppLocationState(new URL('https://example.com/preferences?space=debug-space'))).toEqual({
            page: APP_PAGE_PREFERENCES,
            spaceId: 'debug-space'
        })
    })

    it('builds direct project link paths', () => {
        expect(buildPublicProjectPath('br_id_ge', 'br-id-ge-hosq')).toBe('/br_id_ge/p/br-id-ge-hosq')
    })

    it('parses /:space/p/:projectId as a direct project link', () => {
        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p/br-id-ge-hosq'))).toEqual({
            page: 'editor',
            spaceId: 'br_id_ge',
            projectId: 'br-id-ge-hosq'
        })

        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p/'))).toEqual({
            page: 'editor',
            spaceId: 'br_id_ge'
        })
    })

    it('reserves product-owned route segments as space names', () => {
        expect(isReservedAppSegment('admin')).toBe(true)
        expect(isReservedAppSegment('beta')).toBe(true)
        expect(isReservedAppSegment('studio')).toBe(true)
        expect(isReservedAppSegment('gallery')).toBe(false)
    })

    // docs/architecture/SPEC_space_urls_and_portability.md — the bare
    // /{space}/{project} public link shape (resolved server-side, this only
    // classifies the URL).
    it('builds the vanity project link shape', () => {
        expect(buildVanityProjectPath('wcc', 'artistplace')).toBe('/wcc/artistplace')
    })

    it('classifies a bare two-segment path as a candidate project-slug route', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/artistplace'))).toEqual({
            page: 'editor',
            spaceId: 'wcc',
            projectSlugSegment: 'artistplace'
        })
    })

    it('never classifies /:space/studio or /:space/beta as a project-slug route — those are claimed earlier by Studio/Beta\'s own location parsers, but this must not misclassify them either as a defense-in-depth guard', () => {
        expect(getAppLocationState(new URL('https://example.com/somespace/studio')).projectSlugSegment).toBeUndefined()
        expect(getAppLocationState(new URL('https://example.com/somespace/beta')).projectSlugSegment).toBeUndefined()
    })

    it('does not classify the /p/ shape (even a bare trailing /p/) as a project-slug route', () => {
        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p')).projectSlugSegment).toBeUndefined()
        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p/some-id')).projectSlugSegment).toBeUndefined()
    })
})
