import { describe, expect, it } from 'vitest'
import {
    DEFAULT_STUDIO_SPACE_ID,
    STUDIO_PAGE_HUB,
    STUDIO_PAGE_PROJECT,
    buildStudioHubPath,
    buildStudioProjectPath,
    getStudioLocationState
} from './studioRouting.js'

describe('studioRouting', () => {
    it('builds compatibility and space-scoped Studio paths', () => {
        expect(buildStudioHubPath()).toBe('/studio')
        expect(buildStudioHubPath('main')).toBe('/main/studio')
        expect(buildStudioProjectPath('demo-project')).toBe('/studio/projects/demo-project')
        expect(buildStudioProjectPath('demo-project', 'gallery')).toBe('/gallery/studio/projects/demo-project')
    })

    it('parses the compatibility /studio route as the default space studio', () => {
        expect(getStudioLocationState(new URL('https://example.com/studio'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: DEFAULT_STUDIO_SPACE_ID
        })

        expect(getStudioLocationState(new URL('https://example.com/studio/projects/demo-project'))).toEqual({
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: DEFAULT_STUDIO_SPACE_ID
        })
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
})
