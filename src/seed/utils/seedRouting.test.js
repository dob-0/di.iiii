import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SEED_SPACE_ID,
    SEED_PAGE_HUB,
    SEED_PAGE_PROJECT,
    SEED_PAGE_PROJECTS,
    buildSeedHubPath,
    buildSeedProjectPath,
    buildSeedProjectsPath,
    getSeedLocationState
} from './seedRouting.js'

describe('seedRouting', () => {
    it('builds compatibility and space-scoped seed paths', () => {
        expect(buildSeedHubPath()).toBe('/seed')
        expect(buildSeedHubPath('main')).toBe('/main/seed')
        expect(buildSeedProjectPath('demo-project')).toBe('/seed/projects/demo-project')
        expect(buildSeedProjectPath('demo-project', 'gallery')).toBe('/gallery/seed/projects/demo-project')
        expect(buildSeedProjectsPath()).toBe('/seed/projects')
        expect(buildSeedProjectsPath('gallery')).toBe('/gallery/seed/projects')
    })

    it('parses the compatibility seed routes as the default space seed', () => {
        expect(getSeedLocationState({ pathname: '/seed', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_HUB,
            projectId: null,
            spaceId: DEFAULT_SEED_SPACE_ID
        })

        expect(getSeedLocationState({ pathname: '/seed/projects/demo-project', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: DEFAULT_SEED_SPACE_ID
        })

        expect(getSeedLocationState({ pathname: '/seed/projects', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_PROJECTS,
            projectId: null,
            spaceId: DEFAULT_SEED_SPACE_ID
        })
    })

    it('parses space-scoped seed routes', () => {
        expect(getSeedLocationState({ pathname: '/gallery/seed', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_HUB,
            projectId: null,
            spaceId: 'gallery'
        })

        expect(getSeedLocationState({ pathname: '/gallery/seed/projects/demo-project', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_PROJECT,
            projectId: 'demo-project',
            spaceId: 'gallery'
        })

        expect(getSeedLocationState({ pathname: '/gallery/seed/projects', search: '' })).toEqual({
            isSeed: true,
            page: SEED_PAGE_PROJECTS,
            projectId: null,
            spaceId: 'gallery'
        })
    })
})
