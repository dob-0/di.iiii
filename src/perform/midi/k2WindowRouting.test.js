import { describe, expect, it } from 'vitest'
import { buildK2WindowPath, getK2WindowLocationState, isK2WindowLocation } from './k2WindowRouting.js'
import { getPerformLocationState } from '../performRouting.js'

describe('controller window route', () => {
    it('builds and reads /{space}/perform/{project}/k2', () => {
        expect(buildK2WindowPath('stage', 'show')).toBe('/stage/perform/show/k2')
        expect(getK2WindowLocationState({ pathname: '/stage/perform/show/k2' })).toEqual({ isK2Window: true, spaceId: 'stage', projectId: 'show' })
        expect(isK2WindowLocation(getK2WindowLocationState({ pathname: '/stage/perform/show/k2/' }))).toBe(true)
    })
    it('claims nothing else, and the Perform line stays three segments', () => {
        for (const pathname of ['/stage/perform/show', '/stage/perform/show/out', '/stage/map/show/k2', '/perform/show/k2', '/stage/perform/show/k2/x', '/']) {
            expect(getK2WindowLocationState({ pathname }).isK2Window, pathname).toBe(false)
        }
        expect(getPerformLocationState({ pathname: '/stage/perform/show/k2' }).isPerform).toBe(false)
    })
})
