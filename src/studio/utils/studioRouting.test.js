import { describe, expect, it } from 'vitest'
import {
    STUDIO_PAGE_SPACES,
    STUDIO_PAGE_HUB,
    STUDIO_PAGE_PROJECT,
    STUDIO_PAGE_DIRECTOR,
    buildStudioDirectorPath,
    buildStudioHubPath,
    buildStudioSpacesPath,
    buildStudioProjectPath,
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
        expect(buildStudioProjectPath('demo-project', 'gallery')).toBe('/gallery/studio/projects/demo-project')
    })

    it('parses /studio as the spaces index and space-scoped project routes', () => {
        expect(getStudioLocationState(new URL('https://example.com/studio'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_SPACES,
            projectId: null,
            spaceId: null
        })

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
            spaceId: 'wcc'
        })
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

    it('leaves every tool-named address working — nothing published can rot', () => {
        expect(getStudioLocationState(new URL('https://example.com/wcc/studio')).page).toBe(STUDIO_PAGE_HUB)
        expect(getStudioLocationState(new URL('https://example.com/studio')).page).toBe(STUDIO_PAGE_SPACES)
        expect(getStudioLocationState(new URL('https://example.com/wcc/studio/projects/abc')).projectId).toBe('abc')
    })

    it('does not mistake a deeper path for the projects list', () => {
        // /{space}/projects/{something} is NOT the list; only the bare two-segment
        // form is, so a future addressing model can still use the deeper path.
        expect(getStudioLocationState(new URL('https://example.com/wcc/projects/extra')).isStudio).toBe(false)
    })
})
