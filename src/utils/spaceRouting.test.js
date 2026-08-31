import { describe, expect, it } from 'vitest'
import {
    APP_PAGE_PREFERENCES,
    buildPreferencesPath,
    buildPublicProjectPath,
    buildProjectToolPath,
    buildVanityProjectPath,
    getAppLocationState,
    isProjectToolSegment,
    isReservedAppSegment
} from './spaceRouting.js'

describe('spaceRouting', () => {
    it('builds the admin route with the space in the PATH, not a query parameter', () => {
        expect(buildPreferencesPath()).toBe('/admin')
        // Was '/admin?space=main'. A space is the level that owns the thing being
        // administered, so it belongs in the path — not in a parameter you could
        // delete and still be left with a valid address.
        expect(buildPreferencesPath('main')).toBe('/main/admin')
    })

    it('parses /{space}/admin, and every alias of it', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/admin'))).toEqual({
            page: APP_PAGE_PREFERENCES,
            spaceId: 'wcc'
        })
        expect(getAppLocationState(new URL('https://example.com/wcc/preferences')).spaceId).toBe('wcc')
    })

    it('still parses the old /admin?space= form — links already in the wild must not rot', () => {
        expect(getAppLocationState(new URL('https://example.com/admin?space=main'))).toEqual({
            page: APP_PAGE_PREFERENCES,
            spaceId: 'main'
        })
    })

    it('does not read a deeper path as the admin page', () => {
        // Only the bare two-segment form. /{space}/admin/anything stays free.
        expect(getAppLocationState(new URL('https://example.com/wcc/admin/extra')).page)
            .not.toBe(APP_PAGE_PREFERENCES)
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

    it('never classifies /:space/studio or /:space/beta as a project-slug route — studio is claimed earlier by its own location parser, beta stays a reserved segment even though Beta itself was retired, and this must not misclassify either as a defense-in-depth guard', () => {
        expect(getAppLocationState(new URL('https://example.com/somespace/studio')).projectSlugSegment).toBeUndefined()
        expect(getAppLocationState(new URL('https://example.com/somespace/beta')).projectSlugSegment).toBeUndefined()
    })

    it('does not classify the /p/ shape (even a bare trailing /p/) as a project-slug route', () => {
        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p')).projectSlugSegment).toBeUndefined()
        expect(getAppLocationState(new URL('https://example.com/br_id_ge/p/some-id')).projectSlugSegment).toBeUndefined()
    })

    // The tool doorway — append one word to a project link and it opens there.
    // Before this existed, every one of these URLs silently rendered the published
    // page and the address bar lied about what you were looking at.

    it('builds the doorway by appending the tool to a project link', () => {
        expect(buildProjectToolPath('wcc', 'artistplace', 'studio')).toBe('/wcc/artistplace/studio')
        expect(buildProjectToolPath('wcc', 'artistplace', 'raw')).toBe('/wcc/artistplace/raw')
    })

    it('knows the two doorway words and nothing else', () => {
        expect(isProjectToolSegment('studio')).toBe(true)
        expect(isProjectToolSegment('raw')).toBe(true)
        expect(isProjectToolSegment('STUDIO')).toBe(true)
        expect(isProjectToolSegment('beta')).toBe(false)
        expect(isProjectToolSegment('seed')).toBe(false)
        expect(isProjectToolSegment('')).toBe(false)
    })

    it('reads a trailing tool word as a doorway onto the project', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/artistplace/studio'))).toEqual({
            page: 'editor',
            spaceId: 'wcc',
            projectSlugSegment: 'artistplace',
            toolSegment: 'studio'
        })
        expect(getAppLocationState(new URL('https://example.com/wcc/artistplace/raw')).toolSegment).toBe('raw')
    })

    it('leaves the plain two-segment shape byte-identical — no doorway keys appear on a URL whose behaviour did not change', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/artistplace'))).toEqual({
            page: 'editor',
            spaceId: 'wcc',
            projectSlugSegment: 'artistplace'
        })
    })

    it('marks an unrecognised tail rather than silently dropping it', () => {
        const state = getAppLocationState(new URL('https://example.com/wcc/artistplace/banana'))
        expect(state.toolSegment).toBeUndefined()
        expect(state.hasUnknownTail).toBe(true)
        expect(state.projectSlugSegment).toBe('artistplace')
    })

    it('honours a tool word only as the LAST segment — /project/studio/extra is a tail, not a doorway', () => {
        const state = getAppLocationState(new URL('https://example.com/wcc/artistplace/studio/extra'))
        expect(state.toolSegment).toBeUndefined()
        expect(state.hasUnknownTail).toBe(true)
    })

    it('opens the doorway on the /p/ form too, so appending the tool works on the permanent link as well as the pretty one', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/p/some-id/studio'))).toEqual({
            page: 'editor',
            spaceId: 'wcc',
            projectId: 'some-id',
            toolSegment: 'studio'
        })
        expect(getAppLocationState(new URL('https://example.com/wcc/p/some-id/raw')).toolSegment).toBe('raw')
    })

    it('leaves the plain /p/ shape untouched — the two live prod links use it', () => {
        expect(getAppLocationState(new URL('https://example.com/main/p/main-dii-project'))).toEqual({
            page: 'editor',
            spaceId: 'main',
            projectId: 'main-dii-project'
        })
    })

    it('never turns /:space/studio into a doorway — a space-level lane is claimed by its own parser, and a project can never be named studio or raw anyway', () => {
        expect(getAppLocationState(new URL('https://example.com/wcc/studio')).toolSegment).toBeUndefined()
        expect(getAppLocationState(new URL('https://example.com/wcc/raw')).toolSegment).toBeUndefined()
    })
})
