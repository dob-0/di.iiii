import { describe, expect, it } from 'vitest'
import {
    DEFAULT_BETA_SPACE_ID,
    BETA_PAGE_HUB,
    BETA_PAGE_PROJECT,
    buildBetaHubPath,
    buildBetaProjectPath,
    getBetaLocationState
} from './betaRouting.js'

describe('betaRouting', () => {
    it('builds compatibility and space-scoped beta paths', () => {
        expect(buildBetaHubPath()).toBe('/beta')
        expect(buildBetaHubPath('main')).toBe('/main/beta')
        expect(buildBetaProjectPath('demo-project')).toBe('/beta/projects/demo-project')
        expect(buildBetaProjectPath('demo-project', 'gallery')).toBe('/gallery/beta/projects/demo-project')
    })

    it('parses the compatibility beta routes as the default space beta', () => {
        expect(getBetaLocationState({ pathname: '/beta', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_HUB,
            projectId: null,
            spaceId: DEFAULT_BETA_SPACE_ID
        })

        expect(getBetaLocationState({ pathname: '/beta/projects/demo-project', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: DEFAULT_BETA_SPACE_ID
        })
    })

    it('parses space-scoped beta routes', () => {
        expect(getBetaLocationState({ pathname: '/gallery/beta', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_HUB,
            projectId: null,
            spaceId: 'gallery'
        })

        expect(getBetaLocationState({ pathname: '/gallery/beta/projects/demo-project', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: 'gallery'
        })
    })
})
