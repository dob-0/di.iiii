import { describe, expect, it } from 'vitest'
import {
    STUDIO_PAGE_SPACES,
    STUDIO_PAGE_HUB,
    STUDIO_PAGE_PROJECT,
    STUDIO_PAGE_DIRECTOR,
    DEFAULT_STUDIO_SPACE_ID,
    buildStudioDirectorPath,
    buildStudioHubPath,
    buildStudioSpacesPath,
    buildStudioProjectPath,
    buildLegacyStudioProjectPath,
    buildSpaceProjectsPath,
    buildSpacesPath,
    getStudioLocationState
} from './studioRouting.js'

describe('studioRouting', () => {
    it('builds the spaces index path and space-scoped Studio paths', () => {
        expect(buildStudioSpacesPath()).toBe('/studio')
        expect(buildStudioHubPath('main')).toBe('/main/studio')
        expect(buildStudioHubPath()).toBe('/main/studio')
        expect(buildStudioProjectPath('demo-project')).toBe('/studio/projects/demo-project')
        // Tool-free once the space is known — a project is a project, not a
        // thing that lives inside whichever editor you happen to be holding.
        expect(buildStudioProjectPath('demo-project', 'gallery')).toBe('/gallery/projects/demo-project')
    })

    it('parses /studio as the spaces index and space-scoped project routes', () => {
        // `legacySpacesAddress` is what heals the bar to `/spaces`. `/studio`
        // keeps working forever — it is bookmarked and typed — it just stops
        // being a second address that travels.
        expect(getStudioLocationState(new URL('https://example.com/studio'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_SPACES,
            projectId: null,
            legacySpacesAddress: true,
            spaceId: null
        })

        // …and the canonical one is NOT marked, or it would heal to itself.
        expect(getStudioLocationState(new URL('https://example.com/spaces')).legacySpacesAddress)
            .toBeUndefined()

        expect(getStudioLocationState(new URL('https://example.com/studio/projects/demo-project'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: null
        })
    })

    it('leaves spaceId unset for a space-less direct project link so StudioEditor falls back to the project\'s own space', () => {
        // Regression test: this branch used to hardcode DEFAULT_STUDIO_SPACE_ID,
        // which silently forced every direct project open (no space segment in
        // the URL) onto the 'main' space instead of the project's real space.
        const state = getStudioLocationState(new URL('https://example.com/studio/projects/demo-project'))
        expect(state.spaceId).toBeNull()
    })

    it('resolves the /open_jam short alias to the communal open-jam project', () => {
        // QR-/flyer-friendly entry point: `/open_jam` must open the exact same
        // editor state as the full `/open/studio/projects/open-jam` path, so a
        // stranger scanning the code lands straight in the shared jam.
        const alias = getStudioLocationState(new URL('https://example.com/open_jam'))
        expect(alias).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: 'open-jam',
            spaceId: 'open'
        })
        const canonical = getStudioLocationState(
            new URL('https://example.com/open/studio/projects/open-jam')
        )
        expect(alias.projectId).toBe(canonical.projectId)
        expect(alias.spaceId).toBe(canonical.spaceId)

        // A trailing slash is the same door.
        expect(
            getStudioLocationState(new URL('https://example.com/open_jam/'))
        ).toEqual(alias)
    })

    it('parses space-scoped Studio routes', () => {
        expect(getStudioLocationState(new URL('https://example.com/gallery/studio'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: 'gallery'
        })

        expect(getStudioLocationState(new URL('https://example.com/gallery/studio/projects/demo-project'))).toEqual({
            isStudio: true,
            legacyProjectAddress: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: 'gallery'
        })
    })

    it('parses the code-space director route', () => {
        expect(getStudioLocationState(new URL('https://example.com/algovrithm/studio/director'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_DIRECTOR,
            projectId: null,
            spaceId: 'algovrithm'
        })
    })

    // Anything deeper is not the director page. Without the !segments[3] guard
    // '/x/studio/director/anything' would resolve to it too, and a mistyped or
    // stale URL would open an authoring surface rather than falling through to
    // the hub — which is the safe destination for a path nobody defined.
    it('does not claim paths below the director route', () => {
        expect(getStudioLocationState(new URL('https://example.com/algovrithm/studio/director/extra'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: 'algovrithm'
        })
    })

    it('builds the director path it parses', () => {
        expect(getStudioLocationState(new URL(`https://example.com${buildStudioDirectorPath('algovrithm')}`)).page)
            .toBe(STUDIO_PAGE_DIRECTOR)
    })

    // The layered addresses. A space's projects belong to the space, not to whichever
    // tool you are holding — "back to projects" used to land on /{space}/raw/projects.

    it('builds the layered addresses', () => {
        expect(buildSpaceProjectsPath('wcc')).toBe('/wcc/projects')
        expect(buildSpacesPath()).toBe('/spaces')
    })

    it('parses /{space}/projects as that space\'s project list', () => {
        expect(getStudioLocationState(new URL('https://example.com/wcc/projects'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: 'wcc',
            wantsProjectList: true
        })
    })

    it('does NOT mark the bare /{space}/studio as a list — that one is the door', () => {
        expect(getStudioLocationState(new URL('https://example.com/open/studio')).wantsProjectList)
            .toBeUndefined()
    })

    it('parses /{space}/studio/projects as the list too', () => {
        const state = getStudioLocationState(new URL('https://example.com/open/studio/projects'))
        expect(state.page).toBe(STUDIO_PAGE_HUB)
        expect(state.spaceId).toBe('open')
        expect(state.wantsProjectList).toBe(true)
    })

    it('parses /spaces as the spaces list', () => {
        expect(getStudioLocationState(new URL('https://example.com/spaces'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_SPACES,
            projectId: null,
            spaceId: null
        })
    })

    it('round-trips both layered builders through the parser', () => {
        expect(getStudioLocationState(new URL(`https://example.com${buildSpaceProjectsPath('br_id_ge')}`)).spaceId).toBe('br_id_ge')
        expect(getStudioLocationState(new URL(`https://example.com${buildSpacesPath()}`)).page).toBe(STUDIO_PAGE_SPACES)
    })

    it('does not claim a lane name as a space', () => {
        // `/raw/projects` used to parse as the hub of a space called "raw" —
        // a space that can never exist, because the word is reserved. Both this
        // and `/studio/projects` rendered "Nothing lives at raw", and both are
        // documented addresses in the wiki. Studio's parser runs before Raw's,
        // so leaving `raw` alone here is what lets the Raw lane answer for it.
        expect(getStudioLocationState(new URL('https://example.com/raw/projects')).isStudio).toBe(false)
        expect(getStudioLocationState(new URL('https://example.com/beta/projects')).isStudio).toBe(false)
        expect(getStudioLocationState(new URL('https://example.com/wiki/projects')).isStudio).toBe(false)
    })

    it('parses /studio/projects as the default space\'s project list', () => {
        expect(getStudioLocationState(new URL('https://example.com/studio/projects'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: DEFAULT_STUDIO_SPACE_ID,
            wantsProjectList: true
        })
    })

    it('leaves every tool-named address working — nothing published can rot', () => {
        expect(getStudioLocationState(new URL('https://example.com/wcc/studio')).page).toBe(STUDIO_PAGE_HUB)
        expect(getStudioLocationState(new URL('https://example.com/studio')).page).toBe(STUDIO_PAGE_SPACES)
        expect(getStudioLocationState(new URL('https://example.com/wcc/studio/projects/abc')).projectId).toBe('abc')
    })

    // The deeper path was reserved by the 08-21 pass "so a future addressing
    // model can still use it". This is that model.
    it('parses /{space}/projects/{id} as the project itself', () => {
        expect(getStudioLocationState(new URL('https://example.com/wcc/projects/alla-virabyan'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: 'alla-virabyan',
            spaceId: 'wcc'
        })
    })

    it('round-trips the project builder through the parser', () => {
        const path = buildStudioProjectPath('demo-project', 'gallery')
        const state = getStudioLocationState(new URL(`https://example.com${path}`))
        expect(state.page).toBe(STUDIO_PAGE_PROJECT)
        expect(state.projectId).toBe('demo-project')
        expect(state.spaceId).toBe('gallery')
        // …and it is NOT marked legacy, or it would heal to itself forever.
        expect(state.legacyProjectAddress).toBeUndefined()
    })

    it('keeps the tool-named form working, and heals the bar off it', () => {
        const legacy = buildLegacyStudioProjectPath('demo-project', 'gallery')
        expect(legacy).toBe('/gallery/studio/projects/demo-project')
        const state = getStudioLocationState(new URL(`https://example.com${legacy}`))
        expect(state.page).toBe(STUDIO_PAGE_PROJECT)
        expect(state.projectId).toBe('demo-project')
        expect(state.spaceId).toBe('gallery')
        expect(state.legacyProjectAddress).toBe(true)
    })

    it('still claims nothing below a project', () => {
        expect(getStudioLocationState(new URL('https://example.com/wcc/projects/extra/deeper')).isStudio).toBe(false)
    })
})
