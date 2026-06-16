import { describe, expect, it } from 'vitest'
import {
    APP_PAGE_PREFERENCES,
    buildPreferencesPath,
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

    it('reserves product-owned route segments as space names', () => {
        expect(isReservedAppSegment('admin')).toBe(true)
        expect(isReservedAppSegment('beta')).toBe(true)
        expect(isReservedAppSegment('studio')).toBe(true)
        expect(isReservedAppSegment('gallery')).toBe(false)
    })
})
