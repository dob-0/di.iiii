import { describe, expect, it } from 'vitest'
import {
    APP_PAGE_PREFERENCES,
    buildPreferencesPath,
    getAppLocationState
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
})
