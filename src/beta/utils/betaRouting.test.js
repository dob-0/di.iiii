import { describe, expect, it } from 'vitest'
import {
    BETA_PAGE_HUB,
    BETA_PAGE_PROJECT,
    buildBetaHubPath,
    buildBetaProjectPath,
    getBetaLocationState
} from './betaRouting.js'

describe('betaRouting', () => {
    it('builds hidden beta paths', () => {
        expect(buildBetaHubPath()).toBe('/beta')
        expect(buildBetaProjectPath('demo-project')).toBe('/beta/projects/demo-project')
    })

    it('parses hub and project routes', () => {
        expect(getBetaLocationState({ pathname: '/beta', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_HUB,
            projectId: null
        })

        expect(getBetaLocationState({ pathname: '/beta/projects/demo-project', search: '' })).toEqual({
            isBeta: true,
            page: BETA_PAGE_PROJECT,
            projectId: 'demo-project'
        })
    })
})
